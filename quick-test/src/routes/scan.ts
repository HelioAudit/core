import { Router } from "express";
import type { ScanResponse } from "../types.js";
import { runRepositoryScan } from "../services/scanOrchestrator.js";
import { log } from "../utils/logger.js";

export const scanRouter = Router();

/**
 * Scan a GitHub repository
 * @param req.body.repoUrl - The URL of the repository to scan
 * @returns The scan result
 */
scanRouter.post("/repository/scan", async (req, res) => {
    const { repoUrl } = req.body as { repoUrl?: string };

    log.info("scan:request", "Incoming scan request", {
        repoUrl,
        ip: req.ip,
        userAgent: req.get("user-agent"),
    });

    const result = await runRepositoryScan(repoUrl ?? "");
    return res.status(result.httpStatus).json(result.body);
});

/**
 * Stream scan progress via Server-Sent Events, then emit the final result.
 * @param req.body.repoUrl - The URL of the repository to scan
 * @returns text/event-stream with progress and complete/error events
 */
scanRouter.post("/repository/scan/stream", async (req, res) => {
    const { repoUrl } = req.body as { repoUrl?: string };

    log.info("scan:stream", "Incoming streaming scan request", {
        repoUrl,
        ip: req.ip,
    });

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const writeEvent = (event: string, data: unknown) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        const result = await runRepositoryScan(repoUrl ?? "", (update) => {
            writeEvent("progress", update);
        });

        if (result.body.status === "completed") {
            writeEvent("complete", result.body);
        } else {
            writeEvent("error", result.body);
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : "Scan failed unexpectedly.";
        writeEvent("error", {
            repository: repoUrl ?? "",
            status: "error",
            message,
        } satisfies ScanResponse);
    }

    res.end();
});
