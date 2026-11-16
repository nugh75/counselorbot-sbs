# Handoff fix/class-cover-validation-984
## Stato
Completo, PR da aprire.
## Fatto
- `backend/routes/groups.py`: image_url validato (422), upload con magic bytes, nosniff.
- Test in `backend/tests/test_class_covers.py`; doc in funzionalita-counselorbot.md.
## Verifiche
- pytest test_class_covers.py (python 3.11, SQLite): 11 passed.
## Prossimi passi
Merge utente; rebuild backend.
## Blocchi e rischi
Nessuno. Frontend invariato (il 422 sui preset non si verifica; upload mostra già detail).
