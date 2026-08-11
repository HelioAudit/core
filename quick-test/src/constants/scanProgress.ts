/** Scan progress labels streamed to the Quick Test UI */
export const SCAN_PROGRESS_STEPS = [
    "Checking GitHub repository…",
    "Downloading source code…",
    "Running Gitleaks (secrets)…",
    "Running Semgrep (SAST)…",
    "Running npm audit…",
    "Applying custom rules…",
    "Merging findings…",
] as const;

export interface ScanProgressUpdate {
    step: string;
    progress: number;
}

export type ScanProgressCallback = (update: ScanProgressUpdate) => void;

export const SCAN_PROGRESS = {
    START: { step: SCAN_PROGRESS_STEPS[0], progress: 0 },
    GITHUB: { step: SCAN_PROGRESS_STEPS[0], progress: 12 },
    DOWNLOAD: { step: SCAN_PROGRESS_STEPS[1], progress: 28 },
    /** Progress range while scanners run in parallel (28 → 86) */
    SCANNERS_START: 28,
    SCANNERS_END: 86,
    MERGING: { step: SCAN_PROGRESS_STEPS[6], progress: 95 },
    COMPLETE: { step: "Scan complete", progress: 100 },
} as const satisfies Record<string, ScanProgressUpdate | number>;

/** Step label emitted when each scanner finishes (progress is computed separately) */
export const SCANNER_STEP_BY_NAME: Record<string, string> = {
    gitleaks: SCAN_PROGRESS_STEPS[2],
    semgrep: SCAN_PROGRESS_STEPS[3],
    npm_audit: SCAN_PROGRESS_STEPS[4],
    custom_rules: SCAN_PROGRESS_STEPS[5],
};

export const PARALLEL_SCANNER_COUNT = 4;
