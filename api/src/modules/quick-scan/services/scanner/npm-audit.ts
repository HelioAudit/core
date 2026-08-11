import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { RawFinding } from "../../types";
import { isCliAvailable, resolveCli, scannerPathEnv } from "../../utils/cli-available";
import { log } from "../../utils/logger";
import type { ScannerRunResult } from "./types";

const execFileAsync = promisify(execFile);

/**
 * The timeout for the npm audit scan
 * @returns The timeout in milliseconds
 */
function scanTimeoutMs(): number {
    return Number(process.env.SCAN_TIMEOUT_SECONDS ?? 120) * 1000;
}

/**
 * Critical title keywords
 */
const CRITICAL_TITLE_KEYWORDS = [
    "code injection",
    "command injection",
    "remote code execution",
    "rce",
    "prototype pollution",
    "arbitrary code",
    "sql injection",
];

/**
 * Map the audit severity
 * @param severity - The severity
 * @param title - The title
 * @returns The severity
 */
function mapAuditSeverity(severity: string, title: string): RawFinding["severity"] {
    const titleLower = title.toLowerCase();
    if (CRITICAL_TITLE_KEYWORDS.some((k) => titleLower.includes(k))) {
        return "critical";
    }

    const s = severity.toLowerCase();
    if (s === "critical") return "critical";
    if (s === "high") return "high";
    if (s === "moderate" || s === "medium") return "medium";
    return "low";
}

/**
 * Check if the repository has a lockfile
 * @param repoPath - The path to the repository
 * @returns True if the repository has a lockfile
 */
async function hasLockfile(repoPath: string): Promise<boolean> {
    try {
        await access(join(repoPath, "package-lock.json"));
        return true;
    } catch {
        try {
            await access(join(repoPath, "npm-shrinkwrap.json"));
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Run the npm audit scanner
 * @param repoPath - The path to the repository
 * @returns The scanner result
 */
export async function runNpmAudit(repoPath: string): Promise<ScannerRunResult> {
    const start = Date.now();
    const name = "npm_audit";
    const pkgPath = join(repoPath, "package.json");

    try {
        await access(pkgPath);
    } catch {
        const report = {
            name,
            status: "skipped" as const,
            durationMs: Date.now() - start,
            findingsCount: 0,
            message: "No package.json — dependency audit skipped",
        };
        log.info("scanner:npm_audit", report.message);
        return { findings: [], report, meta: { dependencyCount: 0 } };
    }

    const npmAvailable = await isCliAvailable("npm");
    if (!npmAvailable) {
        const report = {
            name,
            status: "skipped" as const,
            durationMs: Date.now() - start,
            findingsCount: 0,
            message: "npm CLI not installed — dependency audit skipped",
        };
        log.warn("scanner:npm_audit", report.message);
        return { findings: [], report, meta: { dependencyCount: 0 } };
    }

    const lockfile = await hasLockfile(repoPath);
    const installDeps = process.env.SCAN_NPM_INSTALL === "true";

    if (installDeps) {
        log.info("scanner:npm_audit", "Running npm install before audit (SCAN_NPM_INSTALL=true)");
        try {
            await execFileAsync((await resolveCli("npm")) ?? "npm", ["install", "--ignore-scripts", "--no-audit"], {
                cwd: repoPath,
                timeout: scanTimeoutMs() * 2,
                maxBuffer: 10 * 1024 * 1024,
                env: scannerPathEnv(),
            });
        } catch (err) {
            log.warn("scanner:npm_audit", "npm install failed — continuing with lockfile audit", {
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    const auditMode = installDeps
        ? "full install + audit"
        : lockfile
            ? "lockfile metadata audit (no npm install — fast mode)"
            : "package.json audit only (no lockfile)";

    try {
        const npmBin = (await resolveCli("npm")) ?? "npm";
        log.info("scanner:npm_audit", "Starting dependency audit", { repoPath, auditMode });
        const { stdout } = await execFileAsync(npmBin, ["audit", "--json"], {
            cwd: repoPath,
            timeout: scanTimeoutMs(),
            maxBuffer: 10 * 1024 * 1024,
            env: scannerPathEnv(),
        });

        const { findings, dependencyCount } = parseNpmAuditJson(stdout);
        const scannerReport = {
            name,
            status: "ran" as const,
            durationMs: Date.now() - start,
            findingsCount: findings.length,
            message:
                findings.length === 0
                    ? `npm audit ran (${auditMode}) — no vulnerable dependencies detected`
                    : `npm audit found ${findings.length} vulnerable package(s) (${auditMode})`,
        };
        log.info("scanner:npm_audit", scannerReport.message, {
            durationMs: scannerReport.durationMs,
            dependencyCount,
        });
        return { findings, report: scannerReport, meta: { dependencyCount, auditMode } };
    } catch (err: unknown) {
        const execErr = err as { code?: number; stdout?: string };
        if (execErr.stdout) {
            const { findings, dependencyCount } = parseNpmAuditJson(execErr.stdout);
            const scannerReport = {
                name,
                status: "ran" as const,
                durationMs: Date.now() - start,
                findingsCount: findings.length,
                message: `npm audit found ${findings.length} vulnerable package(s) (${auditMode})`,
            };
            log.info("scanner:npm_audit", scannerReport.message, {
                durationMs: scannerReport.durationMs,
                dependencyCount,
            });
            return { findings, report: scannerReport, meta: { dependencyCount, auditMode } };
        }

        const message = err instanceof Error ? err.message : "Unknown npm audit error";
        const scannerReport = {
            name,
            status: "failed" as const,
            durationMs: Date.now() - start,
            findingsCount: 0,
            message: `npm audit failed: ${message}`,
        };
        log.error("scanner:npm_audit", scannerReport.message);
        return { findings: [], report: scannerReport, meta: { dependencyCount: 0 } };
    }
}

/**
 * Parse the npm audit JSON
 * @param stdout - The stdout from the npm audit command
 * @returns The findings and dependency count
 */
function parseNpmAuditJson(stdout: string): { findings: RawFinding[]; dependencyCount: number } {
    const report = JSON.parse(stdout) as {
        metadata?: { dependencies?: { total?: number } };
        vulnerabilities?: Record<
            string,
            {
                name: string;
                severity: string;
                via?: Array<{ title?: string; url?: string } | string>;
                range?: string;
            }
        >;
    };

    const dependencyCount = report.metadata?.dependencies?.total ?? 0;
    const findings: RawFinding[] = [];

    for (const [, vuln] of Object.entries(report.vulnerabilities ?? {})) {
        const via = vuln.via?.[0];
        const title =
            typeof via === "object" && via?.title
                ? via.title
                : `Vulnerable dependency: ${vuln.name}`;

        findings.push({
            type: "vulnerable_dependency",
            severity: mapAuditSeverity(vuln.severity, title),
            title,
            file: "package.json",
            line: 1,
            description: `${vuln.name}@${vuln.range ?? "unknown"} has known vulnerabilities (CVE/OSV).`,
            recommendation: `Run npm audit fix or upgrade ${vuln.name} to a patched version.`,
            confidence: "high",
        });
    }

    return { findings, dependencyCount };
}
