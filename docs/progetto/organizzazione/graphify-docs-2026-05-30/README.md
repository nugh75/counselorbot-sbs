# Graphify docs - 2026-05-30

Grafo generato con `graphifyy` / CLI `graphify` sul contenuto di `docs/`.

Comando usato:

```bash
set -a; source .env; set +a
graphify extract docs \
  --out docs/progetto/organizzazione/graphify-docs-2026-05-30 \
  --max-concurrency 1 \
  --api-timeout 600

graphify tree \
  --graph docs/progetto/organizzazione/graphify-docs-2026-05-30/graphify-out/graph.json \
  --output docs/progetto/organizzazione/graphify-docs-2026-05-30/graphify-out/GRAPH_TREE.html \
  --root docs \
  --label "CounselorBot docs"
```

## Output

- [`graphify-out/graph.json`](graphify-out/graph.json): grafo dati Graphify.
- [`graphify-out/GRAPH_TREE.html`](graphify-out/GRAPH_TREE.html): vista HTML navigabile.
- [`graphify-out/.graphify_analysis.json`](graphify-out/.graphify_analysis.json): analisi interna generata da Graphify.

## Sintesi estrazione

- File analizzati: 59 (`22` documenti, `37` paper/PDF).
- Nodi: 110.
- Archi: 102.
- Community rilevate da Graphify: 18 nel log di estrazione.
- Backend usato: Gemini, tramite variabili caricate da `.env`.
- Costo stimato riportato da Graphify: circa `$0.3856`.

Nota: durante l'esecuzione Graphify ha segnalato che la skill installata per l'agente era alla versione `0.8.17`, mentre il pacchetto CLI aggiornato e usato per l'estrazione e' `0.8.25`.
