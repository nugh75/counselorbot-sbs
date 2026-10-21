# Salvataggio in fondo ai moduli lunghi (#412)

Obiettivo: il comando che conclude un modulo lungo deve restare raggiungibile
anche dopo aver compilato tutti i campi, senza risalire la pagina. Il comando in
coda usa lo stesso flusso di salvataggio di quello in testa: nessuna nuova API,
nessuno stato duplicato.

## Moduli verificati

| Modulo | File | Comando in fondo | Note |
| --- | --- | --- | --- |
| Impostazioni della classe | `frontend/src/components/teacher/ClassSettingsPage.tsx` | Salva nella barra `StickyActions` | Già presente |
| Piano operativo di classe | `frontend/src/components/teacher/ClassPathsTab.tsx` | Salva bozza e Pubblica nella barra `StickyActions` | Già presente |
| Taccuino del docente | `frontend/src/components/teacher/TeacherNotebook.tsx` | Salva taccuino dopo l'ultimo campo | Già presente |
| Taccuini di prova | `frontend/src/components/teacher/PracticeNotebooks.tsx` | Salva dopo i campi e le classi | Già presente |
| Repertorio di profili dei taccuini di prova | `frontend/src/components/teacher/PracticeRepertoire.tsx` + `ScoreInputForm` | Salva in testa e in coda | Già presente dal flusso #245 |
| Incontri di classe | `frontend/src/components/teacher/ClassMeetingsManager.tsx` | Salva incontro dopo l'ultimo campo | Già presente |
| Modelli di piano | `frontend/src/components/teacher/PathTemplatesPanel.tsx` | Salva modello dopo i passi | Già presente |
| Istituti e credenziali | `frontend/src/components/teacher/InstitutesPanel.tsx` | Salva dopo i campi | Già presente |
| Orientamento | `frontend/src/app/docente/orientamento/page.tsx` | Salva in coda a ciascun modulo | Già presente |
| Compilazione punteggi e questionari | `frontend/src/components/qsa/ScoreInputForm.tsx` | Continua/Invia o Salva/Annulla in testa e in coda | Aggiunto il comando in coda in tutte le modalità |
| Taccuino nel percorso guidato | `frontend/src/components/profile/LearnerProfileCard.tsx` | Salva versione in coda, oltre alla prima riga in testa | Aggiunto il comando in coda |

I moduli della pagina personale con Salva già in coda (Portfolio, lettura dei
risultati, API personali, obiettivi) restano invariati.

## Contratto

- **Stesso flusso**: il comando in coda chiama la stessa funzione di quello in
  testa; non apre un secondo percorso di salvataggio.
- **Stesso stato**: validazione, caricamento, errore e conferma restano quelli
  del modulo. I due comandi condividono `disabled` e `busy`.
- **Nessun invio duplicato**: in `ScoreInputForm` entrambi i comandi inviano lo
  stesso `form` tramite `form={formId}`; in `LearnerProfileCard` entrambi
  chiamano `save(saveSource)` e la coda `notebookAutosave` serializza i commit.
- **Tastiera e mobile**: sono pulsanti nativi, quindi raggiungibili con Tab e
  attivabili con Invio/Spazio; mantengono l'altezza minima di 44 px.
- **Testi**: nessuna nuova stringa; le etichette esistenti (`lp.save`,
  `common.save`, `common.continue`, `score.submit`) valgono per entrambi i
  comandi.

## Verifica

```bash
cd frontend
npm test
npm run i18n:check
npx tsc --noEmit
```

Browser isolato (fixture anonime, backend non raggiungibile):

```bash
cd frontend
BACKEND_ORIGIN=http://127.0.0.1:9 npm run dev -- --hostname 127.0.0.1 --port 3141
TEACHER_PRACTICE_BASE_URL=http://127.0.0.1:3141 node --test tests/teacher-practice-notebooks.test.mjs
```

Il test `il modulo ordinario dei punteggi offre Continua in testa e in coda`
verifica i due comandi nel modulo punteggi; la suite account verifica il
Salva versione in coda nel percorso iniziale.
