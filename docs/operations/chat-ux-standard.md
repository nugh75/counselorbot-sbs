# Standard UX delle chat

Riferimento: la **chat guidata** (`components/qsa/GuidedChatInterface.tsx`).
Bussola (`app/bussola/page.tsx`) e Assistente (`app/assistente/page.tsx`) ne
riusano i componenti. Una nuova chat parte da qui e non reinventa forma,
Markdown, composer, audio o impostazioni. Il documento descrive solo ciò che è
in `main`; ogni regola indica il componente che la fa rispettare.

## 1. Componenti condivisi

| Componente | File (`frontend/src/components/ui/`) | Cosa garantisce |
|---|---|---|
| `ChatTranscript` | `ChatShell.tsx` | `role="log"` navigabile + regione `aria-live="polite"` separata (`announcement`) |
| `ChatRow` | `ChatShell.tsx` | larghezza unica della bolla: piena su telefono, 90% da `lg`; `system` centrato |
| `ChatBubble` | `ChatBubble.tsx` | bolla `user` (indaco) / `assistant` (bianca, bordo) |
| `ChatPending` | `ChatBubble.tsx` | attesa: spinner + testo, allineata a sinistra |
| `ChatComposerInput` | `ChatShell.tsx` | campo auto-grow 1–6 righe; Invio invia, Maiusc+Invio va a capo |
| `ChatSendButton` | `ChatShell.tsx` | Invia 44×44 px; con `onStop` diventa «Ferma» mentre la risposta arriva |
| `ChatMarkdown` | `ChatMarkdown.tsx` | testo della risposta: Markdown, diagrammi, errore provider |
| `ChatActionsPopover` | `ChatActionsPopover.tsx` | menu «Opzioni della conversazione» (popover nativo, non tagliato dallo scroll) |
| `ChatResponseSettings` | `ChatResponseSettings.tsx` | righe Formato / Lunghezza / Analisi nel popover |
| `AudioInput` | `AudioInput.tsx` | microfono, file audio, conversazione vocale |
| `AudioSendOption`, `AudioLanguageOption` | stesso nome | opzioni audio nel popover |
| `ListenButton` | `components/voice-reader/VoiceReader.tsx` | «Ascolta» sotto la risposta |

Regola: se una parte esiste qui, **si importa**; non si copia e non si
ridefinisce uno stile equivalente.

Esempio minimo (struttura delle tre chat):

```tsx
<ChatTranscript announcement={liveAnnouncement} aria-label={t('…title')} className="min-h-0 flex-1 overflow-y-auto">
  {messages.map((m, i) => (
    <ChatRow key={i} role={m.role}>
      <ChatBubble role={m.role}>
        {m.role === 'assistant'
          ? <div data-voice-source={`mia-chat-${id}-${i}`} data-voice-language={lang}>
              <ChatMarkdown content={m.content} locale={lang} errorMessage={t('guided.stepConnError')} />
            </div>
          : m.content /* messaggi della persona: testo semplice */}
      </ChatBubble>
    </ChatRow>
  ))}
  {loading && <ChatPending label={t('guided.thinking')} />}
</ChatTranscript>

<form onSubmit={submit} className="flex items-end gap-2">
  <ChatActionsPopover label={t('…options')}>{close => <ChatResponseSettings format={…} length={…} />}</ChatActionsPopover>
  <ChatComposerInput aria-label={t('…placeholder')} value={draft} onChange={…} />
  <AudioInput … />
  <ChatSendButton loading={loading} onStop={stop} sendLabel={t('…send')} stopLabel={t('…stop')} />
</form>
```

## 2. Layout

- Una colonna: trascritto che scorre (`min-h-0 flex-1 overflow-y-auto`), composer
  sotto, mai due barre di scorrimento della pagina.
- Nessuno scroll orizzontale a 390 px: contenuti larghi (tabelle, codice)
  scorrono **dentro** la propria cornice.
- Ordine del composer, da sinistra: **opzioni | campo | microfono | Invia**.
  Nel campo restano solo queste cose; formato, lunghezza e audio stanno nel
  popover (vedi §5).
- Aree toccabili ≥ 44×44 px (la radice è 15 px: `h-11` da solo darebbe 41 px;
  usare `min-h-[44px] min-w-[44px]`).
- L'attesa è **un solo** segnale (`ChatPending`), non un secondo indicatore.
- Azioni extra del messaggio (es. Ascolta) stanno sotto la bolla, fuori dal
  testo; marcatele `data-voice-ignore` perché il lettore non le legga.

## 3. Markdown

Usare sempre `ChatMarkdown`; non usare `ReactMarkdown` direttamente né `prose`.

- Titoli h1–h4, elenchi, grassetto, link, codice in linea e a blocchi,
  citazioni e righe hanno lo stile unico del componente.
- Tabelle: scorrono nel contenitore con `tabIndex=0` (raggiungibile da
  tastiera), senza muovere la pagina.
- Diagrammi: `splitDiagramContent` separa i blocchi grafico dal testo e pulisce
  i metadati privati; sono resi da `DiagramBlock`.
- Errore del provider: avviso `role="alert"` con `errorMessage`; passare
  `t('guided.stepConnError')` in ogni chat, mai il testo tecnico.
- HTML grezzo nel messaggio **non** è eseguito né reso (`<img>` incluso).
- I messaggi della persona restano testo semplice.
- Per il parlato usare `diagramContentForSpeech(content)` (toglie i grafici).

## 4. Composer

- `ChatComposerInput` dentro un `<form>`: l'invio passa da `onSubmit`, non da
  un handler di tasto proprio. Dategli sempre `aria-label`.
