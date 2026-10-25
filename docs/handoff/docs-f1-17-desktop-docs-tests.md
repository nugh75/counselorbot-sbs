# F1-17 — s73-f1-17-docs

## Stato
Consegna verificata localmente; branch `docs/f1-17-desktop-docs-tests`.
Base `2220ef99` = origin/main alla partenza; issue #213.
Task `a8f4b202-cc7b-42de-ae42-1eef04bdbc22`.

## Fatto
- Guida docente IT: bundle/sha256, pannello, tunnel, LLM, backup/rollback e problemi.
- DPIA L2 collegata a P16 e P6/P7/P11, con [DA VALIDARE]; checklist manuale.
- Lifecycle `--full`: lifespan reale, schema/seed/FK/integrità e API health.
- CI quattro OS in modalità completa; regressioni auth/pairing/profilo/backup Linux.
- F1-17 completato; F1-16 confermato; F1-15 packaging completo, Release ancora parziale.

## Verifiche
- Python 3.11.9 + TEST_DB=sqlite: 173 passati, nessun nuovo fallimento.
- Node: 14/14; Bash, YAML e link Markdown validi; diff senza whitespace errati.
- Preparato commit test(desktop): controllore dati e lifecycle completo.
- Primo lancio Python 3.9 non supportato: ripetuto con ambiente corretto.
- Guida sei lingue/screenshot rivisti: nessun controllo web modificato.
- guidance-refresh/check in corso; installer nativi da verificare con CI.

## Prossimi passi
- Commit separati docs/test/ci, push, PR con milestone e board CounselorBot.
- Leggere check PR e notificare Timoniere; nessun merge.

## Blocchi e rischi
- Fase 1 aperta: UI docente/pairing/dispositivi e pubblicazione Release mancanti;
  portachiavi reali, tunnel nominativo e prove OS richiedono checklist manuale.
- Bug registrato LOCAL `302912bf-1be6-4bd7-85b4-bf22a7e65d00`, sospetto,
  sync not-linked; non è una issue GitHub. Nessun bug NOT_REGISTERED.
- Nessun Docker rebuild necessario (solo documenti/test/CI), deploy o dev avviato.
