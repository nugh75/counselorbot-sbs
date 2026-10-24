"""Admin «Recupero documenti»: embedding provider, model, mode and index status.

Same guards as the other AI settings (admin only, private no-store responses,
browser-only mutations). Key status is presence only: values are never read
into a response. A test embeds a fixed, non-personal sentence.
"""
import time
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..db_compat import xact_lock
from .. import embedding_service, models, rag_reindex_job
from ..ai_service import AIError, AIService
from ..api_secrets import API_KEY_ENV_MAP, environment_secret
from ..database import get_db
from ..rag_index import _embedding_cooldown, _embedding_key, collection_exists, get_index, list_collections
from . import external_privacy
from .chatgpt import browser_mutation
from .personal_api import PrivateRoute, require_admin

router = APIRouter(route_class=PrivateRoute)
KEYS = ('embedding_provider', 'embedding_model', 'embedding_dimensions', 'rag_retrieval_mode')
# Models offered in the panel; any other model name of the provider can be typed.
SUGGESTED_MODELS = {
    'ollama': ['qwen3-embedding:4b', 'bge-m3', 'nomic-embed-text'],
    'mistral': ['mistral-embed'],
    'openrouter': ['google/gemini-embedding-2', 'qwen/qwen3-embedding-8b', 'mistralai/mistral-embed-2312'],
    'none': [],
}
# Fixed, fictitious and non-personal: the test never sends user data.
TEST_TEXT = "Strategie di studio: pianificare il tempo e ripassare con regolarità."


class RetrievalUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    provider: Literal['ollama', 'mistral', 'openrouter', 'none']
    model: str = Field(default='', max_length=200)
    dimensions: str = Field(default='', max_length=6)
    mode: Literal['hybrid', 'lexical', 'vector']


def _values(db):
    rows = db.query(models.Config).filter(models.Config.key.in_(KEYS)).all()
    return {row.key: row.value for row in rows}


def _collection_status(ai_service, item):
    index = get_index(item['id'])
    if not index._loaded:
        index._load_from_disk()
    stats = index.stats()
    return {
        'id': item['id'], 'label': item['label'], 'builtin': item['builtin'],
        'api_publishable': item['api_publishable'],
        'vectors_allowed': index._vectors_allowed(ai_service),
        'vectors_match': bool(stats['vectors_available']
                              and stats['embedding_model'] == _embedding_key(ai_service)
                              and stats['embedding_provider'] == ai_service.embedding_provider),
        **{key: stats[key] for key in ('building', 'last_build_error', 'n_chunks', 'n_sources',
                                       'lexical_available', 'vectors_available', 'embedding_provider',
                                       'embedding_model', 'embedding_dimensions', 'built_at')},
    }


def state(db):
    ai_service = AIService(db)
    config = ai_service.config
    try:
        provider, model, dimensions = embedding_service.options(config)
    except embedding_service.EmbeddingError:
        provider, model, dimensions = (config.get('embedding_provider') or 'ollama'), '', None
    privacy = external_privacy.settings(db)
    external = embedding_service.is_external(provider)
    ner = embedding_service.ner_status(config)
    fallback = (config.get('external_pii_fallback') or 'block').strip().lower()
    return {
        'provider': provider,
        'model': model,
        'dimensions': dimensions,
        # Advisory: a valid but unusual size (e.g. 786 typed for 768).
        'dimensions_warning': embedding_service.dimensions_warning(provider, model, dimensions),
        # Query embeddings paused after a provider error: search uses keywords meanwhile.
        'semantic_suspended_seconds': _embedding_cooldown.remaining(_embedding_key(ai_service)),
        'mode': embedding_service.retrieval_mode(config),
        'providers': [{
            'id': pid,
            'external': embedding_service.is_external(pid),
            'default_model': embedding_service.DEFAULT_MODELS.get(pid, ''),
            'models': SUGGESTED_MODELS[pid],
            'key_env': list(API_KEY_ENV_MAP[pid]) if pid in API_KEY_ENV_MAP else [],
            # Presence only: the value never leaves this function.
            'key_present': bool(environment_secret(pid)[0]) if pid in API_KEY_ENV_MAP else None,
        } for pid in ('ollama', 'mistral', 'openrouter', 'none')],
        'privacy': {
            'mode': privacy['mode'],
            'ner_model': privacy['local_model'],
            'ner_status': ner,
            # External queries depend on a reachable local NER detector.
            'ner_required': external and ner != 'disabled' and fallback == 'block',
            'queries_blocked': external and ner == 'unreachable' and fallback == 'block',
        },
        'collections': [_collection_status(ai_service, item) for item in list_collections()],
        'reindex_job': rag_reindex_job.read_state(),
    }


@router.get('/admin/document-retrieval')
def read_settings(identity=Depends(require_admin), db: Session = Depends(get_db)):
    return state(db)