- Invia è disabilitato a campo vuoto, durante `loading` e durante la
  trascrizione audio (`audioBusy`).
- Se la richiesta si può interrompere (`AbortController`), passare `onStop`: il
  primario diventa «Ferma la risposta». Se non si può (Bussola: risposta intera,
  non in streaming), l'Invia resta disabilitato in attesa.
- Con la conversazione vocale il campo e Invia si nascondono: resta il pulsante
  «Premi per parlare» di `AudioInput`.
- Il testo digitato non va nel log, nell'URL né in `localStorage`. Il
  trascritto vive in stato React; la persistenza è del backend della chat.

## 5. Impostazioni della risposta

Sempre nel popover «Opzioni della conversazione», mai in riga col campo, con
`ChatResponseSettings` nell'ordine **Formato → Lunghezza → (righe extra) →
Analisi**, poi i gruppi audio (`divide-y` fra impostazioni e audio).

Ogni chat passa **solo ciò che il suo backend accetta**:

| Chat | Formato | Lunghezza | Analisi |
|---|---|---|---|
| Guidata | sì | sì | sì (con avviso «obbligatorio» se richiesto) |
| Assistente | sì | sì | no |
| Bussola | sì | no | no |

Non mostrare un'impostazione che non ha effetto. `locale` serve solo alla
guidata, la cui sessione può avere una lingua diversa dall'interfaccia.

## 6. Audio

- `AudioInput` accanto a Invia: dettatura da microfono o file; la trascrizione
  si **aggiunge alla bozza** e si può correggere prima di inviare. Dettagli,
  limiti e opzioni: `docs/operations/audio-input.md`.
- `sessionKey` = identità del contesto (chat + argomento): cambiarla annulla
  registrazione e lettura in corso e rilascia il microfono.
- Conversazione vocale: `onSend(text, onPartial)` deve **restituire la
  risposta** e passare lo streaming a `onPartial`, così la voce legge a pezzi
  mentre arriva. Un solo invio per turno.
- «Ascolta» (`ListenButton`) solo su risposte **finite** (non su quella in
  streaming); la bolla porta `data-voice-source` univoco, `data-voice-language`
  e, se c'è, `data-voice-counselor`.
- Gli endpoint `/api/audio/transcribe` e `/api/tts/stream` richiedono il login:
  una chat senza utente autenticato non offre audio.
- Nessuna chiamata TTS/LLM nei test: fixture sintetiche.

## 7. Streaming, recupero, privacy, i18n, accessibilità

- **Streaming**: il trascritto non è `aria-live`; solo l'`announcement` di
  `ChatTranscript` cambia, con due stati («sto elaborando», risposta finita).
- **Recupero**: dopo un errore o un ricaricamento la bozza e i messaggi già
  consegnati non si perdono; la chat guidata ha i test di ripresa
  (`frontend/tests/chat-recovery.test.mjs`). Una nuova chat con persistenza
  deve avere un test equivalente.
- **Privacy**: niente contenuti dei messaggi in log, analytics, URL o
  `localStorage`; in `localStorage` solo preferenze di interfaccia (es.
  `cb_audio_auto_send`, `cb_assistente_sidebar`), sempre in `try/catch`.
- **i18n**: ogni etichetta e `aria-label` passa da `t()` in tutte e sei le
  lingue; `npm run i18n:check` non deve aggiungere testi fissi.
- **Accessibilità**: ruoli e nomi accessibili sui controlli a sola icona,
  focus visibile, tutto raggiungibile da tastiera, `Esc` chiude i popover.

## 8. Checklist per una nuova chat

1. `ChatTranscript` + `ChatRow` + `ChatBubble`; `announcement` e `aria-label`.
2. Risposte con `ChatMarkdown` (`errorMessage` = `guided.stepConnError`);
   persona in testo semplice.
3. Attesa con `ChatPending`; Invia con `ChatSendButton` (+ `onStop` se
   interrompibile).
4. Campo con `ChatComposerInput` in un `<form>`, con `aria-label`.
5. Opzioni in `ChatActionsPopover` con `ChatResponseSettings` (solo righe
   supportate dal backend) e, se c'è audio, i gruppi audio.
6. Audio: `AudioInput` con `sessionKey`, `onSend` che restituisce la risposta;
   `ListenButton` + `data-voice-source` su risposte finite.
7. Nessuno scroll orizzontale a 390 e 1440 px; target ≥ 44 px.
8. Chiavi i18n in sei lingue; `npm run i18n:check` senza nuovi errori.
9. Nessun testo dei messaggi in log/URL/storage.
10. Test: copiare gli schemi di `frontend/tests/chat-shell.test.mjs`,
    `chat-markdown.test.mjs`, `chat-settings.test.mjs`,
    `assistant-audio.test.mjs` (fixture sintetiche, runner
    `scripts/dev-chat-shell-tests.sh`, porta :3173, vedi
    `docs/operations/live-dev-environment.md`).
11. Aggiornare `docs-counselorbot/funzionalita-counselorbot.md` e rigenerare
    la guida: `make guidance-refresh` poi `make guidance-check`.

## 9. Differenze note rispetto allo standard

- Bussola: niente «Ferma» (risposta non in streaming) e solo la riga Formato.
- Assistente: nessuna riga Analisi (nessun backend per il ragionamento).
- Dopo i merge delle altre slice della milestone #39 (composer, azioni,
  diagrammi) il documento va riletto: suggerimenti sopra il campo, riga azioni
  del messaggio e diagramma per messaggio sono definiti in quelle PR.
