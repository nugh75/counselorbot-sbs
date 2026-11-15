# Handoff feature/class-cover-showcase-953

## Stato
Implementazione fatta, verifiche in corso.

## Fatto
- Fascia copertina in ClassSettingsPage (+ modale copertina spostato qui, rimosso da ClassOverviewTab).
- Miniatura 16:9 nell'elenco classi docente (GroupsPanel).
- Area studente: fascia sotto il selettore (ClassViewSwitcher, helper selectedClass).
- Backend: class_names() aggiunge image_url al payload access.classes (sola lettura).

## Verifiche
- tsc, eslint, node test class-view, pytest test_class_view: vedi PR.
- Nessun controllo visivo (niente dev server).

## Prossimi passi
Commit, push, PR, guidance-check.

## Blocchi e rischi
Backend cambiato: il deploy richiede anche il backend.
