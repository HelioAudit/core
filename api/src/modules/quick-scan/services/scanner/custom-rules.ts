import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { RawFinding } from "../../types";
import { log } from "../../utils/logger";
import type { ScannerRunResult } from "./types";

/** Longest suffix first so `.env.example` matches before `.example`. */
const SCAN_EXTENSIONS = [
  ".env.example",
  ".env.local",
  ".env",
  ".tsx",
  ".jsx",
  ".ts",
  ".js",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".go",
  ".java",
  ".php",
  ".json",
  ".yaml",
  ".yml",
] as const;

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "vendor",
  "__tests__",
  "__mocks__",
  "fixtures",
]);

const SKIP_PATH_PARTS = [
  "/test/",
  "/tests/",
  "/spec/",
  "/__tests__/",
  "/__mocks__/",
  "/fixtures/",
  "/examples/",
  "/templates/",
  ".test.",
  ".spec.",
  ".mock.",
  ".min.",
  ".env.example",
  ".env.sample",
];

/** Logs a variable or interpolation — not plain message strings like "invalid token". */
const SENSITIVE_LOG_VAR =
  /console\.(log|info|debug|warn|error)\s*\(\s*(?:\w+\.)*(?:password|secret|token|apiKey|api_key|credentials?)\b/i;

const SENSITIVE_LOG_INTERPOLATION =
  /console\.(log|info|debug|warn|error)\s*\([^)]*\$\{[^}]*\b(password|secret|token|api[_-]?key|credential)\b/i;

const DANGEROUS_EVAL = /\beval\s*\(/;

/** exec/spawn with template literal interpolation (possible user input). */
const DANGEROUS_EXEC =
  /\b(?:exec|execSync|spawn|spawnSync)\s*\([^)]*\$\{/;

const MAX_FILE_BYTES = 500_000;

function hasScannableExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SCAN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function shouldSkipFile(relPath: string): boolean {
  const lower = relPath.replace(/\\/g, "/").toLowerCase();
  return SKIP_PATH_PARTS.some((part) => lower.includes(part));
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("/*")
  );
}

async function walkFiles(
  dir: string,
  repoPath: string,
  files: string[] = []
): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(full, repoPath, files);
    } else if (entry.isFile() && hasScannableExtension(entry.name)) {
      const rel = relative(repoPath, full);
      if (!shouldSkipFile(rel)) files.push(full);
    }
  }
  return files;
}

function pushFinding(
  findings: RawFinding[],
  seen: Set<string>,
  finding: RawFinding
): void {
  const key = `${finding.type}|${finding.file}|${finding.line}|${finding.title}`;
  if (seen.has(key)) return;
  seen.add(key);
  findings.push(finding);
}

export async function runCustomRules(repoPath: string): Promise<ScannerRunResult> {
  const start = Date.now();
  const name = "custom_rules";
  const findings: RawFinding[] = [];
  const seen = new Set<string>();

  log.info("scanner:custom_rules", "Starting in-house heuristic scan", { repoPath });
  const files = await walkFiles(repoPath, repoPath);

  for (const filePath of files) {
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    if (content.length > MAX_FILE_BYTES) continue;

    const rel = relative(repoPath, filePath);
    const lines = content.split("\n");

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const lineNum = idx + 1;

      if (isCommentLine(line)) continue;

      if (SENSITIVE_LOG_VAR.test(line) || SENSITIVE_LOG_INTERPOLATION.test(line)) {
        pushFinding(findings, seen, {
          type: "sensitive_data_exposure",
          severity: "medium",
          title: "Sensitive value passed to log statement",
          file: rel,
          line: lineNum,
          description:
            "A variable or interpolation involving credentials appears in a log call. Plain log messages are ignored; this flags likely value exposure.",
          recommendation: "Remove sensitive values from logs or redact them before logging.",
          confidence: "medium",
        });
      }

      if (DANGEROUS_EVAL.test(line)) {
        pushFinding(findings, seen, {
          type: "dangerous_api",
          severity: "high",
          title: "Use of eval()",
          file: rel,
          line: lineNum,
          description: "eval() executes arbitrary code and is a common injection vector.",
          recommendation: "Replace eval() with JSON.parse or explicit safe logic.",
          confidence: "medium",
        });
      }

      if (DANGEROUS_EXEC.test(line)) {
        pushFinding(findings, seen, {
          type: "command_injection",
          severity: "high",
          title: "Shell command with interpolated input",
          file: rel,
          line: lineNum,
          description:
            "Dynamic shell execution with template literal interpolation may allow command injection. Verify input is sanitized (Semgrep also checks this).",
          recommendation: "Use execFile with argument arrays instead of shell string interpolation.",
          confidence: "low",
        });
      }
    }
  }

  const scannerReport = {
    name,
    status: "ran" as const,
    durationMs: Date.now() - start,
    findingsCount: findings.length,
    message:
      findings.length === 0
        ? `Custom rules scanned ${files.length} file(s) — no heuristic issues detected`
        : `Custom rules found ${findings.length} issue(s) across ${files.length} file(s)`,
  };
  log.info("scanner:custom_rules", scannerReport.message, {
    durationMs: scannerReport.durationMs,
    filesScanned: files.length,
  });

  return { findings, report: scannerReport, meta: { filesScanned: files.length } };
}
