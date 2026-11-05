# Commonplace

A thoughtful home for your knowledge. Capture sources and notes, organize collections, follow real connections, ask grounded questions, and practice recall.



## Run locally

Use Node 24 LTS and MongoDB 7+ (local MongoDB or Atlas). The actual project root is this folder, inside the outer `second-brain-main` workspace folder.

```powershell
# API terminal, from this directory
npm ci
Copy-Item .env.example .env
# Edit .env with your MongoDB URI. Optionally configure AI.
npm run dev

# Frontend terminal
cd brainly-frontend
npm ci
npm run dev
```

Open the Local URL Vite prints, normally http://127.0.0.1:5173. If that port is occupied, choose another port and add its exact origin to `CLIENT_ORIGIN`. Vite forwards `/api` to port 3000; set the development-only `API_PROXY_TARGET` environment variable if the API runs elsewhere.

Signup requires a username of 3–80 characters and a password of at least 8 characters. Existing accounts can still sign in with their original passwords. No demo account or fabricated data is inserted into your database.

## What is implemented

- Responsive workspace: eight functional pages, collapsible desktop sidebar, mobile drawer, light/dark themes, account controls, search/command palette (`Ctrl/Cmd K`) and capture (`Ctrl/Cmd J`).
- Authentication: existing JWT bearer contract plus HttpOnly cookie sessions, restoration, expiration handling, logout with server-side session revocation, scrypt passwords and automatic legacy-password upgrade at login.
- Dashboard: actual counts, recent saves, pinned resources, collections, content distribution and due review cards. Empty accounts get useful empty states.
- Library: persisted notes and resources, add/edit/delete, pinned items, grid/list views, lexical search across saved text, highlighted matches, type/tag/collection filters, sorting, client pagination and bulk pin/add-to-collection actions.
- Capture: bounded, DNS-pinned public-page metadata and readable-text extraction; editable fields; manual source text; explicit metadata-only states; safe URL normalization and duplicate detection.
- Collections: create, rename, delete, add/remove membership through resource editing, and filtered resource views. Deleting a collection preserves its resources.
- Ask My Brain: private retrieval over actual text/descriptions, complete provider responses, clickable numbered citations, retrieved passages, saved conversations, follow-up context, copy, retry, cancellation, regeneration and deletion.
- Knowledge Graph: real shared-tag/collection edges, draggable nodes, pan/zoom, search/focus, relationship filters, adjacent-node highlighting, source details and fit-to-view. Limited to the newest 100 nodes and 350 rendered edges.
- Content AI: five summary formats, summary persistence, reviewable tag suggestions and individually accepted/rejected tags. Existing tags are preserved.
- Recall Studio: verified source-quoted flashcards, deterministic review scheduling, multiple-choice quizzes, persisted review progress and quiz sessions. Existing cards work without AI credentials.
- Sharing: preserve legacy whole-brain links; create selected-resource or explicitly consented whole-brain links; public read-only view; rotation/revocation; explicit public field allowlist.

## Stack and structure

React 19, TypeScript with strict checking, Vite, React Router, TanStack Query, React Hook Form/Zod, Lucide, React Flow, Tailwind pipeline and custom design tokens. The backend uses Express 5, Mongoose, JWT, Zod, Node crypto, Cheerio and ipaddr.js.

```text
src/                     API, models, authentication, security, AI and extraction
brainly-frontend/src/
  app/                   providers and workspace UI state
  components/            shared UI and persistent layout
  features/              auth, dashboard, library, collections, graph, AI, recall, sharing, settings
  hooks/                 typed server queries and reusable hooks
  lib/                   API client and knowledge algorithms
  types/                 API domain contracts
tests/                   unit and real-Mongo API integration tests
brainly-frontend/e2e/     real browser end-to-end tests
scripts/                 isolated test API and optional additive migration
docs/                    API reference, deployment, testing and demo guide
```

Server data stays in TanStack Query, with cancellation and invalidation after mutations. Only short-lived UI state is shared through React context. Pages are lazy loaded. Errors have actionable messages; external content is rendered as plain text to avoid HTML injection. The Markdown note editor includes a GFM preview; raw HTML is skipped and remote images are represented by descriptive text.

## AI setup and grounding

Open **Settings / AI Settings / Configure provider and API key**. Choose Gemini (primary), OpenRouter, Groq, OpenAI, an approved custom endpoint, or enabled local Ollama. Add your own key, load current text models, run **Test Connection**, then **Save Preferences**. Keys stay in authenticated server memory, never localStorage or MongoDB; only non-sensitive preferences are saved locally. Key removal/logout/expiry do not activate a fallback provider. Test Connection makes a real small generation request; saving alone is labelled untested. See [provider setup, free-tier limits and security](docs/AI-PROVIDERS.md).

