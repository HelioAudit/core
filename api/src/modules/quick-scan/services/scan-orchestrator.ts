import { Injectable } from "@nestjs/common";
import {
    SCAN_PROGRESS,
    type ScanProgressUpdate,
} from "../constants/scan-progress";
import type { ScanResponse } from "../types";
import { downloadRepository } from "./clone";
import { fetchRepoMeta, isRepoTooLarge } from "./github";
import { runAllScannersWithProgress } from "./scanner/index";
import { parseRepoUrl } from "../utils/parse-repo-url";
import { log } from "../utils/logger";
import { limitFindingsForPublic } from "../utils/public-report";
import { countFiles, createWorkDir, removeWorkDir } from "../utils/temp-dir";

export type ScanProgressCallback = (update: ScanProgressUpdate) => void;

export interface ScanOrchestratorResult {
    httpStatus: number;
    body: ScanResponse;
}

@Injectable()
export class ScanOrchestratorService {
    /**
     * Run a full repository scan with optional progress callbacks for streaming clients.
     * @param repoUrl - GitHub repository URL to scan
     * @param onProgress - Optional callback invoked as each scan phase completes
     * @returns HTTP status and structured scan response body
     */
    async runRepositoryScan(
        repoUrl: string,
        onProgress?: ScanProgressCallback
    ): Promise<ScanOrchestratorResult> {
        const requestStart = Date.now();
        const emit = (update: ScanProgressUpdate) => onProgress?.(update);

        emit(SCAN_PROGRESS.START);

        if (!repoUrl || typeof repoUrl !== "string") {
            return {
                httpStatus: 400,
                body: {
                    repository: repoUrl,
                    status: "error",
                    message: 'Request body must include "repoUrl" (e.g. https://github.com/owner/repo).',
                },
            };
        }

        const parsed = parseRepoUrl(repoUrl);
        if (!parsed) {
            return {
                httpStatus: 400,
                body: {
                    repository: repoUrl,
                    status: "error",
                    message: "Invalid GitHub repository URL. Use format: https://github.com/owner/repo",
                },
            };
        }

        const githubStart = Date.now();
        const metaResult = await fetchRepoMeta(parsed.owner, parsed.repo);
        const githubApiMs = Date.now() - githubStart;

        log.info("scan:github", "GitHub API check complete", {
            repository: parsed.fullName,
            durationMs: githubApiMs,
            ok: metaResult.ok,
        });

        if (!metaResult.ok) {
            const httpStatus = metaResult.reason === "not_found" ? 404 : 502;
            const body: ScanResponse =
                metaResult.reason === "not_found"
                    ? {
                        repository: parsed.fullName,
                        status: "not_found",
                        message: metaResult.message,
                    }
                    : {
                        repository: parsed.fullName,
                        status: "error",
                        message: metaResult.message,
                    };
            return { httpStatus, body };
        }

        emit(SCAN_PROGRESS.GITHUB);

        if (metaResult.meta.private) {
            return {
                httpStatus: 200,
                body: {
                    repository: metaResult.meta.fullName,
                    status: "private_repo",
                    message:
                        "This repository is private. Contact us to scan it, or connect your GitHub account.",
                },
            };
        }

        if (isRepoTooLarge(metaResult.meta.sizeKb)) {
            return {
                httpStatus: 413,
                body: {
                    repository: metaResult.meta.fullName,
                    status: "error",
                    message: `Repository exceeds maximum size (${process.env.MAX_REPO_SIZE_MB ?? 200} MB). Contact us for enterprise scanning.`,
                },
            };
        }

        let workDir: string | null = null;

        try {
            workDir = await createWorkDir();

            const downloadStart = Date.now();
            const repoPath = await downloadRepository(
                parsed.owner,
                parsed.repo,
                metaResult.meta.defaultBranch,
                workDir
            );
            const downloadMs = Date.now() - downloadStart;

            emit(SCAN_PROGRESS.DOWNLOAD);

            log.info("scan:download", "Repository downloaded", {
                repository: parsed.fullName,
                durationMs: downloadMs,
                repoPath,
            });

            const parallelStart = Date.now();
            const [filesScanned, scanResult] = await Promise.all([
                countFiles(repoPath),
                runAllScannersWithProgress(repoPath, emit),
            ]);
            const parallelMs = Date.now() - parallelStart;

            emit(SCAN_PROGRESS.MERGING);

            const totalMs = Date.now() - requestStart;
            const scanPhases = {
                githubApiMs,
                downloadMs,
                fileCountMs: parallelMs,
                scannersMs: scanResult.scannersMs,
                totalMs,
            };

            const { findings, totalFindings, findingsPreviewLimit } = limitFindingsForPublic(
                scanResult.findings
            );

            emit(SCAN_PROGRESS.COMPLETE);

            const body: ScanResponse = {
                repository: metaResult.meta.fullName,
                status: "completed",
                filesScanned,
                dependenciesScanned: scanResult.dependenciesScanned,
                scanDurationSeconds: Math.max(1, Math.round(totalMs / 1000)),
                scanPhases,
                scanners: scanResult.scanners,
                findingsSummary: scanResult.findingsSummary,
                totalFindings,
                findingsPreviewLimit,
                findings,
            };

            log.info("scan:complete", "Scan finished", {
                repository: parsed.fullName,
                filesScanned,
                totalFindings,
                returnedFindings: findings.length,
            });

            return { httpStatus: 200, body };
        } catch (err) {
            const message = err instanceof Error ? err.message : "Scan failed unexpectedly.";
            log.error("scan:error", message, { repository: parsed.fullName });
            return {
                httpStatus: 500,
                body: {
                    repository: parsed.fullName,
                    status: "error",
                    message,
                },
            };
        } finally {
            if (workDir) {
                await removeWorkDir(workDir).catch(() => { });
            }
        }
    }
}
