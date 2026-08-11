# HelioAudit Core — GitHub Repository Security Scanner

Node.js backend that scans **public** GitHub repositories using open-source security tools. A user pastes a GitHub repo URL, the server checks if it's public, runs multiple scanners, and returns a JSON findings report.

---

## Table of contents

1. [What this does](#what-this-does)
2. [Prerequisites](#prerequisites)
3. [Full setup (from scratch)](#full-setup-from-scratch)
4. [Install scanner CLIs](#install-scanner-clis)
5. [Environment variables](#environment-variables)
6. [Run the server](#run-the-server)
7. [Test the API](#test-the-api)
8. [API reference](#api-reference)
9. [Response fields explained](#response-fields-explained)
10. [How it works](#how-it-works)
11. [Finding categories (13 types)](#finding-categories-13-types)
12. [Project structure](#project-structure)
13. [npm scripts](#npm-scripts)
14. [Performance expectations](#performance-expectations)
15. [Production notes](#production-notes)
16. [Troubleshooting](#troubleshooting)

---

## What this does

| Input | Output |
|-------|--------|
| `https://github.com/owner/repo` | JSON security report |

**Flow:**

```
User pastes GitHub URL
        ↓
POST /api/repository/scan
        ↓
GitHub API — is repo public?
        ↓
   ┌────────────┴────────────┐
  YES                        NO
   ↓                          ↓
Download repo            Return "private_repo"
   ↓                      (no scan run)
Run 4 scanners in parallel
   ↓
Merge + classify findings
   ↓
Return JSON report
```

**Scanners used:**

| Scanner | Detects | Tool |
|---------|---------|------|
| Gitleaks | Hardcoded secrets, API keys, tokens | [Gitleaks](https://github.com/gitleaks/gitleaks) |
| Semgrep | SQL/NoSQL injection, XSS, SSRF, path traversal, misconfig | [Semgrep OSS](https://semgrep.dev) |
| npm audit | Vulnerable dependencies (CVE/OSV) | Built into npm |
| Custom rules | Sensitive logs, eval/exec, auth heuristics | In-house Node.js |

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20+ | Required |
| npm | 9+ | Required for dependency audit |
| git | any | Used as clone fallback |
| unzip | any | Used to extract repo zip |
| Gitleaks | 8.30+ | Install via script below (not npm) |
| Semgrep | 1.x | Install via pip (not npm) |

---

## Full setup (from scratch)

### Step 1 — Clone and enter the project

```bash
cd ~/Work/HelioAudit/core/quick-setup
```

### Step 2 — Install Node.js dependencies

```bash
npm install
```

### Step 3 — Install scanner CLIs

See [Install scanner CLIs](#install-scanner-clis) below.

### Step 4 — Configure environment (optional)

```bash
cp .env.example .env.local
```

Edit `.env.local` if needed (see [Environment variables](#environment-variables)).

### Step 5 — Start the server

```bash
npm run dev
```

Server runs at **http://localhost:4000**.

### Step 6 — Test

```bash
curl http://localhost:4000/health

curl -X POST http://localhost:4000/api/repository/scan \
  -H "Content-Type: application/json" \
  -d '{"repoUrl":"https://github.com/expressjs/express"}'
```

---

## Install scanner CLIs

Scanner tools are **not npm packages** — they must be installed on the host.

### Option A — One-click script (recommended, no sudo)

```bash
cd core
bash scripts/install-scanners.sh
```

This installs:
- **Gitleaks** → `~/.local/bin/gitleaks`
- **Semgrep** → `~/.local/bin/semgrep` (via `pip install --user`)

### Option B — Manual install (no sudo)

```bash
# Create local bin folder
mkdir -p ~/.local/bin

# Gitleaks (Linux x64 — adjust arch if needed)
curl -fsSL -o /tmp/gitleaks.tar.gz \
  "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz"
tar xzf /tmp/gitleaks.tar.gz -C /tmp
mv /tmp/gitleaks ~/.local/bin/
chmod +x ~/.local/bin/gitleaks

# Semgrep
pip install --user semgrep

# Add to shell profile (permanent)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Verify installation

```bash
gitleaks version    # → 8.30.1
semgrep --version   # → 1.x.x
node -v             # → v20+
npm -v
git --version
```

> **Note:** The server automatically finds tools in `~/.local/bin` — no extra PATH config needed when running `npm run dev`, but your shell needs PATH set for manual CLI use.

---

## Environment variables

Copy `.env.example` to `.env.local` and edit as needed:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4000` | Server port |
| `GITHUB_TOKEN` | — | GitHub PAT — raises API rate limit from 60/hr to 5000/hr |
| `MAX_REPO_SIZE_MB` | `200` | Reject repos larger than this (MB) |
| `SCAN_TIMEOUT_SECONDS` | `120` | Timeout per scanner tool (seconds) |
| `SCAN_NPM_INSTALL` | `false` | Set `true` to run `npm install` before audit (slower, more accurate for transitive deps) |
| `LOG_LEVEL` | — | Set to `debug` for verbose server logs |

---

## Run the server

### Development (hot reload)

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

Expected startup log:

```
[INFO] [server] HelioAudit scanner API listening on http://localhost:4000
[INFO] [server] Endpoints: POST /api/repository/scan, GET /health
```

---

## Test the API

### Health check

```bash
curl http://localhost:4000/health
# → {"status":"ok","service":"helioaudit-scanner"}
```

### Scan a public repo

```bash
curl -X POST http://localhost:4000/api/repository/scan \
  -H "Content-Type: application/json" \
  -d '{"repoUrl":"https://github.com/barchart/marketdata-api-js"}'
```

### Pretty-print the response

```bash
curl -s -X POST http://localhost:4000/api/repository/scan \
  -H "Content-Type: application/json" \
  -d '{"repoUrl":"https://github.com/expressjs/express"}' \
  | python3 -m json.tool
```

### Test cases checklist

| Test | Expected result |
|------|-----------------|
| Small public repo | `status: "completed"`, findings returned |
| Medium repo (~400 files) | Scan completes in ~30–60 seconds |
| Private repo URL | `status: "private_repo"`, no scan run |
| Invalid / non-existent URL | `status: "not_found"` or `status: "error"` |
| All scanners installed | Each scanner shows `"status": "ran"` in response |

---

## API reference

### `GET /health`

Returns server status.

```json
{ "status": "ok", "service": "helioaudit-scanner" }
```

---

### `POST /api/repository/scan`

Scan a public GitHub repository.

**Request:**

```http
POST /api/repository/scan
Content-Type: application/json

{
  "repoUrl": "https://github.com/owner/repo"
}
```

**Response — scan completed:**

```json
{
  "repository": "expressjs/express",
  "status": "completed",
  "filesScanned": 213,
  "dependenciesScanned": 403,
  "scanDurationSeconds": 42,
  "scanPhases": {
    "githubApiMs": 495,
    "downloadMs": 919,
    "fileCountMs": 40093,
    "scannersMs": 40092,
    "totalMs": 41510
  },
  "scanners": [
    {
      "name": "gitleaks",
      "status": "ran",
      "durationMs": 477,
      "findingsCount": 0,
      "message": "Gitleaks ran successfully — no hardcoded secrets detected"
    },
    {
      "name": "semgrep",
      "status": "ran",
      "durationMs": 38046,
      "findingsCount": 14,
      "message": "Semgrep found 14 issue(s)"
    },
    {
      "name": "npm_audit",
      "status": "ran",
      "durationMs": 6822,
      "findingsCount": 33,
      "message": "npm audit found 33 vulnerable package(s) (package.json audit only (no lockfile))"
    },
    {
      "name": "custom_rules",
      "status": "ran",
      "durationMs": 49,
      "findingsCount": 2,
      "message": "Custom rules found 2 issue(s) across 105 file(s)"
    }
  ],
  "findingsSummary": {
    "critical": 4,
    "high": 26,
    "medium": 11,
    "low": 8
  },
  "findings": [
    {
      "id": "f001",
      "type": "vulnerable_dependency",
      "severity": "critical",
      "title": "lodash vulnerable to Code Injection via _.template",
      "file": "package.json",
      "line": 1,
      "description": "lodash@<=4.17.23 has known vulnerabilities (CVE/OSV).",
      "recommendation": "Run npm audit fix or upgrade lodash to a patched version.",
      "confidence": "high"
    }
  ]
}
```

**Response — private repo:**

```json
{
  "repository": "someuser/private-repo",
  "status": "private_repo",
  "message": "This repository is private. Contact us to scan it, or connect your GitHub account."
}
```

**Response — repo not found:**

```json
{
  "repository": "owner/nonexistent",
  "status": "not_found",
  "message": "Repository not found. Check the URL and try again."
}
```

**Response — error:**

```json
{
  "repository": "owner/repo",
  "status": "error",
  "message": "Description of what went wrong."
}
```

---

## Response fields explained

| Field | Description |
|-------|-------------|
| `repository` | GitHub repo in `owner/repo` format |
| `status` | `completed`, `private_repo`, `not_found`, or `error` |
| `filesScanned` | Number of source files scanned |
| `dependenciesScanned` | Number of npm dependencies checked |
| `scanDurationSeconds` | Total wall-clock time (seconds) |
| `scanPhases` | Timing breakdown per phase (milliseconds) |
| `scanners` | Per-tool status — shows what actually ran vs skipped |
| `findingsSummary` | Count by severity: critical / high / medium / low |
| `findings` | Full list of security findings |

### Scanner status values

| `scanners[].status` | Meaning |
|---------------------|---------|
| `ran` | Tool executed successfully |
| `skipped` | Tool not installed or not applicable (e.g. no package.json) |
| `failed` | Tool errored during execution |

### Finding fields

| Field | Description |
|-------|-------------|
| `id` | Unique ID (f001, f002, …) |
| `type` | Category (see table below) |
| `severity` | `critical`, `high`, `medium`, `low` |
| `title` | Short description |
| `file` | File path in the repo |
| `line` | Line number |
| `description` | Detailed explanation |
| `recommendation` | How to fix |
| `confidence` | `high`, `medium`, `low` |

---

## How it works

### Scan pipeline

```
1. Parse + validate GitHub URL
2. GET https://api.github.com/repos/{owner}/{repo}
   → check public/private, get default branch
3. If private → return private_repo (stop)
4. Download repo as zip (fallback: git clone --depth 1)
5. Run scanners in parallel:
   ├── Gitleaks   → hardcoded secrets
   ├── Semgrep    → SAST rules (injection, XSS, SSRF, etc.)
   ├── npm audit  → dependency CVEs
   └── Custom     → eval/exec, log leaks, auth heuristics
6. Merge, deduplicate, assign IDs, sort by severity
7. Return JSON report
8. Clean up temp directory
```

### What GitHub API is used for

```
GET https://api.github.com/repos/{owner}/{repo}
```

Checks: public vs private, default branch, repo size.

No code is sent to GitHub — only metadata is fetched.

---

## Finding categories (13 types)

| # | Category | Type key | Tool |
|---|----------|----------|------|
| 1 | Hardcoded secrets | `hardcoded_secret` | Gitleaks |
| 2 | Vulnerable dependencies | `vulnerable_dependency` | npm audit |
| 3 | Command injection | `command_injection` | Semgrep + custom rules |
| 4 | SQL injection | `sql_injection` | Semgrep |
| 5 | NoSQL injection | `nosql_injection` | Semgrep |
| 6 | XSS | `xss` | Semgrep |
| 7 | SSRF | `ssrf` | Semgrep |
| 8 | Path traversal | `path_traversal` | Semgrep |
| 9 | Dangerous APIs (eval, exec) | `dangerous_api` | Semgrep + custom rules |
| 10 | Security misconfiguration | `security_misconfiguration` | Semgrep |
| 11 | Sensitive data exposure | `sensitive_data_exposure` | Custom rules |
| 12 | Authentication issues | `authentication_issue` | Custom rules (heuristic) |
| 13 | Authorization issues | `authorization_issue` | Custom rules (heuristic) |

> Categories 12–13 are heuristic (lower confidence). A repo with no web routes may show zero findings for injection/XSS categories — that is normal.

---

## Project structure

```
core/quick-setup/
├── src/
│   ├── index.ts                    # Express server entry point
│   ├── types.ts                    # Scan response TypeScript types
│   ├── routes/
│   │   └── scan.ts                 # POST /api/repository/scan handler
│   ├── services/
│   │   ├── github.ts               # GitHub API — public/private check
│   │   ├── clone.ts                # Download repo (zip + git fallback)
│   │   └── scanner/
│   │       ├── index.ts            # Orchestrator — runs all scanners
│   │       ├── gitleaks.ts         # Secrets scanner
│   │       ├── semgrep.ts          # SAST scanner
│   │       ├── npmAudit.ts         # Dependency audit
│   │       ├── customRules.ts      # In-house heuristics
│   │       └── types.ts            # Scanner result types
│   └── utils/
│       ├── cliAvailable.ts         # Find gitleaks/semgrep in ~/.local/bin
│       ├── logger.ts               # Structured request + scan logs
│       ├── parseRepoUrl.ts         # GitHub URL parser
│       └── tempDir.ts              # Temp work directory helpers
├── scripts/
│   └── install-scanners.sh         # One-click Gitleaks + Semgrep install
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

---

## npm scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production server |
| `npm run lint` | Type-check without emitting |

---

## Performance expectations

For a ~400-file JavaScript repo with all scanners installed:

| Step | Typical time |
|------|-------------|
| GitHub API check | 1–2 sec |
| Download repo | 1–5 sec |
| Gitleaks | 0.5–8 sec |
| npm audit | 3–15 sec |
| Semgrep | 15–40 sec |
| Custom rules | < 1 sec |
| **Total** | **~30–60 sec** |

If Gitleaks or Semgrep are not installed, scans finish in ~5–10 seconds with partial results. Check the `scanners` array in the response to confirm which tools ran.

---

## Production notes

- Run behind a reverse proxy (nginx/Caddy) with request timeout ≥ 90 seconds
- Add IP-based rate limiting on `POST /api/repository/scan`
- Set `GITHUB_TOKEN` to avoid GitHub API rate limits (60 req/hr unauthenticated)
- Pre-install Gitleaks + Semgrep in your Docker image or VM
- Use `SCAN_NPM_INSTALL=true` only if you need deep transitive dependency analysis (adds significant time)
- Monitor server logs — every scan request and scanner step is logged with timestamps

---

## Troubleshooting

### Gitleaks / Semgrep show `"status": "skipped"`

Tools are not installed or not found. Run:

```bash
bash scripts/install-scanners.sh
gitleaks version
semgrep --version
```

### Scan finishes in ~3 seconds (too fast)

Gitleaks and Semgrep are likely skipped. Only npm audit + custom rules ran. Install the CLIs above.

### `wget` / `tar` error installing Gitleaks

The generic URL `gitleaks_linux_x64.tar.gz` does not exist. Use the versioned URL:

```
https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz
```

Or run `bash scripts/install-scanners.sh`.

### Gitleaks shows `"status": "failed"`

Fixed in current version — report is written to a temp file instead of `/dev/stdout`. Pull latest code and restart the server.

### npm audit shows 0 dependencies

Repo has no `package.json`. This is normal for non-Node projects.

### GitHub rate limit error

Set `GITHUB_TOKEN` in `.env.local`:

```
GITHUB_TOKEN=ghp_your_token_here
```

### No critical findings but serious CVEs listed

Severity mapping promotes code injection / RCE titles to `critical`. If still showing `high`, the npm advisory severity is used as-is.

---

## Daily cheat sheet

```bash
# Start server
cd ~/Work/HelioAudit/core/quick-setup && npm run dev

# Health check
curl http://localhost:4000/health

# Scan a repo
curl -s -X POST http://localhost:4000/api/repository/scan \
  -H "Content-Type: application/json" \
  -d '{"repoUrl":"https://github.com/owner/repo"}' | python3 -m json.tool

# Check which scanners ran
curl -s -X POST http://localhost:4000/api/repository/scan \
  -H "Content-Type: application/json" \
  -d '{"repoUrl":"https://github.com/owner/repo"}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(json.dumps(d.get('scanners'), indent=2))"
```
