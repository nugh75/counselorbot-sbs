# Handoff: Unica Landing Page, Pulsanti Bussola/Strumenti e Allineamento Icone

Data: 22 Settembre 2026  
Ramo Git: `feature/double-click-selection-advance`

---

## 1. Obiettivi del Lavoro

1. **Trasparenza immagini tema scuro nella pagina strumenti (`ReturningHome.tsx`)**:
   - In precedenza venivano usate `compilazioni.png`, `tavolo.png`, `bacheca-azioni.png` che avevano un piedistallo/piastra bianca opaca che nel tema scuro appariva come una macchia chiara.
2. **Allineamento icone tra pagina accoglienza (`IntroScreen.tsx`) e strumenti (`ReturningHome.tsx`)**:
   - Utilizzare le stesse identiche illustrazioni trasparenti per i tre pilastri (Analisi questionari, Percorsi guidati, Allenamento e pratica).
3. **Unica Landing Page**:
   - La schermata di accoglienza/presentazione (`IntroScreen`) deve essere l'**unica landing page** all'ingresso della piattaforma, anche per chi ha già effettuato accessi precedenti o ha questionari compilati.
4. **Nuovi pulsanti con spiegazione su `IntroScreen`**:
   - Il pulsante "Inizia" è sostituito da:
     - **Bussola**: avvia il percorso guidato di orientamento / questionari (`onStart`).
     - **Strumenti**: porta alla homepage del secondo utilizzo / catalogo strumenti (`onOpenTools` -> `setStep('base')`).
     - Entrambi i pulsanti hanno titolo, icona e descrizione esplicativa.

---

## 2. File Modificati e Dettaglio Interventi

### 1. `frontend/src/app/page.tsx`
- **Unica Landing Page**: nell'`useEffect` iniziale (righe 216-224), `setStep` viene impostato sempre a `'intro'` (non più `'base'` per utenti di ritorno).
- **Prop `onOpenTools`**: `<IntroScreen onStart={startFromIntro} onOpenTools={() => setStep('base')} />`.

### 2. `frontend/src/components/home/IntroScreen.tsx`
- Aggiunta prop `onOpenTools?: () => void`.
- Sostituito il singolo bottone "Inizia" con una sezione a due schede responsive (`Bussola` e `Strumenti`):
  - **Bussola**: icona Lucide `Compass`, spiegazione dell'orientamento, pulsante principale `Bussola` che chiama `onStart`.
  - **Strumenti**: icona Lucide `LayoutGrid`, spiegazione del catalogo completo, pulsante secondario `Strumenti` che chiama `onOpenTools`.
- Mantenuta l'accessibilità e i titoli `<h2>` per le 3 attività per non rompere i test esistenti.

### 3. `frontend/src/components/home/ReturningHome.tsx`
- **Icone trasparenti**: `categoryImage` ora usa le illustrazioni condivise ad alpha pulito:
  - `assessment` → `/images/intro/profiles.png`
  - `guided` → `/images/intro/paths.png`
  - `learning` → `/images/intro/practice.png`
- **Pulsante Torna alla presentazione**: aggiunto nella testata in alto accanto al titolo `Strumenti`:
  - Icona `ArrowLeft`, etichetta `t('base.backToIntro')`, chiama `onOpenIntro`.

### 4. `frontend/src/lib/i18n.ts`
- Aggiunte le chiavi di traduzione in tutte e 6 le lingue (`it`, `en`, `es`, `fr`, `de`, `sv`):
  - `app.intro.actions.label`
  - `app.intro.action.compass.label`
  - `app.intro.action.compass.desc`
  - `app.intro.action.tools.label`
  - `app.intro.action.tools.desc`
  - `base.backToIntro`

### 5. `frontend/tests/account-onboarding.test.mjs`
- Aggiornato il test della schermata iniziale:
  - Cerca il pulsante `Bussola` (invece di `Inizia`).
  - Verifica la presenza del pulsante `Strumenti`.

---

## 3. Stato dei Test & Validazione

- **Test unitari frontend**:
  ```bash
  npm test --prefix frontend
  ```
  **Risultato**: 196 su 196 test superati (`pass 196, fail 0`).

---

## 4. Prossimi Passi Consigliati

1. **Verifica build**:
   ```bash
   npm run build --prefix frontend
   ```
2. **Aggiornamento container Docker (se necessario)**:
   ```bash
   docker compose up -d --build
   ```
3. **Commit & Push su GitHub**:
   ```bash
   git add frontend/src/app/page.tsx frontend/src/components/home/IntroScreen.tsx frontend/src/components/home/ReturningHome.tsx frontend/src/lib/i18n.ts frontend/tests/account-onboarding.test.mjs
   git commit -m "feat: set welcome screen as sole landing page with compass and tools actions, align category icons"
   git push origin feature/double-click-selection-advance
   ```
