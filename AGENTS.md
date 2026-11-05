# Repository Guide

## Structure

- `src/` contains the Express API, Mongoose models, authentication middleware, and configuration.
- `brainly-frontend/` contains the React 19 and Vite frontend. Treat it as a separate npm project with its own dependencies and scripts.
- The root TypeScript project compiles `src/**/*.ts` to `dist/` and excludes the frontend.

## Commands

Run commands from the relevant project directory:

- API build: `npm run build` at the repository root.
- API start: `npm start` at the repository root. The API listens on port 3000 and expects MongoDB at `mongodb://localhost:27017/brainly`.
- Frontend development server: `npm run dev` in `brainly-frontend/`.
- Frontend production build: `npm run build` in `brainly-frontend/`.
- Frontend lint: `npm run lint` in `brainly-frontend/`.

There is no configured test script in either package at present. Run the relevant build or lint command after changes.

## Conventions

- Keep API source in TypeScript, use ES module imports with `.js` extensions for local API imports, and preserve the strict compiler settings in the root `tsconfig.json`.
- Keep frontend changes within `brainly-frontend/` and follow its existing React, TypeScript, CSS, and component conventions.
- Keep changes scoped to the owning project. Do not edit generated output in `dist/` or build artifacts unless explicitly requested.
- Preserve existing API routes and response shapes unless the task specifically requires changing them.