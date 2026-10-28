# syntax=docker/dockerfile:1

# -----------------------------------------------------------------------------
# Stage 1 — install deps + build Nest API
# -----------------------------------------------------------------------------
FROM node:26-bookworm AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# -----------------------------------------------------------------------------
# Stage 2 — runtime with scanner CLIs (gitleaks + semgrep)
# -----------------------------------------------------------------------------
FROM node:26-bookworm AS runner

# Host tools required by quick-scan (clone, unzip, npm audit, install-scanners.sh)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    unzip \
    python3 \
    python3-pip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    HOME=/root \
    PATH="/root/.local/bin:${PATH}" \
    PIP_BREAK_SYSTEM_PACKAGES=1

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY scripts/install-scanners.sh ./scripts/install-scanners.sh

# Prerequisite: install Gitleaks + Semgrep (script also ensures pip if missing)
RUN chmod +x ./scripts/install-scanners.sh \
  && ./scripts/install-scanners.sh \
  && gitleaks version \
  && semgrep --version

EXPOSE 3001

CMD ["node", "dist/main.js"]
