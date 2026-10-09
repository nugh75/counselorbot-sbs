# UX Update — Class paths, Somministrazione, Obiettivi

Data: 2026-10-09  
Status: Bozza da approvare (decisioni 1-3 confermate dall'utente)

## 1. Pulsante percorso in ogni card classe

### Dove

Ogni card nella pagina `/docente/classi` ha già un pulsante "Open". Si sostituisce con **due azioni**:

- **Crea percorso per questa classe** (pulsante primario, visibile in alto a destra della card)
- **Apri classe** (pulsante secondario, come ora)

### Cosa fa

Il pulsante "Crea percorso" apre direttamente la pagina `/docente/classi/{id}?tab=paths` con il builder precompilato per quella classe. Se la classe non ha già un percorso attivo, crea una nuova bozza vuota. Se ne ha già uno, offre "Modifica percorso" o "Apri percorso".

### Regole

- Solo proprietari e co-insegnanti vedono il pulsante
- Se la classe è disattivata, il pulsante è invisibile
- Nessuna modifica al comportamento esistente: si aggiunge solo un'azione in più

## 2. Piano di somministrazione in italiano + codice per istituto

### Cambio lingua

Il piano di somministrazione è ora in italiano. Tutte le etichette, istruzioni e UI in IT. Il piano in inglese per le altre lingue (ES, FR, DE, SV) rimane invariato.

### Nuovo campo: codice/password per istituto

Aggiunto un campo nella sezione "Istanza" del piano di somministrazione:

- **Codice istituto** (campo testuale, obbligatorio)
- **Password per istituto** (campo password, obbligatorio)

Il codice è usato per identificare in modo univoco l'istituto che sta creando il piano, in modo che un solo amministratore possa modificare il piano a livello istituto.

### Regole

- Solo admin di un istituto vede i campi codice/password
- Per ogni istituto, il codice è univoco
- Se l'istituto non è registrato, il piano non può essere attivato
- Il codice/password non è visibile in produzione (solo nel database)

## 3. Separazione Obiettivi/Assegnazioni

### Obiettivi

Pagina `/docente/catalogo-obiettivi`: solo creazione catalogo
- Il docente crea gli obiettivi da usare
- Non c'è nessun pulsante per assegnarli (rimosso)
- Catalogo è un elenco di obiettivi disponibili

### Assegnazioni

Pagina `/docente/assegnazioni`: solo assegnazione
- Il docente vede gli obiettivi dal catalogo
- Li assegna a classi/studenti
- Può modificare gli obiettivi assegnati

### Regole

- Il docente non può più creare obiettivi **e** assegnarli nella stessa pagina
- Ogni pagina ha uno scopo chiaro: creazione vs assegnazione
- Se il docente vuole modificare un obiettivo assegnato, lo fa dalla pagina Assegnazioni
