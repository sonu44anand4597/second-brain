# Commonplace frontend

React 19/TypeScript/Vite workspace connected to the existing Express/MongoDB API.

```powershell
npm ci
npm run dev
```

Start the API from the parent directory first. Vite proxies `/api` to port 3000; use the Local URL it prints. Set the exact frontend origin in the API's `CLIENT_ORIGIN` if using another port. For production, serve `dist` with a same-origin `/api` reverse proxy and SPA route fallback.

```powershell
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

See the [project README](../README.md) for environment/setup, [architecture](../ARCHITECTURE.md), [API](../docs/API.md), [test setup](../docs/TESTING.md), [deployment](../docs/DEPLOYMENT.md), and [teacher demonstration](../docs/DEMO.md).

Source is organized by feature under `src/features`. TanStack Query owns server state; React context holds transient capture/detail/toast state. The command palette uses Ctrl/Cmd K and quick capture Ctrl/Cmd J. Notes use safe Markdown previews; fetched HTML is never injected into the UI. Theme preference is browser-local; authentication uses HttpOnly cookies, never localStorage tokens.
