# Trackable — frontend

Next.js (App Router, TypeScript, Tailwind) frontend for the Trackable warehouse material traceability
system. The backend (Django REST API), documentation and deployment files live in
[trackable-backend](https://github.com/suryanshu-15/trackable-backend).

## Setup

Clone this repository into the backend repository's `frontend/` folder (docker-compose and
`npm run gen:api` expect that layout):

```bash
git clone https://github.com/suryanshu-15/trackable-backend.git trackable
cd trackable
git clone https://github.com/suryanshu-15/trackable.git frontend
cd frontend
npm install
cp .env.example .env.local    # BACKEND_URL=http://localhost:8000
npm run dev                   # http://localhost:3000 — the backend must be running
```

## Commands

```bash
npm test                      # vitest: forms, scan workflow, permissions, error states, API proxy
npm run typecheck && npm run lint
npm run build && npm start    # production build (set COOKIE_SECURE=false for plain-http testing)
npm run gen:api               # regenerate src/lib/api-schema.d.ts from ../backend/schema.yml
```

## How it works

The browser only talks to this app. `/bff/*` forwards to Django's `/api/v1/*` and attaches the session
token, which is kept in httpOnly cookies. Every business rule and permission is enforced by the backend;
screens show the actions the API allows and re-read server state after each change.

See the backend repository's `docs/` for the functionality checklist, the end-to-end test guide,
decisions and the runbook.
