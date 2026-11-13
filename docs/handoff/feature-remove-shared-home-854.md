# Handoff — Rimozione della pagina comune degli strumenti
Agente: `s15-rimozione-854` · Branch: `feature/remove-shared-home-854` · Task: `2b727384-f475-4e7b-a568-b643eed0c499`

## Stato
- In corso in un clone isolato su disco interno, `/private/tmp/counselorbot-854`.

## Fatto
- Rimossa la voce «Attività e percorsi» dalle navigazioni desktop e mobile.
- Riutilizzata la conferma di eliminazione e conservata la ripresa pQBL in «Da riprendere» nell'Area studente.

## Verifiche
- 68 test unitari della navbar superati con Node 22.

## Prossimi passi
- Integrare #853, rimuovere il vecchio componente e aggiornare test browser e documentazione.
- Validare, pushare la branch, aprire la PR con `Closes #854` e aggiornare il Diario.

## Blocchi e rischi
- #853 deve arrivare su `main` prima della PR. Il clone interno evita l'attesa I/O del volume esterno.
