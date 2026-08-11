import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RawFinding, FindingType, Severity } from "../../types";
import { isCliAvailable, resolveCli, scannerPathEnv } from "../../utils/cli-available";
import { log } from "../../utils/logger";
import type { ScannerRunResult } from "./types";

const execFileAsync = promisify(execFile);

/**
 * The timeout for the semgrep scan
 * @returns The timeout in milliseconds
 */
function scanTimeoutMs(): number {
    return Number(process.env.SCAN_TIMEOUT_SECONDS ?? 120) * 1000;
}

/**
 * The type map for the semgrep scan
 * @returns The type map
 */
const SEMGREP_TYPE_MAP: Record<string, { type: FindingType; severity: Severity; title: string }> = {
    "sql-injection": { type: "sql_injection", severity: "critical", title: "SQL Injection" },
    "nosql-injection": { type: "nosql_injection", severity: "critical", title: "NoSQL Injection" },
    "command-injection": { type: "command_injection", severity: "critical", title: "Command Injection" },
    xss: { type: "xss", severity: "high", title: "Cross-Site Scripting (XSS)" },
    ssrf: { type: "ssrf", severity: "high", title: "Server-Side Request Forgery (SSRF)" },
    "path-traversal": { type: "path_traversal", severity: "high", title: "Path Traversal" },
    "dangerous-eval": { type: "dangerous_api", severity: "high", title: "Dangerous eval() usage" },
    "dangerous-exec": { type: "dangerous_api", severity: "high", title: "Dangerous exec/spawn usage" },
    misconfiguration: { type: "security_misconfiguration", severity: "medium", title: "Security misconfiguration" },
};

/**
 * Map the semgrep finding
 * @param checkId - The check ID
 * @param message - The message
 * @returns The mapped finding
 */
function mapSemgrepFinding(checkId: string, message: string): {
    type: FindingType;
    severity: Severity;
    title: string;
    recommendation: string;
} {
    const lower = `${checkId} ${message}`.toLowerCase();

    for (const [key, mapping] of Object.entries(SEMGREP_TYPE_MAP)) {
        if (lower.includes(key.replace(/-/g, " ")) || lower.includes(key)) {
            return { ...mapping, recommendation: getRecommendation(mapping.type) };
        }
    }

    if (lower.includes("sql") && lower.includes("inject")) {
        return { type: "sql_injection", severity: "critical", title: "SQL Injection", recommendation: getRecommendation("sql_injection") };
    }
    if (lower.includes("xss") || lower.includes("cross-site")) {
        return { type: "xss", severity: "high", title: "Cross-Site Scripting (XSS)", recommendation: getRecommendation("xss") };
    }
    if (lower.includes("ssrf")) {
        return { type: "ssrf", severity: "high", title: "Server-Side Request Forgery (SSRF)", recommendation: getRecommendation("ssrf") };
    }
    if (lower.includes("path") && lower.includes("travers")) {
        return { type: "path_traversal", severity: "high", title: "Path Traversal", recommendation: getRecommendation("path_traversal") };
    }
    if (lower.includes("eval") || lower.includes("exec")) {
        return { type: "dangerous_api", severity: "high", title: "Dangerous API usage", recommendation: getRecommendation("dangerous_api") };
    }

    return {
        type: "security_misconfiguration",
        severity: "medium",
        title: message.slice(0, 80) || "Security issue detected",
        recommendation: getRecommendation("security_misconfiguration"),
    };
}

/**
 * Get the recommendation for a finding type
 * @param type - The finding type
 * @returns The recommendation
 */
function getRecommendation(type: FindingType): string {
    const recs: Record<FindingType, string> = {
        hardcoded_secret: "Use environment variables or a secret manager.",
        vulnerable_dependency: "Upgrade the affected package to a patched version.",
        command_injection: "Avoid shell execution with user input; use parameterized APIs.",
        sql_injection: "Use parameterized queries or an ORM with bound parameters.",
        nosql_injection: "Sanitize and validate all query inputs; avoid string concatenation.",
        xss: "Encode output and use a templating engine with auto-escaping.",
        ssrf: "Validate and allowlist outbound URLs; block internal network ranges.",
        path_traversal: "Validate file paths and use basename/canonical path checks.",
        dangerous_api: "Avoid eval/exec; use safe alternatives with strict input validation.",
        security_misconfiguration: "Review configuration against security best practices.",
        sensitive_data_exposure: "Remove sensitive data from logs and error messages.",
        authentication_issue: "Ensure all protected routes require authentication.",
        authorization_issue: "Enforce authorization checks on every sensitive operation.",
    };
    return recs[type];
}

/**
 * Run the semgrep scanner
 * @param repoPath - The path to the repository
 * @returns The scanner result
 */
export async function runSemgrep(repoPath: string): Promise<ScannerRunResult> {
    const start = Date.now();
    const name = "semgrep";

    const available = await isCliAvailable("semgrep");
    if (!available) {
        const report = {
            name,
            status: "skipped" as const,
            durationMs: Date.now() - start,
            findingsCount: 0,
            message: "Semgrep CLI not installed on server — SAST scan skipped",
        };
        log.warn("scanner:semgrep", report.message);
        return { findings: [], report };
    }

    try {
        const semgrepBin = await resolveCli("semgrep");
        if (!semgrepBin) throw new Error("semgrep not found");

        log.info("scanner:semgrep", "Starting SAST scan", { repoPath });
        const { stdout } = await execFileAsync(
            semgrepBin,
            ["scan", "--config", "auto", "--json", "--quiet", repoPath],
            { timeout: scanTimeoutMs(), maxBuffer: 20 * 1024 * 1024, env: scannerPathEnv() }
        );

        const parsed = stdout.trim()
            ? (JSON.parse(stdout) as {
                results?: Array<{
                    check_id: string;
                    path: string;
                    start: { line: number };
                    extra: { message: string; severity?: string };
                }>;
            })
            : { results: [] };

        const findings: RawFinding[] = (parsed.results ?? []).map((r) => {
            const mapped = mapSemgrepFinding(r.check_id, r.extra.message);
            const semgrepSeverity = r.extra.severity?.toUpperCase();
            let severity = mapped.severity;
            if (semgrepSeverity === "ERROR") severity = "critical";
            else if (semgrepSeverity === "WARNING") severity = "high";
            else if (semgrepSeverity === "INFO") severity = "medium";

            return {
                type: mapped.type,
                severity,
                title: mapped.title,
                file: r.path,
                line: r.start.line,
                description: r.extra.message,
                recommendation: mapped.recommendation,
                confidence: "high" as const,
            };
        });

        const scannerReport = {
            name,
            status: "ran" as const,
            durationMs: Date.now() - start,
            findingsCount: findings.length,
            message:
                findings.length === 0
                    ? "Semgrep ran successfully — no SAST issues detected"
                    : `Semgrep found ${findings.length} issue(s)`,
        };
        log.info("scanner:semgrep", scannerReport.message, { durationMs: scannerReport.durationMs });
        return { findings, report: scannerReport };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown semgrep error";
        const scannerReport = {
            name,
            status: "failed" as const,
            durationMs: Date.now() - start,
            findingsCount: 0,
            message: `Semgrep failed: ${message}`,
        };
        log.error("scanner:semgrep", scannerReport.message);
        return { findings: [], report: scannerReport };
    }
}
