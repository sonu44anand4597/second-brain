# Testing and verification

The original repository had no test scripts. This implementation adds Node's test runner with tsx/Supertest, real MongoDB integration through mongodb-memory-server, and Playwright browser coverage. Test accounts/documents live only in isolated temporary MongoDB processes; they never touch the application's configured database.

## Commands

```powershell
# API directory
npm ci
npm run build
npm run lint       # Strict TypeScript check; no backend ESLint configuration is claimed.
npm test

# Frontend directory
cd brainly-frontend
npm ci
npm run typecheck
npm run lint       # Oxlint with warnings treated as failures.
npm run build
npx playwright install chromium
npm run test:e2e
```

The first API/browser test run downloads MongoDB 7.0.24. Network access is required unless a compatible binary is already cached. Use `MONGOMS_SYSTEM_BINARY` for an existing compatible mongod, or choose a cache location with `MONGOMS_DOWNLOAD_DIR`. CI should cache the binary and Playwright browser downloads.

On Windows with Chrome already installed, a separate Playwright browser download is unnecessary:

```powershell
$env:E2E_BROWSER_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
# Optional if C: is nearly full; choose a directory with adequate space.
$env:MONGOMS_DOWNLOAD_DIR = 'D:\CodexTemp\commonplace-mongodb'
npm run test:e2e
```

Ports 3087 (isolated API), 3097 (local provider fixture) and 5187 (frontend) must be free. Tests refuse to reuse another running application. Their frontend origin is explicitly allowlisted in the test server environment. Standard application ports remain 3000/5173. Production builds exclude the entire `scripts/` test harness; it is never started by `npm start` or `npm run dev`.

## Automated coverage

**32 unit/API integration tests:** scrypt and legacy migration; signup validation and duplicate usernames; valid/invalid signin; cookie and bearer restoration; missing/expired/revoked tokens; persistent content CRUD/notes/metadata/tags/favorites; safe URL normalization/duplicates; collection ownership and deletion; cross-user isolation; selected-sharing public allowlist/revocation; private IP and unsafe-protocol import blocking; missing AI configuration; real API-to-local-provider HTTP requests; exact source IDs/passages; invalid citations and provider rate limits; conversation persistence/ownership; generated recall quote validation; persistent scheduling/quiz scoring; deterministic intervals/chunk bounds; keyword retrieval and optional semantic-ranking cache isolation; CORS and JSON-only writes.

**Three browser tests:** the main workflow covers signup/signin/restoration, collection creation, note capture, source-text persistence, search, list/grid, pinned state across refresh, graph edges/selection/details, missing AI state, question submission and citation opening through a local provider fixture, generated-card review, quiz persistence, selected sharing in an unauthenticated browser, desktop/mobile layout, light/dark themes, command palette, content editing/deletion, logout and revoked-session handling. The second test checks invalid-login errors from the real API. The third exercises BYOK selection, key visibility, live-fixture model discovery, JSON connection validation, safe error feedback, free-only/paid-choice filtering, saved preference restoration, key removal, logout and absence of keys in browser storage. Uncaught browser errors fail the workspace and settings tests.

Provider tests additionally verify native Gemini and compatible request/response shapes, known invalid-key machine codes, no credential transfer between providers, memory expiration/session isolation, no server-default fallback after removal, pricing enforcement, unsupported modalities and bounded transport failure paths. The optional semantic unit test replaces only the embedding adapter with deterministic vectors; provider-boundary API/browser tests use an explicitly local HTTP fixture. These are test doubles at the external provider boundary, not production AI fallbacks. The real Express handlers, validation, retrieval, frontend and MongoDB run throughout. They verify integration mechanics; they cannot establish the quality or availability of a live cloud model.

## Manual verification and artifacts

Real public-page extraction was exercised against `https://www.iana.org/domains/reserved`: title `IANA-managed Reserved Domains`, 1,809 extracted source characters. This checks a real external HTTP/TLS path in addition to private-target rejection tests.

The browser workflow writes `brainly-frontend/artifacts/home-desktop.png`, `home-dark.png`, and `home-mobile.png`. These show actual records saved by the test through the application. Screenshots were visually inspected; responsive overflow is asserted at 390 px, and desktop navigation/themes were exercised at 1,280/1,440 px. Artifacts, traces, reports and generated builds are ignored by Git.

Latest completed verification: API build and strict type check passed; all 32 unit/API tests passed; frontend strict types, Oxlint with zero warnings, and production build passed; all three expanded Playwright tests passed. Both production dependency audits reported zero vulnerabilities. Do not treat an audit as proof of overall application security.

## Still requires operator verification

- Your existing MongoDB/Atlas credentials, indexes, backups and production data migration; the optional migration was documented but not run on personal data.
- Live cloud provider key/model compatibility, rate limits, generated answer quality and actual embedding service behavior.
- HTTPS deployment, proxy settings, secure cookies, operational limits, provider billing budgets and production monitoring.
- Browser families beyond the installed Chromium/Chrome used here; broad load testing and an independent accessibility/security audit.

The app has no fake “connected” provider health call. Settings reports whether server configuration is present; only a successful question/summary demonstrates an actual model request.
