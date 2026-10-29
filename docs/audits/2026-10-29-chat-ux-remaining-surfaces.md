# Audit UX — chat non ancora analizzate (#659)

Milestone #39 «Chat UX unification». Standard: la chat guidata
(`components/qsa/GuidedChatInterface.tsx`) con i componenti condivisi di main:
`ChatShell` (#653: `ChatTranscript`, `ChatRow`, `ChatComposerInput`,
`ChatSendButton`), `ChatMarkdown` (#654), `AudioInput` + `ListenButton` (#655),
`ChatResponseSettings` (#657). Stato letto dal codice di `main` (904798af);
le PR #656, #658, #661 non sono ancora unite e non sono contate qui.
Solo documentale: nessun codice modificato.

## Sintesi

| Superficie | Componente | Aderenza allo standard |
|---|---|---|
| Sandbox admin | `AdminChatSandbox` → `GuidedChatInterface preview` | Piena (è la chat guidata) |
| Chat nei piani operativi | `PlanActivityFlow`, `ResultsDeepDiveFlow` → `GuidedChatInterface planOrigin`; sola lettura `PlanActivityReview` | Piena in chat; trascrizione quasi |
| Taccuini di prova | `PracticeChats` (elenco/trascrizione); la chat vera è la guidata con `practiceNotebookId` | Chat piena; trascrizione no |
| Workspace OpenCode | `OpenCodeExperience` | Divergente su quasi tutto |

## 1. Sandbox admin (`components/admin/AdminChatSandbox.tsx`, `app/admin/preview-chat`)
Riusa `GuidedChatInterface` con `preview={true}` dentro `ChatViewport`: guscio,
Markdown, audio, ascolto, impostazioni e streaming sono quelli standard.
Differenze volute di `preview`: nessun autosalvataggio né «Concludi/congela»
(`!preview` alle righe 1745, 1614, 1635), feedback sulle strategie solo locale
(riga 722), richieste marcate `preview`. Il sandbox aggiunge intestazione,
selettore counselor e «Ricomincia» fuori dalla chat.
- Differenze: nessuna sulla conversazione. Verificare solo che la cornice
  (modale e pagina) non tolga l'altezza utile al composer su 390 px.
- Raccomandazione: nessun intervento; non duplicare il guscio.

## 2. Chat nei piani operativi
`PlanActivityFlow` e `ResultsDeepDiveFlow` montano la chat guidata con
`planOrigin`, snapshot e salvataggio registrato: standard pieno.
Una volta conclusa, `PlanActivityReview` mostra la conversazione in un
`<details>` con `ChatMarkdown` (già standard), ma con bolle proprie
(`ml-4 bg-indigo-50` / bordo), senza `ChatRow` né `role="log"`.
- Differenze: larghezza e allineamento delle bolle diversi; nessun registro
  per lettori di schermo; nessun «Ascolta».
- Raccomandazione (bassa priorità): usare `ChatRow` per le righe e
  `ChatTranscript` come contenitore; «Ascolta» opzionale (lettura storica).

## 3. Taccuini di prova (`components/teacher/PracticeNotebooks.tsx`, `PracticeChats.tsx`)
Il taccuino non ha una chat propria: apre la chat guidata con
`practice_notebook_id`, quindi la conversazione è standard. `PracticeChats`
mostra la trascrizione dai log come `<p class="whitespace-pre-line">` con
etichetta di ruolo: niente Markdown (`**`, elenchi, tabelle, grafici compaiono
come testo grezzo), nessun `ChatRow`/registro. Stati caricamento/errore con
`role="status"`/`"alert"`: corretti.
- Differenze: la stessa risposta appare formattata in chat e grezza qui.
- Raccomandazione (media): rendere i messaggi del counselor con `ChatMarkdown`
  (i messaggi dello studente restano testo semplice, come nello standard) e
  avvolgere con `ChatTranscript`/`ChatRow`.

## 4. Workspace OpenCode (`components/qsa/OpenCodeExperience.tsx`)
Unica superficie con implementazione propria. Mantiene bene: ripresa
(`useChatContinuation`), interruzione (`AbortController`, «Ferma»), seguire il
fondo con `isNearBottom`, feedback utile/non utile, `ResponseFormatSelector`.
Divergenze rispetto allo standard:
- **Guscio**: lista di `div` senza `ChatTranscript` (nessun `role="log"` né
  annuncio aria-live); bolle `max-w-[92%]/[85%]` invece di `ChatRow`
  (piena / 90% da lg).
- **Markdown**: `ReactMarkdown` + `remarkGfm` diretto, senza `ChatMarkdown`:
  niente tabelle scorrevoli, grafici, avviso d'errore del fornitore, regole
  di sicurezza/stile condivise.
- **Composer**: `<textarea rows=1>` fisso (`max-h-32`), senza
  `ChatComposerInput` (non cresce, nessun `aria-label`; solo placeholder);
  invia/ferma sono due pulsanti propri `p-2.5` (≈36 px) con `title` ma senza
  `aria-label`, invece di `ChatSendButton` (44 px, stop integrato).
- **Attesa**: tre puntini propri, invece di `ChatPending`.
- **Audio**: nessun microfono (`AudioInput`) né «Ascolta» (`ListenButton`).
- **Impostazioni**: solo formato, fuori dal menu «Opzioni della conversazione»
  (`ChatResponseSettings`); nessuna lunghezza/analisi.
- **Intestazione**: pulsanti con `p-1.5` (sotto i 44 px), tema
  scuro/chiaro proprio per la vista terminale (scelta legittima, da tenere).
- Raccomandazione (alta, un'unica slice): sostituire transcript/riga/composer/
  pulsante/attesa con `ChatShell`, risposte con `ChatMarkdown`, formato nel
  `ChatResponseSettings`; aggiungere `AudioInput` e `ListenButton` solo se
  il workspace invia testo al normale flusso (da verificare lato backend: se i
  messaggi passano da OpenCode locale, l'audio può restare fuori ambito e va
  dichiarato). Tenere invariati terminale, ripresa, auto-congelamento,
  privacy della sessione e la vista chat/terminale.

## Ordine suggerito
1. OpenCode (divergenza maggiore, un solo file).
2. `PracticeChats` con `ChatMarkdown` (poche righe).
3. `PlanActivityReview` con `ChatRow`/`ChatTranscript`.
4. Sandbox: nessuna azione.

## Fuori ambito di questa audit
Bussola e Assistente (già allineati da #653–#657), tema terminale di OpenCode,
logica di backend. Test e codice non toccati.
