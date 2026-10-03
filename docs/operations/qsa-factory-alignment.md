# Allineamento dei prompt QSA di fabbrica

Riferimento: `docs/Guida_Costruzione_Prompt_QSA_CounselorBot.docx`.
Il documento fornito dall’utente ha lo stesso testo di questa guida già presente
nel repository; l’utente lo ha indicato come riferimento per i prompt di fabbrica.
Le istruzioni rimangono in inglese. La lingua della risposta è determinata dalla
direttiva runtime, mentre etichette e testi visibili mantengono le sei lingue.

## Modifiche

- Dieci istruzioni QSA in file `backend/prompts/qsa_step_*.md` e prompt di sistema
  per fattori, secondo livello e follow-up allineati ai testi della guida.
- Cinque blocchi pedagogici QSA allineati; i blocchi già conformi restano identici.
- Il veto `[SYNTHESIS ADVICE]` resta aggiunto all’istruzione di sintesi, coerentemente
  con il divieto di nuove strategie descritto dalla guida.
- `qsa_prompt_components.json` contiene la matrice dello step. Per la sintesi si
  usa la matrice sinottica (entrambe le aree, zero nuove strategie): il riferimento
  a `sl-selfcontrol` nella tabella dettagliata della guida è un refuso, non una
  regola di ereditarietà. I follow-up con richiesta esplicita di consiglio usano
  l’eccezione prevista dalla guida; un override amministrativo resta prioritario.
- L’API amministrativa comunica i default QSA anche all’editor. Non modifica
  i valori salvati né i default degli altri strumenti. Se non ci sono bozze dei
  componenti, l’anteprima usa le regole effettive del turno, senza imporre i
  checkbox d’ingresso anche ai follow-up.
- Tutti gli step dichiarano esplicitamente lo strumento. All’avvio vengono
  riclassificati solo `qsar-intro`, `ztpi-intro`, `savickas-intro` quando appartengono
  erroneamente a QSA. Testi, ordine, colori, etichette e traduzioni restano intatti.

La struttura dell’envelope resta condivisa con la chat. I componenti sono inclusi
secondo il turno e i dati disponibili: il documento non implica che tutti i
blocchi siano presenti in ogni richiesta. Nessun provider LLM è configurato da
questo intervento, e una verifica del prompt non certifica la risposta del modello.

## Database esistenti

Il pull del codice corregge l’appartenenza all’avvio e aggiorna i default, ma
non sostituisce i testi già salvati. Il comando seguente prepara un piano:

```bash
backend/.venv/bin/python -m backend.qsa_factory_alignment --output .tmp/qsa-alignment.json
```

Impostare prima `DATABASE_URL` verso il database desiderato. Il piano è un file
0600 con prima/dopo e SHA-256, fuori da Git. Riconosce soltanto gli esatti default
precedenti registrati in `qsa_factory_legacy.json`. Prompt diversi o segnati come
modificati dall’admin sono riportati in `preserved` e non vengono sostituiti.
Le varianti per lingua, i counselor e gli altri questionari non fanno parte del piano.

Dopo aver verificato il piano:

```bash
backend/.venv/bin/python -m backend.prompt_updates apply .tmp/qsa-alignment.json
```

Tutti gli hash vengono controllati prima delle scritture; l’aggiornamento è
atomico e registra lo storico. La stessa procedura con `rollback` ripristina i
valori precedenti solo se nel frattempo non sono stati modificati. La generazione
del piano non scrive nel database. Ripeterla dopo l’applicazione non propone gli
stessi aggiornamenti.

### Codespaces configurato in questa sessione

Arrestare il precedente avvio con Ctrl+C, mantenendo il database di sviluppo.
Nel repository sul ramo `feature/questionnaire-prompt-preview`:

```bash
git pull --ff-only
export DATABASE_URL=postgresql://cloud_dev@127.0.0.1:5435/counselorbot_dev
backend/.venv/bin/python -m backend.qsa_factory_alignment --output .tmp/qsa-alignment.json
```

Aprire `.tmp/qsa-alignment.json` per controllare `changes` e `preserved`, poi:

```bash
backend/.venv/bin/python -m backend.prompt_updates apply .tmp/qsa-alignment.json
bash start.sh
```

Se il container di sviluppo è stato arrestato, avviarlo prima con
`docker start counselorbot-codespaces-postgres`. Aprire la porta privata 3107.
La prima presentazione QSA deve avere ID `intro` e parlare del percorso QSA;
le altre tre presentazioni si trovano nei rispettivi strumenti.

## Verifica

`test_qsa_factory_alignment.py` confronta i testi con il documento indipendente,
verifica tutte le classificazioni di fabbrica, conservazione delle traduzioni,
idempotenza, protezione delle personalizzazioni, applicazione/rollback e rifiuto
degli aggiornamenti concorrenti. Simula tutti i dieci step in ciascuna delle sei
lingue senza chiamate LLM. Le suite esistenti coprono routing, inversioni,
scoping, politiche dei consigli e anteprima desktop/mobile.

In produzione il merge richiede la normale ricostruzione delle immagini e
l’applicazione separata del piano al database scelto. Non ricopiare il database
di sviluppo sulla produzione.
