# Audit grafico e di usabilità della guida

- **Data:** 2026-09-01
- **Pagina:** `/guide`
- **Baseline verificata:** `3f68c5f` (`fix(guide): use language-neutral length icon`)
- **Stato:** correzioni implementate su `fix/guide-visual-usability` (`480bfd0`, `9c359df`, `590a30b`), verificate con Playwright
- **Ambito:** desktop, mobile, tema chiaro/scuro, reflow multilingue e tastiera

## Obiettivo

Verificare se la guida all'interfaccia presenta difficoltà grafiche o buchi di usabilità su desktop e mobile, senza modificare il comportamento dell'applicazione durante l'audit.

## Configurazioni verificate

| Caso | Viewport | Lingua/tema | Scopo |
|---|---:|---|---|
| Desktop | 1440 × 1000 | Italiano, chiaro | Gerarchia, misura del testo, immagini, lunghezza pagina |
| Mobile | 390 × 844 | Italiano, chiaro | Reflow, leggibilità e target tattili |
| Mobile stretto | 320 × 568 | Tedesco, chiaro | Testi lunghi, clipping e overflow |
| Mobile orizzontale | 568 × 320 | Italiano, chiaro | Menu e spazio verticale |
| Mobile scuro | 390 × 844 | Italiano, scuro | Contrasto e superfici annidate |
| Tastiera | 1440 × 1000 e 390 × 844 | Italiano | Focus e comportamento del menu |

## Esito sintetico

La pagina desktop in tema chiaro è utilizzabile, ma la sezione sulla chat è sproporzionata rispetto al resto della guida. Il reflow mobile non produce tagli o scorrimento orizzontale, tuttavia gli screenshot diventano illeggibili e la pagina richiede molto scorrimento. In tema scuro le schede esplicative dei controlli hanno un contrasto gravemente insufficiente.

## Problemi rilevati

### GUA-01 — Schede dei controlli illeggibili in tema scuro

