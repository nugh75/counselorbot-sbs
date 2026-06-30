# CounselorBot SBS

CounselorBot SBS is an AI-assisted learning and career guidance web app. Students complete or discuss educational instruments, review their profile with an AI counselor, build a learner profile and portfolio, and can use a PDF-based pQBL learning flow. Administrators manage instruments, prompts, AI models, counselors, logs, validation exports, benchmark runs, and training datasets.

## Documentation

Stable project documentation lives in [`docs/`](docs/). Start from [`docs/README.md`](docs/README.md).

## Stack

- **Backend**: FastAPI, SQLAlchemy, PostgreSQL, Uvicorn
- **Frontend**: Next.js App Router, React, TypeScript, Tailwind CSS
- **Runtime**: Docker Compose, PostgreSQL, ai4auth forward-auth, optional local/remote AI providers
- **AI providers**: OpenAI, Anthropic, Gemini, Mistral, OpenRouter, Ollama, llama.cpp-compatible endpoints

## Main features

- Guided chat for QSA, QSAr, ZTPI, Savickas, QPCS, QPCC, and QAP.
- Manual scoring and QSA PDF/image upload assisted by local OCR/parser models.
- Student booklet PDFs, learner profile, reflections, portfolio items, and certified strategies.
- Public site assistant with RAG over project documentation and strategic-competence sources.
- pQBL from uploaded PDFs: question generation, guided practice, summaries, and final test.
- Admin console for config, prompts, guided steps, suggested questions, counselors, model presets, logs, costs, benchmarks, validation exports, instruments, administration plans, research contacts, and QSA training datasets.

## Repository layout

```text
backend/                 FastAPI app, routes, models, AI dispatch, scoring, tests
frontend/                Next.js app, UI components, i18n, SSE route for chat streaming
docs/                    Stable project documentation and research materials
docs-counselorbot/       Documentation corpus used by the site assistant
knowledge/               Approved strategy knowledge base used by chat
scripts/                 Prompt-testing helper script used by Makefile
training_datasets/       Dataset artifacts and exports
uploads/                 Runtime upload storage mounted in Docker
session_memory/          Runtime chat memory mounted in Docker
```

## Configuration

1. Copy or create a `.env` file from [`.env.example`](.env.example).
2. Set PostgreSQL credentials and any AI provider keys you need.
3. In production, ai4auth injects `Remote-*` identity headers through the reverse proxy. Admin access is controlled by admin groups.
4. API keys can be managed from the admin panel, but environment variables take precedence at runtime.

Do not commit `.env` files, API keys, production uploads, or database dumps.

## Docker setup

The production-oriented setup is Docker Compose. Code is baked into the backend and frontend images, so application changes require a rebuild.

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f backend
```

Services:

- Backend: exposed inside Docker on `8000`, host-only on `127.0.0.1:8088`
- Frontend: host-only on `127.0.0.1:3000`
- PostgreSQL: host port `5435`

The compose file also joins the external `proxy-network` and `ai4educ-console_default` networks for reverse proxy and ai4auth integration.

## Local development

Backend:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..
uvicorn backend.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. Without ai4auth headers or a valid ai4auth session, the app runs as an anonymous user and admin functionality is unavailable.

## Useful commands

```bash
# Frontend checks
cd frontend && npm run lint
cd frontend && npm run build

# Backend smoke test inside Docker
docker exec counselorbot_backend python -m backend.tests.test_smoke

# Database utilities from the host
python check_sequences.py
python migrate_data.py --dry-run
python migrate_data.py

# Deployment helpers
./deploy.sh
./update_nginx.sh
```

## Prompt testing

The Makefile runs the real prompt-audit path inside the backend container.

```bash
make help
make prompt-steps Q=QSA
make prompt-dry  Q=QSA STEP=intro
make prompt-test Q=QSA STEP=intro
make prompt-test Q=QSAr STEP=qsar-cognitive STUDENT=barbaraambu
make prompt-log  ID=<log id>
```

Defaults: `Q=QSA STEP=intro STUDENT=admin COUNSELOR=7 RESP_LANG=it KNOWLEDGE=true`.

More details: [`docs/make-prompt-testing.md`](docs/make-prompt-testing.md).

## API overview

Most frontend requests go through the Next.js rewrite `/api/:path* -> http://backend:8000/:path*`. Streaming chat uses the filesystem route `frontend/src/app/api/chat/stream/route.ts` to avoid rewrite buffering.

Main backend route groups:

- `/auth/me`
- `/chat`, `/chat/stream`, `/chat/message`, `/tts`
- `/qsa/guided-ui-texts`, `/qsa/audit`, `/qsa/upload`
- `/survey`, `/questionnaire-result`, `/instruments/{code}/score`, `/instruments/{code}/rules`
- `/user/learner-profile`, `/user/portfolio`, `/user/student-booklets`, `/user/certified-strategies`
- `/site-chat/*`
- `/pqbl/*`
- `/opencode/*`
- `/admin/*`
