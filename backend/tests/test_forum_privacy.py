"""Architectural privacy gate: forum data has only the forum HTTP consumer."""
import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORUM_FILES = {"backend.routes.forum", "backend.forum_schemas"}
FORUM_SYMBOLS = {"ForumTopic", "ForumPost", "ForumRead", "ForumModerationLog", "ForumMute",
                 "forum_topics", "forum_posts", "forum_reads", "forum_moderation_log", "forum_mutes"}


def module_path(name):
    path = ROOT.parent.joinpath(*name.split('.')).with_suffix('.py')
    return path if path.is_file() else None


def imports(name, source, *, nested=False):
    tree = ast.parse(source)
    nodes = ast.walk(tree) if nested else tree.body
    result = set()
    package = name.split('.')[:-1]
    for node in nodes:
        if isinstance(node, ast.Import):
            result.update(alias.name for alias in node.names if alias.name.startswith('backend.'))
        elif isinstance(node, ast.ImportFrom):
            base = '.'.join(package[:len(package) - node.level + 1]) if node.level else ''
            target = '.'.join(part for part in (base, node.module) if part)
            candidates = [target] + [f'{target}.{alias.name}' for alias in node.names]
            result.update(candidate for candidate in candidates if module_path(candidate))
    return result


def test_forum_import_graph_has_no_ai_rag_context_or_export_path():
    seen = set()
    pending = list(FORUM_FILES)
    while pending:
        name = pending.pop()
        if name in seen:
            continue
        seen.add(name)
        # Shared infrastructure exposes unrelated functions with lazy imports.
        # Only its module initialization runs on the forum route; forum-owned
        # modules are checked at every depth, including future lazy imports.
        source = module_path(name).read_text()
        if name in FORUM_FILES:
            for node in ast.walk(ast.parse(source)):
                if isinstance(node, ast.Import):
                    external = [alias.name for alias in node.names]
                elif isinstance(node, ast.ImportFrom) and not node.level:
                    external = [node.module or '']
                else:
                    external = []
                assert all(item.split('.')[0] not in {
                    'openai', 'anthropic', 'google', 'mistralai', 'ollama', 'httpx',
                    'requests', 'urllib', 'aiohttp', 'socket', 'subprocess', 'importlib',
                } for item in external), f'Forum provider/network dependency in {name}'
                if isinstance(node, ast.Name):
                    assert node.id not in {'__import__', 'get_personal_ai_db'}
        pending.extend(imports(name, source, nested=name in FORUM_FILES) - seen)
    assert seen == {
        "backend.routes.forum",
        "backend.forum_schemas",
        "backend.auth",
        "backend.database",
        "backend.models",
        "backend.group_visibility",
        "backend.class_tools",
        "backend.class_access",
    }
    route = ast.parse(module_path("backend.routes.forum").read_text())
    db_references = {node.attr for node in ast.walk(route) if isinstance(node, ast.Attribute)
                     and isinstance(node.value, ast.Name) and node.value.id == 'database'}
    assert db_references == {'get_db'}, "Forum must never use the personal AI database dependency"


def test_no_non_forum_consumer_can_read_forum_models_or_tables():
    violations = []
    allowed = {"models.py", "forum_schemas.py", "routes/forum.py"}
    for path in ROOT.rglob('*.py'):
        relative = path.relative_to(ROOT)
        if relative.parts[0] in {'tests', '.venv'} or str(relative) in allowed:
            continue
        tree = ast.parse(path.read_text())
        # Class settings may append metadata-only option changes to the log.
        # Permit only this constructor, never log queries or content consumers.
        metadata_log_constructors = {
            id(node.func) for node in ast.walk(tree) if relative == Path('routes/groups.py')
            and isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
            and isinstance(node.func.value, ast.Name) and node.func.value.id == 'models'
            and node.func.attr == 'ForumModerationLog'
            and not node.args and {kw.arg for kw in node.keywords} == {
                'group_id', 'actor_username', 'action', 'target_kind', 'reason'}
            and any(kw.arg == 'action' and isinstance(kw.value, ast.Constant)
                    and kw.value.value == 'settings_change' for kw in node.keywords)
        }
        for node in ast.walk(tree):
            if id(node) in metadata_log_constructors:
                continue
            value = node.id if isinstance(node, ast.Name) else node.attr if isinstance(node, ast.Attribute) else node.name if isinstance(node, ast.alias) else node.value if isinstance(node, ast.Constant) else None
            if isinstance(value, str) and any(token in value for token in FORUM_SYMBOLS):
                violations.append(f'{relative}:{node.lineno}')
        name = 'backend.' + '.'.join(relative.with_suffix('').parts)
        # main may register the router, but may not consume forum data.
        if relative != Path('main.py') and imports(name, path.read_text(), nested=True) & FORUM_FILES:
            violations.append(f'{relative}:forum import')
    assert not violations, f'Forum data reached a non-forum consumer: {violations}'


def test_exports_and_pdf_do_not_query_or_include_forum_content():
    import asyncio
    from sqlalchemy import event
    from backend import models
    from backend.routes import admin, survey
    from backend.pdf_generator import generate_questionnaire_pdf
    from backend.tests.artifact_database import artifact_session

    with artifact_session() as db:
        group = models.StudentGroup(code='GR-PRIVACY', name='Synthetic privacy class', owner_username='owner')
        db.add(group)
        db.flush()
        topic = models.ForumTopic(group_id=group.id, title='FORUM_PRIVATE_TITLE_C4', body='FORUM_PRIVATE_BODY_C4',
                                  author_username='owner', author_display_name='FORUM_PRIVATE_NAME_C4')
        db.add(topic)
        db.flush()
        db.add(models.ForumPost(topic_id=topic.id, author_username='student', author_display_name='Student', body='FORUM_PRIVATE_REPLY_C4'))
        db.commit()
        statements = []
        connection = db.get_bind()
        def record_sql(_, __, statement, ___, ____, _____):
            statements.append(statement.lower())
        event.listen(connection, 'before_cursor_execute', record_sql)
        try:
            identity = {'username': 'owner', 'is_admin': True, 'is_researcher': False}
            research = asyncio.run(survey.export_validation_csv(instrument_code=None, locale=None, version_label=None, current_user=identity, db=db))
            results = asyncio.run(survey.get_questionnaire_results(questionnaire_type=None, current_user=identity, db=db))
            assert results == []
            training = asyncio.run(admin.admin_export_training_jsonl(instrument_code=None, locale=None, phase=None, status=None, current_user=identity, db=db))
            logs = asyncio.run(admin.export_logs(format='json', current_user=identity, db=db))
            pdf = generate_questionnaire_pdf(questionnaire_type='QSA', scores={}, session_id='synthetic', submitted_at=None,
                                             summary_text='Synthetic summary', messages=[], language='en')
            payloads = [research.body, logs.body, training.body, pdf.getvalue()]
            assert all(b'FORUM_PRIVATE_' not in payload for payload in payloads)
            assert all(not any(table in statement for table in ['forum_topics', 'forum_posts', 'forum_reads', 'forum_moderation_log']) for statement in statements)
        finally:
            event.remove(connection, 'before_cursor_execute', record_sql)
