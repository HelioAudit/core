# HelioAudit Core

Backend workspace for HelioAudit. Contains two apps:

| Folder | Stack | Purpose |
|--------|-------|---------|
| [`quick-test/`](./quick-test/) | Node.js + Express | Fast MVP scanner — paste a GitHub URL, run open-source security tools, get a JSON report |
| [`api/`](./api/) | NestJS 11 | Production API backend (Prisma, PostgreSQL, and full platform features to come) |

## Quick start

### Quick-test (Express scanner)

```bash
cd quick-test
npm install
npm run dev
```

Server: `http://localhost:4000` — see [quick-test/README.md](./quick-test/README.md) for full setup, scanner install, and API docs.

### NestJS API

```bash
cd api
npm install
npm run dev
```

Server: `http://localhost:3001` — see [api/README.md](./api/README.md).

## Repository layout

```
core/
├── quick-test/      # Express + TypeScript security scanner MVP
│   ├── src/
│   ├── scripts/
│   └── README.md
├── api/             # NestJS production backend
│   ├── src/
│   └── README.md
└── README.md        # this file
```

## Related projects

- [`../landing-page/`](../landing-page/) — Next.js marketing site (Hero Quick Test UI consumes the scanner API)
