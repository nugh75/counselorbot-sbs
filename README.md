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

### Autenticazione

In produzione l'identita' viene fornita da **ai4auth** tramite il reverse proxy. In sviluppo locale, senza gli header forward-auth o una sessione ai4auth verificabile, l'applicazione opera come utente anonimo e le funzioni amministrative non sono disponibili.

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
3. Avvia PostgreSQL e conserva i dati nel volume `postgres_data`

Il compose di produzione collega inoltre frontend e backend alle reti Docker esterne `proxy-network` e `ai4educ-console_default`, necessarie per proxy e autenticazione.

### Accesso
- **Frontend**: http://localhost:3000
- **PostgreSQL**: localhost:5435

### Configurazione API Keys
Le chiavi API si configurano dal pannello admin:
Le chiavi si configurano dal pannello admin dopo autenticazione ai4auth, oppure tramite le variabili in `.env` (che hanno precedenza sulla configurazione salvata nel database).

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

### Utility Operative

```bash
# Controllo read-only delle sequence PostgreSQL
python check_sequences.py

# Verifica dell'import legacy SQLite -> PostgreSQL senza scritture
python migrate_data.py --dry-run

# Import legacy effettivo, dopo aver verificato il dry-run
python migrate_data.py

# Reinstalla soltanto la configurazione Nginx Proxy Manager
./update_nginx.sh

# Build, avvio Compose e aggiornamento Nginx
./deploy.sh
```

Le utility database leggono `POSTGRES_HOST_PORT` da `.env`; con il compose fornito il valore host e' `5435`.

### Note
- Nel compose il database applicativo e' PostgreSQL; `counselorbot.db` resta il fallback SQLite per l'avvio locale senza `DATABASE_URL` e per eventuali migrazioni legacy.
- Il frontend espone `127.0.0.1:3000`; il backend resta accessibile all'interno delle reti Docker e tramite proxy.
