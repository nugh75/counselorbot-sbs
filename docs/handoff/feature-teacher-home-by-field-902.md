# Handoff feature/teacher-home-by-field-902

## Stato
Implementato, PR in apertura contro main (#902, frontend only).

## Fatto
- Home `/docente` per ambito: La mia classe · Libreria (Obiettivi per la classe primo) · Provare (studenti di prova + strumenti senza OBIETTIVO_DOCENZA) · Ricerca · Il mio profilo (+ API).
- Rimossi `DidacticDesignSection`, `MyClassesSection`, `PracticeGymSection`; hub `risorse` fuori dalla home, `/docente/risorse` redirect a strategie.
- Breadcrumb di strategie, materiali, taccuini-prova direttamente sotto Area docenti (niente più passaggio da rotte redirect).
- `/docente/palestra`, `/docente/obiettivi`, `/docente/proposte` restano redirect.

## Verifiche
- node --test teacher-area + teacher-breadcrumbs: 15 pass. tsc: solo errori PNG preesistenti (immagini guida mancanti). eslint 0 errori, i18n:check ok.
- tests/teacher-area-home.test.mjs (dev webpack su 3192, ora fermo): tutto ok tranne la sezione 2 (`/docente/classi`, testo «Gruppi e classi che gestisco» non trovato): codice non toccato, probabile test preesistente rotto.

## Prossimi passi
Review e merge utente. Nessun passo sudo/deploy; il deploy tocca frontend/ (rebuild --no-deps frontend).

## Blocchi e rischi
- Chiavi i18n ora non usate (breadcrumbRisorse, breadcrumbPalestra, resourcesCardDescription, resourcesDirect*, practiceGymTitle, didacticDesign*) lasciate: coperte da teacher-area.test.ts.
