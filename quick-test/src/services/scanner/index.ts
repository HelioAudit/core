import type { Finding, FindingsSummary, RawFinding, ScannerReport } from "../../types.js";
import {
    PARALLEL_SCANNER_COUNT,
    SCANNER_STEP_BY_NAME,
    SCAN_PROGRESS,
    type ScanProgressCallback,
} from "../../constants/scanProgress.js";
import { log } from "../../utils/logger.js";
import { runCustomRules } from "./customRules.js";
import { runGitleaks } from "./gitleaks.js";
import { runNpmAudit } from "./npmAudit.js";
import { runSemgrep } from "./semgrep.js";
import type { ScannerRunResult } from "./types.js";

/**
 * Build the summary of the findings
 * @param findings - The findings
 * @returns The summary of the findings
 */
function buildSummary(findings: Finding[]): FindingsSummary {
    return findings.reduce(
        (acc, f) => {
            acc[f.severity]++;
            return acc;
        },
        { critical: 0, high: 0, medium: 0, low: 0 }
    );
}

/**
 * Deduplicate the findings
 * @param raw - The raw findings
 * @returns The deduplicated findings
 */
function dedupeFindings(raw: RawFinding[]): RawFinding[] {
    const seen = new Set<string>();
    const out: RawFinding[] = [];

    for (const f of raw) {
        const key = `${f.type}|${f.file}|${f.line}|${f.title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(f);
    }

    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return out.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

/**
 * Assign IDs to the findings
 * @param findings - The findings
 * @returns The findings with IDs
 */
function assignIds(findings: RawFinding[]): Finding[] {
    return findings.map((f, i) => ({
        id: `f${String(i + 1).padStart(3, "0")}`,
        ...f,
    }));
}

/**
 * The scan result
 * @param findings - The findings
 * @param findingsSummary - The summary of the findings
 * @param dependenciesScanned - The number of dependencies scanned
 * @param scanners - The scanners
 * @param scannersMs - The time taken to run the scanners
 */
export interface ScanResult {
    findings: Finding[];
    findingsSummary: FindingsSummary;
    dependenciesScanned: number;
    scanners: ScannerReport[];
    scannersMs: number;
}

/**
 * Compute monotonic progress for parallel scanner completion events.
 * @param completedCount - Number of scanners finished so far
 * @returns Progress percentage between SCANNERS_START and SCANNERS_END
 */
function scannerCompletionProgress(completedCount: number): number {
    const start = SCAN_PROGRESS.SCANNERS_START as number;
    const end = SCAN_PROGRESS.SCANNERS_END as number;
    return Math.round(start + (completedCount / PARALLEL_SCANNER_COUNT) * (end - start));
}

/**
 * Run all the scanners
 * @param repoPath - The path to the repository
 * @returns The scan result
 */
export async function runAllScanners(repoPath: string): Promise<ScanResult> {
    return runAllScannersWithProgress(repoPath);
}

/**
 * Run all scanners in parallel and emit monotonic progress as each tool finishes.
 * @param repoPath - The path to the repository
 * @param onProgress - Optional callback invoked when each scanner completes
 * @returns The scan result
 */
export async function runAllScannersWithProgress(
    repoPath: string,
    onProgress?: ScanProgressCallback
): Promise<ScanResult> {
    const start = Date.now();
    log.info("scanner", "Running all scanners in parallel", { repoPath });

    let completedScanners = 0;

    const emitScannerProgress = (reportName: string) => {
        completedScanners += 1;
        const step = SCANNER_STEP_BY_NAME[reportName] ?? "Running security scanners…";
        onProgress?.({
            step,
            progress: scannerCompletionProgress(completedScanners),
        });
    };

    const runWithProgress = async (
        run: () => Promise<ScannerRunResult>
    ): Promise<ScannerRunResult> => {
        const result = await run();
        emitScannerProgress(result.report.name);
        return result;
    };

    const results: ScannerRunResult[] = await Promise.all([
        runWithProgress(() => runGitleaks(repoPath)),
        runWithProgress(() => runSemgrep(repoPath)),
        runWithProgress(() => runNpmAudit(repoPath)),
        runWithProgress(() => runCustomRules(repoPath)),
    ]);

    const scannersMs = Date.now() - start;
    const scanners = results.map((r) => r.report);

    for (const s of scanners) {
        log.info("scanner:summary", `${s.name}: ${s.status}`, {
            durationMs: s.durationMs,
            findingsCount: s.findingsCount,
            message: s.message,
        });
    }

    const npmResult = results.find((r) => r.report.name === "npm_audit");
    const dependencyCount = (npmResult?.meta?.dependencyCount as number | undefined) ?? 0;

    const merged = dedupeFindings(results.flatMap((r) => r.findings));
    const findings = assignIds(merged);

    log.info("scanner", "Scan complete", {
        scannersMs,
        totalFindings: findings.length,
        summary: buildSummary(findings),
    });

    return {
        findings,
        findingsSummary: buildSummary(findings),
        dependenciesScanned: dependencyCount,
        scanners,
        scannersMs,
    };
}
