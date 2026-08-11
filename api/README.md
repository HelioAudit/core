# HelioAudit NestJS API

Production backend for HelioAudit. Built with NestJS 11.

## Commands

```bash
cd ~/Work/HelioAudit/core/nestjs
npm install
npm run dev
```

Health check:

```bash
curl http://localhost:3001/health
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` | HTTP server port |

Copy `.env.example` to `.env.local` when needed.
