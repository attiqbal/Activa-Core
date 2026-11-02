# Virtual Nafree

A store of AI employees for people who know nothing about AI. Browse, try, hire, and get work done, like shopping online.

Stage 1 is deliberately small: a few AI employees (Finance manager, Marketing manager, Market analyst), one strong model, and the core platform they run on. Everything is a module so vendors, a marketplace, payments and integrations can be added later without rewrites.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module design and rules.

## Develop

```
npm install
npm run check   # typecheck and tests
```

Copy `.env.example` to `.env` for API keys. Never commit keys.
