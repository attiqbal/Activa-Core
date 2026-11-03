# Virtual Nafree

A store of AI employees for people who know nothing about AI. Browse, try, hire, and get work done, like shopping online.

Stage 1 is deliberately small: a basic package of AI employees (Finance manager, Marketing manager, Business consultant, HR manager) set up by a free Admin manager, one strong model, and the core platform they run on. Everything is a module so vendors, a marketplace, payments and integrations can be added later without rewrites.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module design and rules.

## Develop

```
npm install
npm run check   # typecheck and tests
```

Copy `.env.example` to `.env` for API keys. Never commit keys.

## Website

The marketing site, onboarding flow and control center live in `web/` (Vite + TypeScript, no framework).

```
cd web
npm install
npm run dev     # http://localhost:5173 (forwarded automatically in a Codespace)
npm run build
```

Pages: `/` landing, `/onboarding.html`, `/app.html` (control center demo with example data; `/app.html#setup` is the Admin manager's setup form). Onboarding and the control center are front-end demos with simulated sign-in and data until the backend modules are wired in. Design tokens are in `web/src/styles.css`.
