# Traduzioni del catalogo attraverso il provider AI configurato

Data: 16 ottobre 2026. Ambito: traduzioni editoriali del catalogo certificato
(strategie e letture), degli strumenti (nome, fattori, item, etichette di
risposta) e delle descrizioni dei counselor.

## Prima

La traduzione era cablata su Ollama: `backend/counselor_i18n.py`,
`backend/certified_translation.py`, `backend/instrument_translation.py` e
`scripts/translate_*.py` costruivano un `POST {OLLAMA_BASE_URL}/api/chat` a
mano. Senza Ollama il pulsante «Traduci» del catalogo rispondeva 502 con
«Traduzione non disponibile» e gli script fallivano.

## Adesso

`backend/translation_provider.py` risolve provider e modello e passa la
richiesta a `AIService`, cioe' alle stesse regole della chat: provider attivo in
Amministrazione, chiavi di sistema, ripieghi configurati, budget mensile,
politica privacy per i provider esterni. Non c'e' piu' un trasporto Ollama
dedicato.

I testi tradotti sono **contenuti editoriali**, non dati degli utenti: possono
quindi uscire verso un provider esterno, come il resto del corpus pubblico
(vedi `docs/operations/audit-ollama-dependencies.md` §3).

### Risoluzione di provider e modello

1. Preset esplicito: `translation_provider` (env `TRANSLATION_PROVIDER`) e
   `translation_model` (env `TRANSLATION_MODEL`) per le sole traduzioni.
2. Senza preset: provider attivo (`active_provider`) e modello attivo
   (`model_name`) in Amministrazione.
3. `COUNSELOR_TRANSLATE_MODEL` resta accettato come nome del modello, per non
   rompere gli script esistenti.

Se non c'e' alcun provider, se il provider e' sconosciuto o se manca la chiave
di sistema per un provider esterno, `resolve_target` solleva
`TranslationUnavailable` con un messaggio leggibile. La route
`POST /admin/certified-strategies/{id}/translate` risponde **503** con quel
messaggio (502 resta per gli altri errori di traduzione). I preset sono comuni
righe di `Config`, impostabili dall'amministratore con
`POST /admin/config` o da variabili d'ambiente.

### Punti d'ingresso aggiornati

- `backend/certified_translation.py` — `default_translator` (era
  `ollama_translator`).
- `backend/instrument_translation.py` — `configured_translator`; il prompt e'
  `item_prompt`, il trasporto e' in `translation_provider`.
- `backend/counselor_i18n.py` — `configured_translator` e
  `build_description_prompt`; `generate_translations(db, text, context)` prende
  ora la sessione DB, non piu' base URL e modello.
- `scripts/translate_certified_content.py`, `scripts/translate_instruments.py`,
  `scripts/translate_tavolo_presets.py` — usano i nuovi traduttori; non serve
  piu' passare `OLLAMA_BASE_URL`.

`COUNSELOR_TRANSLATE_DISABLED` resta invariato: con `1`/`true`/`yes` la
traduzione automatica delle descrizioni dei counselor non parte.

## Test

`backend/tests/test_translation_provider.py` — provider esterno finto
(`AIService._call_mistral` sostituito), nessuna chiamata di rete:

- catalogo e strumenti tradotti dal provider configurato, provenienza
  `llm:<provider>/<model>`;
- preset che prevale sul provider attivo;
- errore chiaro senza provider e con chiave mancante;
- parsing del JSON anche con code fence o testo attorno.

I test esistenti (`test_certified_translation.py`,
`test_instrument_translation.py`) restano validi: iniettano il traduttore e non
toccano la rete.

Esecuzione isolata con un Postgres di prova (mai la produzione):

    docker run --rm -v "$PWD":/app -w /app \
      -e DATABASE_URL='postgresql://<user>:<pw>@host.docker.internal:55443/counselorbot_test' \
      -e COUNSELOR_TRANSLATE_DISABLED=1 -e ADMIN_SYNC_DISABLED=1 \
      --entrypoint python counselorbot-portable-counselorbot-backend:latest \
      -m pytest backend/tests/test_translation_provider.py -q

## Limiti

- Nessuna chiamata reale a un provider esterno: costi e qualita' delle
  traduzioni non sono verificati qui.
- Nessun modello di embedding toccato: `embed_texts`/`embed_query` restano
  invariati.
