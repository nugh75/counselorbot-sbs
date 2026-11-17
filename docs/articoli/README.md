# Articoli su CounselorBot

Testi destinati alla pubblicazione (bozze, manoscritti sottomessi, versioni accettate, post-print) che parlano di CounselorBot: articoli scientifici, saggi, capitoli, contributi per riviste o convegni.

Questa cartella contiene i testi **nostri**. Le schede di lettura di articoli altrui restano in `schede-bibliografiche/`.

## Come nominare i file

```
AAAA_<autori>_<titolo-breve>_<lingua>.md
```

Esempi:

```
2026_dragoni-margottini_interfaces-education_pt.md
2026_dragoni_counselorbot-scuola_it.md
```

- `AAAA` è l'anno di redazione o di pubblicazione.
- autori in minuscolo, cognomi separati da un trattino.
- titolo breve in minuscolo, parole separate da un trattino, senza articoli.
- lingua con il codice ISO a due lettere (`it`, `pt`, `en`).
- stesso articolo in più lingue = stesso nome con codice lingua diverso.

Finché l'articolo è in lavorazione la cartella può avere un nome leggibile e provvisorio, per esempio `Articolo per Interfaces da Educação`; prima della sottomissione si rinomina secondo la convenzione.

Un articolo con più file (figure, allegati, bibliografia) diventa una sottocartella con lo stesso nome del manoscritto principale:

```
docs/articoli/2026_dragoni_interfaces-education_pt/
  articolo.md
  figure/
  bibliografia.bib
```

## Frontmatter

Ogni articolo inizia con un blocco YAML coerente con `schede-bibliografiche/`:

```yaml
---
titolo: "Titolo dell'articolo"
autori:
  - Nome Cognome
anno: 2026
tipo: articolo
lingua: pt
stato: bozza
rivista: "Interfaces da Educação"
doi: ""
parole_chiave:
  - CounselorBot
  - intelligenza artificiale
---
```

`stato` ammette `bozza`, `revisione`, `sottomesso`, `accettato`, `pubblicato`.

## Regole

- Una cartella, un articolo: niente testi misti nello stesso file.
- Il testo è la fonte; PDF o DOCX finali si aggiungono solo se servono alla revisione, nella stessa sottocartella.
- Quando l'articolo è pubblicato, aggiungere `doi`, `rivista`, annata e pagine nel frontmatter.
- Nessun dato reale di studenti, docenti o classi: esempi, estratti di chat e tabelle vanno anonimizzati prima del caricamento.
