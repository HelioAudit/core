import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { RawFinding } from "../../types.js";
import { isCliAvailable, resolveCli, scannerPathEnv } from "../../utils/cliAvailable.js";
import { log } from "../../utils/logger.js";
import {
  filterGitleaksReport,
  type GitleaksReportItem,
} from "./gitleaksFilter.js";
import type { ScannerRunResult } from "./types.js";

const execFileAsync = promisify(execFile);

const GITLEAKS_CONFIG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../config/gitleaks.toml"
);

function scanTimeoutMs(): number {
  return Number(process.env.SCAN_TIMEOUT_SECONDS ?? 120) * 1000;
}

function mapGitleaksItems(report: GitleaksReportItem[]): RawFinding[] {
  return report.map((item) => ({
    type: "hardcoded_secret" as const,
    severity: "critical" as const,
    title: item.RuleID ? `Hardcoded secret (${item.RuleID})` : "Hardcoded secret",
    file: item.File ?? "unknown",
    line: item.StartLine ?? 1,
    description: item.Description ?? "A secret or credential appears to be stored in source code.",
    recommendation:
      "Move the secret to an environment variable or secret manager. Rotate any exposed credentials immediately.",
    confidence: "high" as const,
  }));
}

async function readGitleaksReport(reportPath: string): Promise<{
  findings: RawFinding[];
  filteredCount: number;
}> {
  try {
    const raw = await readFile(reportPath, "utf8");
    if (!raw.trim()) return { findings: [], filteredCount: 0 };

    const parsed = JSON.parse(raw);
    const items: GitleaksReportItem[] = Array.isArray(parsed) ? parsed : [];
    const { kept, filteredCount } = filterGitleaksReport(items);

    return {
      findings: mapGitleaksItems(kept),
      filteredCount,
    };
  } catch {
    return { findings: [], filteredCount: 0 };
  }
}

async function buildGitleaksArgs(repoPath: string, reportPath: string): Promise<string[]> {
  const args = [
    "detect",
    "--source",
    repoPath,
    "--no-git",
    "--config",
    GITLEAKS_CONFIG_PATH,
    "--report-format",
    "json",
    "--report-path",
    reportPath,
  ];

  const repoIgnorePath = join(repoPath, ".gitleaksignore");
  try {
    await access(repoIgnorePath);
    args.push("--gitleaks-ignore-path", repoIgnorePath);
  } catch {
    // Repo has no .gitleaksignore — expected for most scans.
  }

  return args;
}

function buildSuccessMessage(findingsCount: number, filteredCount: number): string {
  if (findingsCount === 0 && filteredCount > 0) {
    return `Gitleaks ran successfully — ${filteredCount} example/doc placeholder(s) ignored, no real secrets detected`;
  }
  if (findingsCount === 0) {
    return "Gitleaks ran successfully — no hardcoded secrets detected";
  }
  if (filteredCount > 0) {
    return `Gitleaks found ${findingsCount} potential secret(s) (${filteredCount} example/doc false positive(s) filtered)`;
  }
  return `Gitleaks found ${findingsCount} potential secret(s)`;
}

async function runGitleaksScan(
  gitleaksBin: string,
  repoPath: string,
  reportPath: string
): Promise<{ findings: RawFinding[]; filteredCount: number }> {
  const args = await buildGitleaksArgs(repoPath, reportPath);

  log.info("scanner:gitleaks", "Starting secrets scan", {
    repoPath,
    config: GITLEAKS_CONFIG_PATH,
  });

  await execFileAsync(gitleaksBin, args, {
    timeout: scanTimeoutMs(),
    maxBuffer: 10 * 1024 * 1024,
    env: scannerPathEnv(),
  });

  return readGitleaksReport(reportPath);
}

export async function runGitleaks(repoPath: string): Promise<ScannerRunResult> {
  const start = Date.now();
  const name = "gitleaks";

  const available = await isCliAvailable("gitleaks");
  if (!available) {
    const report = {
      name,
      status: "skipped" as const,
      durationMs: Date.now() - start,
      findingsCount: 0,
      message: "Gitleaks CLI not installed on server — secrets scan skipped",
    };
    log.warn("scanner:gitleaks", report.message);
    return { findings: [], report };
  }

  let workDir: string | null = null;

  try {
    const gitleaksBin = await resolveCli("gitleaks");
    if (!gitleaksBin) throw new Error("gitleaks not found");

    workDir = await mkdtemp(join(tmpdir(), "gitleaks-"));
    const reportPath = join(workDir, "report.json");

    const { findings, filteredCount } = await runGitleaksScan(gitleaksBin, repoPath, reportPath);

    const scannerReport = {
      name,
      status: "ran" as const,
      durationMs: Date.now() - start,
      findingsCount: findings.length,
      message: buildSuccessMessage(findings.length, filteredCount),
    };
    log.info("scanner:gitleaks", scannerReport.message, {
      durationMs: scannerReport.durationMs,
      filteredCount,
    });
    return { findings, report: scannerReport };
  } catch (err: unknown) {
    const execErr = err as { code?: number };
    // gitleaks exits 1 when secrets are found — still a successful run
    if (execErr.code === 1 && workDir) {
      const gitleaksBin = await resolveCli("gitleaks");
      const reportPath = join(workDir, "report.json");
      const { findings, filteredCount } = await readGitleaksReport(reportPath);

      if (findings.length > 0 || filteredCount > 0) {
        const scannerReport = {
          name,
          status: "ran" as const,
          durationMs: Date.now() - start,
          findingsCount: findings.length,
          message: buildSuccessMessage(findings.length, filteredCount),
        };
        log.info("scanner:gitleaks", scannerReport.message, {
          durationMs: scannerReport.durationMs,
          filteredCount,
        });
        return { findings, report: scannerReport };
      }
    }

    const message = err instanceof Error ? err.message : "Unknown gitleaks error";
    const scannerReport = {
      name,
      status: "failed" as const,
      durationMs: Date.now() - start,
      findingsCount: 0,
      message: `Gitleaks failed: ${message}`,
    };
    log.error("scanner:gitleaks", scannerReport.message);
    return { findings: [], report: scannerReport };
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => { });
  }
}