Optional existing administrator defaults (`AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `EMBEDDING_MODEL`) remain supported. BYOK text features need no extra server variables. Named `AI_PROVIDER`, custom-host allowlisting and local Ollama are optional; see `.env.example`.

Without credentials, core functionality, graph, sharing and existing study cards work. AI controls explain the missing configuration. There are no simulated answers.

Retrieval splits saved text (or descriptions when text is absent) into overlapping passages. It first restricts candidates to the signed-in owner. Default ranking matches question words against passages, titles and tags. Optional embedding similarity reranks a bounded candidate set; vectors use a bounded owner/model/text-hash cache. Answers are generated only from retrieved passages. Invalid citation indices are rejected, and citations resolve to saved item IDs and the exact retrieved text. Grounding reduces hallucination; users should still verify AI interpretations against the cited passages.

Study cards require saved text of at least 80 characters. Every generated quote must be an exact substring of a selected source; the short answer must occur in that quote and among four unique options. Unsupported cards are discarded. “Again” is due in 10 minutes; Hard uses `max(1, round(previous days × 1.2))`, Good `max(1, round(previous days × 2.5))`, Easy `max(4, round(previous days × 3.5))`. Review count, interval, last rating and due date persist.

See [ARCHITECTURE.md](ARCHITECTURE.md) for security boundaries and retrieval limits, [API reference](docs/API.md) for contracts, and [migration notes](docs/MIGRATION.md) before upgrading an existing database.

## Environment

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection; defaults to local `brainly` |
| `PORT` | API port, default 3000 |
| `JWT_SECRET` | Required 32+ character random production signing secret |
| `CLIENT_ORIGIN` | Comma-separated exact allowed frontend origins |
| `NODE_ENV` | Set `production` on deployment; secure cookies are enabled |
| `AI_API_KEY` | Optional server-only provider key |
| `AI_BASE_URL` | Compatible provider base URL including version prefix |
| `AI_MODEL` | Provider chat model identifier |
| `EMBEDDING_MODEL` | Optional model enabling embedding retrieval |
| `AI_PROVIDER` | Optional named provider for the administrator default |
| `AI_CUSTOM_ALLOWED_HOSTS` | Optional exact public hostname allowlist for custom BYOK endpoints |
| `AI_ENABLE_OLLAMA` / `OLLAMA_BASE_URL` | Optional explicitly enabled loopback Ollama integration |
| `VITE_API_URL` | Browser API base, default `/api/v1`; never a secret |

No existing `.env` secrets were overwritten.

## Checks

```powershell
# Root: API strict types, build and tests
npm run lint
npm run build
npm test

cd brainly-frontend
npm run lint
npm run typecheck
npm run build
# One-time browser installation (or set E2E_BROWSER_PATH to installed Chrome)
npx playwright install chromium
npm run test:e2e
```

API tests run an isolated **real MongoDB process**, using mongodb-memory-server to download a test binary. They never connect to your application database. Provider-boundary integration tests use an explicitly local HTTP fixture to test protocol, isolation, citations, provider failure and grounded recall validation. They do not certify a live cloud model. Browser tests run a separate real API/database on port 3087, a local provider fixture on 3097 and Vite on 5187. They create disposable test accounts and verify AI citation/card UI mechanics without claiming live-cloud validation.

More options and the actual verification record are in [Testing](docs/TESTING.md). Deployment and reverse-proxy examples are in [Deployment](docs/DEPLOYMENT.md). See [Teacher demo and viva talking points](docs/DEMO.md) for a 2–3 minute walkthrough.

## Honest limits

- No live cloud AI key was available during implementation. Live provider compatibility, generated answer quality and optional embeddings need verification with your account.
- URL import reads static HTML `<article>`/`<main>` content, capped at 1 MB and 8 seconds per hop. It cannot bypass logins, run JavaScript, transcribe YouTube or read PDFs. Metadata-only imports say so. Preview images are not imported.
- Responses arrive as complete messages; this adapter does not implement token streaming. Stop aborts the browser/server provider request where possible; provider billing may already have occurred.
- Library search/pagination are client-side over an owner-scoped list; large-scale indexed search/vector infrastructure is a future scaling step. Ask considers the newest 1,000 resources and first 500 bounded passages, with up to six passages returned. Embeddings rerank at most 80 candidates.
- Summary and tagging generation rely on the model’s source adherence; unlike recall quotes, paraphrased summaries cannot be mechanically proven correct.
- No email/password reset, MFA, rich HTML editor, PDF ingestion, account deletion or collaboration permissions.
- Rate limits and generation locks are per-process. Use shared counters/locks for multiple API instances. Vectors are cached in memory, not stored in a vector database.
- Shared links are bearer capabilities: anyone with the URL can read shared resources. An explicitly whole-brain link includes future saves; rotation/revocation removes access.
- Existing data is preserved. Optional migration backfills defaults/normalized links without deleting duplicates. Legacy plaintext passwords remain until successful login upgrades them.