@router.put('/admin/document-retrieval', dependencies=[Depends(browser_mutation)])
def update_settings(request: RetrievalUpdate, identity=Depends(require_admin), db: Session = Depends(get_db)):
    model = request.model.strip() or embedding_service.DEFAULT_MODELS.get(request.provider, '')
    dimensions = request.dimensions.strip()
    if request.provider in ('ollama', 'none'):
        dimensions = ''
    values = {'embedding_provider': request.provider, 'embedding_model': model,
              'embedding_dimensions': dimensions, 'rag_retrieval_mode': request.mode}
    try:
        for key, value in values.items():
            embedding_service.validate_config(key, value)
        embedding_service.options(values)
    except (ValueError, embedding_service.EmbeddingError) as exc:
        raise HTTPException(400, 'Invalid document retrieval settings') from exc
    if ((request.provider == 'mistral' and dimensions not in ('', '1024'))
            or (model == 'google/gemini-embedding-2' and dimensions and int(dimensions) > 3072)):
        raise HTTPException(400, 'Invalid document retrieval settings')
    # Serialize the four-key update, including a first save before seed rows.
    xact_lock(db, 414216)
    for key, value in values.items():
        row = db.get(models.Config, key)
        # Keep the existing description of seeded rows.
        db.merge(models.Config(key=key, value=value, description=row.description if row else None))
    db.commit()
    return state(db)


def _test(db):
    ai_service = AIService(db)
    result = {'provider': ai_service.embedding_provider, 'model': ai_service.embedding_model}
    if embedding_service.is_external(ai_service.embedding_provider):
        # Local check of the external query filter (NER included): no provider call.
        try:
            embedding_service.filter_external_query(ai_service.config, [TEST_TEXT])
            result['query_filter'] = 'ok'
        except embedding_service.EmbeddingError as exc:
            result['query_filter'] = exc.code
    started = time.monotonic()
    try:
        vectors = ai_service.embed_texts([TEST_TEXT], purpose='document', public_corpus=True)
    except AIError as exc:
        return {**result, 'ok': False, 'error': exc.code or 'embedding_unavailable'}
    return {**result, 'ok': True, 'dimensions': len(vectors[0]) if vectors else 0,
            'elapsed_ms': int((time.monotonic() - started) * 1000)}


@router.post('/admin/document-retrieval/test', dependencies=[Depends(browser_mutation)])
async def test_settings(identity=Depends(require_admin), db: Session = Depends(get_db)):
    return await run_in_threadpool(_test, db)


def _require_collection(collection: str) -> str:
    if not collection_exists(collection):
        raise HTTPException(404, 'Collection not found')
    return collection


@router.get('/admin/document-retrieval/collections/{collection}/estimate')
async def estimate(collection: str, identity=Depends(require_admin), db: Session = Depends(get_db)):
    index = get_index(_require_collection(collection))
    return await run_in_threadpool(index.estimate_reindex, AIService(db))


@router.post('/admin/document-retrieval/collections/{collection}/reindex', dependencies=[Depends(browser_mutation)])
async def reindex(collection: str, identity=Depends(require_admin), db: Session = Depends(get_db)):
    index = get_index(_require_collection(collection))
    ai_service = AIService(db)
    started = await run_in_threadpool(index.start_build, ai_service)
    if not started and not index._building:
        # Another collection or «Reindicizza tutto» holds the build reservation.
        raise HTTPException(409, 'Another index build is running')
    return {'status': 'building', 'collection': _collection_status(
        ai_service, next(c for c in list_collections() if c['id'] == collection))}


def _estimate_all(ai_service):
    rows = [{'id': item['id'], 'label': item['label'], **get_index(item['id']).estimate_reindex(ai_service)}
            for item in list_collections()]
    paid = [row for row in rows if row['input_count']]
    known = all(row['price_known'] for row in paid)
    return {
        'input_count': sum(row['input_count'] for row in rows),
        'estimated_tokens': sum(row['estimated_tokens'] for row in rows),
        'estimated_cost_usd': sum(row['estimated_cost_usd'] or 0 for row in paid) if known else None,
        'price_known': known,
        'collections': [{key: row[key] for key in ('id', 'label', 'input_count', 'estimated_tokens',
                                                   'estimated_cost_usd', 'price_known', 'vectors_allowed')}
                        for row in rows],
    }


@router.get('/admin/document-retrieval/estimate')
async def estimate_all(identity=Depends(require_admin), db: Session = Depends(get_db)):
    """Total offline estimate for «Reindicizza tutto»: no provider call."""
    return await run_in_threadpool(_estimate_all, AIService(db))


@router.get('/admin/document-retrieval/reindex-all')
def reindex_all_status(identity=Depends(require_admin)):
    return rag_reindex_job.read_state()


@router.post('/admin/document-retrieval/reindex-all', dependencies=[Depends(browser_mutation)])
async def reindex_all(identity=Depends(require_admin), db: Session = Depends(get_db)):
    """Start one sequential job over every collection; idempotent while it runs."""
    started, job, reason = await run_in_threadpool(rag_reindex_job.start, AIService(db), list_collections())
    return {'started': started, 'job': job, 'reason': reason}
