# CounselorBot frontend

This is the Next.js App Router frontend for CounselorBot SBS.

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Framer Motion
- Recharts and Plotly for charts
- `react-markdown` for AI responses and document previews

## Main routes

- `/` — student flow: counselor selection, instrument selection, manual input or upload, profile visualization, and guided AI chat.
- `/assistente` — RAG-based assistant over project documentation and strategic-competence sources.
- `/pqbl` — PDF upload and pure Question-Based Learning session.
- `/profilo` and `/profilo/cambiamenti` — learner profile and profile history.
- `/questionario` — user feedback questionnaire.
- `/somministrazione` — administration-plan entry flow.
- `/admin` — research/admin console.
- `/api/chat/stream` — filesystem API route for Server-Sent Events; this bypasses the normal Next.js rewrite because rewrites buffer streaming responses.

## Backend access

`next.config.ts` rewrites frontend calls from `/api/:path*` to `http://backend:8000/:path*` inside Docker. The exception is `/api/chat/stream`, implemented in `src/app/api/chat/stream/route.ts` for streaming chat.

`/counselorbot` and `/counselorbot/*` redirect to `/` so the app can be mounted behind a proxy under that path.

## Development

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

Useful checks:

```bash
npm run lint
npm run build
npx tsc --noEmit
```

## Production build

The Dockerfile builds a standalone Next.js output and runs it with `node server.js`:

```bash
docker compose up -d --build frontend
```

Any frontend code or dependency change requires rebuilding the image in Docker-based deployments.

## Notes for contributors

- Student-facing strings are centralized under `src/lib/i18n*.ts` where possible.
- Admin translations live in `src/lib/i18n-admin.ts`; add keys to all supported language blocks.
- Authentication data comes from `/auth/me`, which is backed by ai4auth forward-auth headers in production.
- Chat streaming errors are emitted as SSE `{error}` events and handled by `src/lib/chat-stream.ts`.