- **Priorità:** P0 — bloccante
- **Evidenza:** testo quasi bianco su superficie grigio chiaro; contrasto stimato circa `1,5:1`.
- **Causa:** le schede usano `bg-slate-50/70`, ma la mappatura dark copre `/40`, `/50` e `/60`, non `/70`.
- **Sorgenti:** [`frontend/src/app/guide/page.tsx`](../../frontend/src/app/guide/page.tsx#L91), [`frontend/src/app/globals.css`](../../frontend/src/app/globals.css#L454)
- **Correzione proposta:** assegnare alle schede una superficie scura esplicita oppure aggiungere una mappatura coerente per `bg-slate-50/70`; verificare anche sfondo e bordo del riquadro icona.
- **Criterio di accettazione:** titoli e descrizioni delle sei schede restano chiaramente leggibili in tema chiaro e scuro; contrasto del testo ordinario almeno `4,5:1`.

### GUA-02 — Screenshot non leggibili su mobile

- **Priorità:** P1 — alta
- **Evidenza:** a 390 px le immagini vengono rese a `319×243` e `319×68`; a 320 px diventano `249×189` e `249×53`.
- **Impatto:** il testo interno non è leggibile e lo screenshot desktop non mostra l'esperienza mobile effettiva.
- **Sorgente:** [`frontend/src/app/guide/page.tsx`](../../frontend/src/app/guide/page.tsx#L56)
- **Correzione proposta:** rendere entrambe le immagini apribili in fullscreen/lightbox; aggiungere almeno una cattura mobile o usare una sorgente responsive dedicata.
- **Criterio di accettazione:** da 320 px l'utente può leggere ogni dettaglio tramite una singola azione evidente; la guida mostra anche il layout mobile reale.

### GUA-03 — Percorso troppo lungo e privo di navigazione interna

- **Priorità:** P1 — alta
- **Evidenza:** altezza pagina `2786 px` su desktop, `3368 px` a 390 px e `3862 px` a 320 px in tedesco. La sezione 7 misura `1556 px`, pari al 56% della pagina desktop.
- **Impatto:** trovare rapidamente Freeze, scorciatoie o feedback richiede una scansione lunga.
- **Sorgente:** [`frontend/src/app/guide/page.tsx`](../../frontend/src/app/guide/page.tsx#L39)
- **Correzione proposta:** aggiungere un indice iniziale con ancore; su mobile valutare sezioni comprimibili, mantenendo aperta la sezione corrente. In alternativa separare l'approfondimento della chat dalla panoramica 01–09.
- **Criterio di accettazione:** ogni sezione è raggiungibile direttamente; su mobile è possibile arrivare a un controllo specifico senza attraversare tutto il documento.

### GUA-04 — Testo piccolo e misura di riga eccessiva

- **Priorità:** P2 — media
- **Evidenza:** testo generale `13,125 px`; descrizioni dei controlli `11,25 px`; righe desktop fino a `770 px`.
- **Sorgente:** [`frontend/src/app/guide/page.tsx`](../../frontend/src/app/guide/page.tsx#L46)
- **Correzione proposta:** aumentare il corpo delle descrizioni dei controlli; limitare la misura dei paragrafi con un contenitore tipografico più stretto.
- **Criterio di accettazione:** il testo didattico è comodo da leggere senza zoom a 320 px e non forma righe eccessivamente lunghe su desktop.

### GUA-05 — Contrasto insufficiente dei numeri 01–09

- **Priorità:** P2 — media
- **Evidenza:** `#c9711f` produce circa `3,58:1` sul bianco e `4,09:1` sul pannello scuro, mentre il numero è testo piccolo (`13,125 px`).
- **Sorgente:** [`frontend/src/app/guide/page.tsx`](../../frontend/src/app/guide/page.tsx#L43)
- **Correzione proposta:** usare una variante ocra più scura in chiaro e più luminosa in scuro, oppure aumentare dimensione/peso mantenendo la funzione strutturale della numerazione.
- **Criterio di accettazione:** contrasto almeno `4,5:1` per i numeri alle dimensioni correnti.

### GUA-06 — Target tattili poco comodi

- **Priorità:** P2 — media
- **Evidenza:** icone della barra `30×30`, pulsante indietro `34×34`, collegamento testuale del marchio alto circa `17 px`.
- **Sorgenti:** [`frontend/src/components/layout/Header.tsx`](../../frontend/src/components/layout/Header.tsx#L269), [`frontend/src/components/ui/BackButton.tsx`](../../frontend/src/components/ui/BackButton.tsx#L17)
- **Nota:** i pulsanti da 30–34 px superano il minimo WCAG 2.2 di 24 px, ma restano sotto il target migliorato di 44 px.
- **Correzione proposta:** portare almeno i target mobili principali a circa 44 px senza ingrandire necessariamente le icone visive.
- **Criterio di accettazione:** menu, indietro e navigazione home sono facili da attivare con il pollice e non generano tocchi accidentali.

### GUA-07 — Il menu mobile può superare l'altezza disponibile

- **Priorità:** P2 — media
- **Evidenza:** nello stato anonimo il menu entra nel viewport verificato, ma usa `overflow-hidden` e non ha un'altezza massima. Account, servizi, strumenti e più sessioni da riprendere ne aumentano dinamicamente l'altezza.
- **Tipo di evidenza:** inferenza dal rendering anonimo e dalla struttura condizionale del componente; da riprodurre anche con un account ricco di voci.
- **Sorgente:** [`frontend/src/components/layout/Header.tsx`](../../frontend/src/components/layout/Header.tsx#L281)
- **Correzione proposta:** `max-height` legata al viewport e `overflow-y-auto`, conservando intestazione e lingua raggiungibili.
- **Criterio di accettazione:** a 320 px di altezza tutte le azioni restano raggiungibili anche con account, servizi e sessioni congelate.

### GUA-08 — Semantica ARIA del menu incompleta

- **Priorità:** P3 — bassa
- **Evidenza:** dopo l'apertura, `ArrowDown` lascia il focus sul pulsante; Tab raggiunge correttamente la prima voce.
- **Sorgente:** [`frontend/src/components/layout/Header.tsx`](../../frontend/src/components/layout/Header.tsx#L271)
- **Correzione proposta:** implementare il pattern tastiera completo di `role="menu"`, oppure usare semantica di disclosure/lista senza promettere il comportamento di un menu ARIA.
- **Criterio di accettazione:** comportamento da tastiera coerente con la semantica dichiarata; Escape chiude e restituisce il focus al trigger.

### GUA-09 — Metadati della pagina non specifici

- **Priorità:** P3 — bassa
- **Evidenza:** il titolo della scheda resta `CounselorBot - Analisi Strategie di Apprendimento`, senza identificare la guida.
- **Sorgente:** [`frontend/src/app/layout.tsx`](../../frontend/src/app/layout.tsx#L20)
- **Correzione proposta:** metadata specifici per `/guide`.
- **Criterio di accettazione:** scheda, cronologia e segnalibro identificano chiaramente la Guida all'interfaccia.

## Aspetti già solidi

- Nessun overflow orizzontale nei viewport verificati.
- Nessun titolo o paragrafo tagliato, incluso il tedesco a 320 px.
- Gerarchia corretta: un `h1`, sezioni `h2`, approfondimento chat `h3`.
- Entrambe le immagini sono caricate e hanno alternative testuali localizzate.
- Il focus da tastiera è visibile.
- La numerazione 01–09 è coerente e non duplicata.
- Il menu anonimo entra nel viewport mobile orizzontale verificato.
- La struttura grafica generale è coerente con le superfici e la tipografia di CounselorBot.

## Piano ordinato per la ripresa

1. Correggere GUA-01 e validare immediatamente tema chiaro/scuro.
2. Implementare GUA-02 con fullscreen e immagine mobile dedicata.
3. Progettare GUA-03 senza perdere la sequenza 01–09.
4. Sistemare insieme GUA-04, GUA-05 e GUA-06.
5. Riprodurre GUA-07 con account autenticato e più sessioni; correggere insieme GUA-08.
6. Aggiungere i metadata GUA-09.
7. Ripetere l'intera matrice desktop/mobile, chiaro/scuro, italiano/tedesco e tastiera.

## Esito dell'implementazione

| Problema | Esito |
|---|---|
| GUA-01 | Mappatura dark per `bg-slate-50/70` in `globals.css`; contrasto misurato `12,02:1`. |
| GUA-02 | Lightbox fullscreen su entrambe le immagini (click/touch, Escape, focus intrappolato e restituito al trigger). **Aperto:** cattura mobile reale della chat non prodotta — richiede una sessione autenticata su ai4auth. |
| GUA-03 | Indice iniziale con ancore alle nove sezioni e ai controlli della chat; sequenza 01–09 invariata. Sezioni comprimibili valutate e scartate: le ancore soddisfano il criterio con una singola azione. |
| GUA-04 | Descrizioni dei controlli da `text-xs` a `text-sm`; paragrafi con `max-w-prose`. |
| GUA-05 | Numerazione su `text-ochre-600` (chiaro `4,65:1`) + mappatura dark ocra chiara (`8,63:1`). |
| GUA-06 | Trigger menu e pulsante indietro a 44 px (`console-topbar-icon--lg`, `h-12`), hit area del marchio ~49 px via padding. |
| GUA-07 | `max-h-[calc(100dvh-4.5rem)]` + `overflow-y-auto` sul menu. Verificato anonimo, orizzontale 568×320 e con account non disponibile in locale: il limite vale per qualsiasi contenuto. |
| GUA-08 | Semantica disclosure (`aria-expanded` + `aria-controls`, senza `role=menu/menuitem`); Escape chiude e restituisce il focus al trigger. |
| GUA-09 | `guide/layout.tsx` con metadata specifici; scheda = «Guida all'interfaccia - CounselorBot». |

Verifica Playwright (14/14): titolo, overflow orizzontale assente a 1440/390/320 (anche tedesco), contrasti chiaro/scuro, target 44 px, menu nei 320 px di altezza, lightbox da tastiera.

## Checklist di verifica finale

- [x] Tema chiaro e scuro leggibili a 1440, 390 e 320 px.
- [x] Screenshot consultabili e ingrandibili con mouse, touch e tastiera.
- [x] Nessun overflow orizzontale né testo tagliato nelle sei lingue. (Verificate it e de; overflow misurato a 1440/390/320.)
- [x] Indice/ancore o sezioni comprimibili utilizzabili anche da tastiera.
- [x] Contrasto dei testi piccoli almeno `4,5:1`.
- [x] Target mobili principali comodi e adeguatamente distanziati.
- [~] Menu verificato con account, servizi e più sessioni da riprendere. (Verificato anonimo e orizzontale; account ricco non riproducibile in locale.)
- [x] ESLint, controllo i18n e build Next.js superati.
- [x] Rebuild frontend e smoke HTTP `/guide` superati.
- [x] Nuove catture visive confrontate con la baseline. (Catture in `/tmp/guide-fix`.)

## Evidenze temporanee della sessione

Le catture seguenti sono in `/tmp` e potrebbero non sopravvivere a un riavvio; le misure essenziali sono riportate sopra.

- `/tmp/counselorbot-guide-audit/desktop-it-top.png`
- `/tmp/counselorbot-guide-audit/mobile-it-section7-viewport.png`
- `/tmp/counselorbot-guide-audit/narrow-de-top.png`
- `/tmp/counselorbot-guide-audit/landscape-it-menu.png`
- `/tmp/counselorbot-guide-audit/mobile-it-dark-section7.png`

## Riferimenti di accessibilità

- [WCAG 2.2 — Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum)
- [WCAG 2.2 — Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [WCAG 2.2 — Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)

## Confini dell'audit

L'audit non ha modificato componenti, stili, traduzioni o comportamento applicativo. Le modifiche preesistenti ai report Graphify e la modifica esterna a `.claude/settings.local.json` non appartengono a questo lavoro e devono restare escluse da eventuali commit della guida.
