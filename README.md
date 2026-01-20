# CounselorBot

CounselorBot è un'applicazione web AI-powered progettata per aiutare gli studenti ad analizzare le loro strategie di apprendimento (QSA).

## Prerequisiti

*   **Python** 3.10 o superiore
*   **Node.js** 18 o superiore
*   **npm** (o yarn/pnpm)

## Installazione e Avvio

Il progetto è diviso in due parti: **Backend** (FastAPI) e **Frontend** (Next.js). È necessario avviare entrambi per far funzionare l'applicazione.

### 1. Backend Setup

1.  Spostati nella cartella `backend`:
    ```bash
    cd backend
    ```

2.  Crea un virtual environment (se non esiste già):
    ```bash
    python3 -m venv venv
    ```

3.  Attiva il virtual environment:
    *   **Mac/Linux**: `source venv/bin/activate`
    *   **Windows**: `venv\Scripts\activate`

4.  Installa le dipendenze:
    ```bash
    pip install -r requirements.txt
    ```

5.  Torna nella root del progetto e avvia il server backend:
    ```bash
    cd ..
    uvicorn backend.main:app --reload --port 8000
    ```
    Il backend sarà attivo su `http://localhost:8000`.

### 2. Frontend Setup

1.  Apri un nuovo terminale e spostati nella cartella `frontend`:
    ```bash
    cd frontend
    ```

2.  Installa le dipendenze:
    ```bash
    npm install
    ```

3.  Avvia il server di sviluppo:
    ```bash
    npm run dev
    ```
    Il frontend sarà attivo su `http://localhost:3000`.

## Accesso all'Applicazione

*   **Home Page**: [http://localhost:3000](http://localhost:3000)
*   **Login**: [http://localhost:3000/login](http://localhost:3000/login)
*   **Admin Dashboard**: [http://localhost:3000/admin](http://localhost:3000/admin)

### Credenziali di Test (Sviluppo)
Se hai popolato il database con script di test o registrato un utente:
*   **Username**: `admin` (o quello registrato)
*   **Password**: `admin123` (o quella registrata)

> **Nota**: Puoi registrare un nuovo account amministratore direttamente dalla pagina di Login cliccando su "Registra un nuovo account".

## Funzionalità Principali

*   **Analisi QSA**: Inserimento manuale o caricamento assistito da AI (PDF/Foto).
*   **Dashboard Admin**: Configurazione delle API Key (OpenAI, Anthropic, Gemini, ecc.) e gestione dei Prompt di sistema.
*   **Chat AI**: Consulente virtuale basato sui punteggi QSA dell'utente.

---

## 🐳 Docker

L'applicazione può essere avviata con Docker Compose per un setup rapido.

### Prerequisiti Docker
- Docker e Docker Compose installati

### Avvio Rapido

```bash
docker compose up --build
```

Questo comando:
1. Costruisce le immagini per frontend e backend
2. Avvia entrambi i servizi
3. Monta il database SQLite per la persistenza dei dati

### Accesso
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000/docs

### Configurazione API Keys
Le chiavi API si configurano dal pannello admin:
1. Vai su http://localhost:3000/login
2. Accedi con `admin` / `admin123`
3. Configura provider e API Key nella sezione Configurazione

### Comandi Utili

```bash
# Avvia in background
docker compose up -d

# Ferma i container
docker compose down

# Ricostruisci dopo modifiche al codice
docker compose up --build

# Visualizza i log
docker compose logs -f
```

### Note
- Il database `counselorbot.db` viene montato come volume per persistere i dati
- Assicurati che le porte 3000 e 8000 siano libere prima di avviare
