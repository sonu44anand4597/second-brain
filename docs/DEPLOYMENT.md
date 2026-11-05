# Deployment

Build and run the existing two-project architecture. Use a Node host for the Express API and MongoDB/Atlas for storage. Serve the static Vite build with a reverse proxy. This application was implemented locally; no public deployment was created and no production database was modified.

```sh
# Root
npm ci
npm run build
NODE_ENV=production npm start

# Frontend
cd brainly-frontend
npm ci
npm run build
```

Before starting the API, supply `MONGODB_URI`, a random 32+ character `JWT_SECRET`, exact HTTPS `CLIENT_ORIGIN`, `NODE_ENV=production`, and optional server-only AI configuration. Use the platform secret store, not a committed .env. The API waits for a successful database connection and fails startup clearly if unavailable. Send SIGTERM for graceful shutdown.

Deploy the frontend `brainly-frontend/dist` directory. Route `/api/` to the API and all remaining application routes to `index.html` so browser refreshes and public share links work. Keep frontend/API on the same HTTPS origin; this preserves the secure cookie model without third-party cookie dependencies. Do not point `VITE_API_URL` at a different site unless the identity and cookie configuration is designed and verified for that deployment.

Example Nginx location blocks (inside an HTTPS server with certificate configuration):

```nginx
root /srv/commonplace/brainly-frontend/dist;
index index.html;

location /api/ {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_read_timeout 60s;
}
location / {
  try_files $uri $uri/ /index.html;
}
```

The API deliberately does not trust arbitrary forwarded IP headers. At a controlled reverse proxy, configure Express `trust proxy` to the exact trusted hop/network before using forwarded client IPs for individual IP rate limiting. Otherwise auth/general limits apply to the proxy address, while account-scoped AI limits continue to work.

At the proxy, add a Content-Security-Policy appropriate to the built assets (script/style self, no third-party embeds), HTTPS/HSTS, request limits and operational logging. The theme-initialization inline script needs a CSP hash or nonce if inline scripts are disallowed. Do not blindly allow arbitrary scripts. Use an egress firewall as a second layer for public-page extraction. Backup and monitor MongoDB; preserve unique/index constraints. Apply the documented migration only after backup and review.

BYOK provider configuration is described in [AI providers](AI-PROVIDERS.md). Keys are kept in process memory; use one API instance or sticky routing until a separately reviewed encrypted shared vault is available. Do not enable custom endpoints without the explicit hostname allowlist; Ollama is disabled unless the operator enables a loopback service. No new database migration is required.

For several API replicas, replace the in-process rate-limit/generation maps with shared Redis-backed counters and locks. Build durable search/vector indexes and background ingestion before large datasets. Set provider spend budgets and retention policies operationally; the app currently limits requests/hour but does not meter provider billing.

Deployment smoke test: signup/signin → capture → refresh → edit → ask with real credentials → inspect citations → create/review cards → share selection in a private window → revoke → logout → verify `/me` is unauthorized. Verify that no provider keys or private fields appear in browser bundles/public responses.
