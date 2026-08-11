import type { RawFinding } from "../../types.js";

export type ScannerStatus = "ran" | "skipped" | "failed";

export interface ScannerReport {
    name: string;
    status: ScannerStatus;
    durationMs: number;
    findingsCount: number;
    message: string;
}

export interface ScannerRunResult {
    findings: RawFinding[];
    report: ScannerReport;
    /** Extra data returned by specific scanners (e.g. dependency count). */
    meta?: Record<string, unknown>;
}
