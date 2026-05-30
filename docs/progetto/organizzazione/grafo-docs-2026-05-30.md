# Grafo della documentazione

Grafo aggiornato al 2026-05-30. Rappresenta la struttura canonica della cartella `docs/` dopo la migrazione e lo scarico delle fonti pubbliche da `competenzestrategiche.it`.

```mermaid
flowchart LR
  docs["docs/"]

  docs --> readme["README.md<br/>Indice principale"]
  docs --> progetto["progetto/"]
  docs --> validazione["validazione/"]
  docs --> questionari["questionari/"]
  docs --> prompting["prompting/"]
  docs --> implementazione["implementazione/"]
  docs --> fonti["fonti/"]

  progetto --> diario["diario.md<br/>Cronologia progetto"]
  progetto --> comunicazioni["comunicazioni/"]
  progetto --> organizzazione["organizzazione/"]
  comunicazioni --> mail_it["mail-olle.md"]
  comunicazioni --> mail_en["mail-olle-en.md"]
  organizzazione --> proposta["proposta-organizzazione-docs<br/>implementata-2026-05-30.md"]
  organizzazione --> grafo["grafo-docs-2026-05-30.md"]

  validazione --> progetto_validazione["progetto-validazione-qsa-qsar-sv-en.md"]
  validazione --> manuale["manuale-operativo-validazione.md"]
  validazione --> dettagli["dettagli-validazione-questionari.md"]
  validazione --> stanine["validazione-questionari-e-stanine.md"]
  validazione --> diagnosi["diagnosi-somministrazione-ensv.md"]
  validazione --> formule["formule/"]
  formule --> formule_pdf["formule-validazione.pdf"]
  formule --> latex["sorgenti-latex/"]

  questionari --> item_catalog["item-catalog.md"]
  questionari --> strumenti["strumenti/"]
  strumenti --> pdf_questionari["QAP, QPCC, QPCS,<br/>QSA, QSAr, ZTPI PDF"]

  prompting --> prompt_review["prompt-translations-review.md"]
  prompting --> live_prompt_review["live-db-prompt-translation-review.md"]

  implementazione --> verifica["verifica-implementazione.md"]

  fonti --> competenze["competenze-strategiche/"]
  competenze --> fonti_base["Fonti gia' presenti<br/>guide e convegni 2019-2023"]
  competenze --> sito["sito-competenzestrategiche/"]
  competenze --> esterne["fonti-esterne-collegate/"]

  sito --> sito_readme["README.md"]
  sito --> guide["guide/"]
  sito --> guide_html["guide-html/"]
  sito --> strumenti_extra["strumenti/"]
  sito --> modelli["modelli-operativi/"]
  sito --> studi["studi/"]
  sito --> convegni["convegni/"]

  esterne --> esterne_readme["README.md"]
  esterne --> cnos["cnos-fap/"]
  esterne --> roma3["roma-tre-press/"]

  readme --> progetto
  readme --> validazione
  readme --> questionari
  readme --> prompting
  readme --> implementazione
  readme --> fonti

  diario --> proposta
  diario --> sito
  diario --> esterne

  stanine --> progetto_validazione
  stanine --> diagnosi
  item_catalog --> progetto_validazione

  classDef root fill:#f8fafc,stroke:#334155,stroke-width:2px,color:#0f172a;
  classDef area fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e;
  classDef doc fill:#fefce8,stroke:#a16207,color:#713f12;
  classDef source fill:#ecfdf5,stroke:#047857,color:#064e3b;

  class docs root;
  class progetto,validazione,questionari,prompting,implementazione,fonti,competenze,sito,esterne area;
  class readme,diario,proposta,grafo,progetto_validazione,manuale,dettagli,stanine,diagnosi,item_catalog,prompt_review,live_prompt_review,verifica,sito_readme,esterne_readme doc;
  class fonti_base,guide,guide_html,strumenti,strumenti_extra,modelli,studi,convegni,cnos,roma3,pdf_questionari,formule,formule_pdf,latex source;
```

## Nota su grafifyy

La skill `grafifyy` non risulta installata o raggiungibile nella sessione corrente. Questo grafo e' quindi generato come Mermaid Markdown, formato semplice da versionare e convertibile in SVG/PNG con strumenti locali o editor compatibili.
