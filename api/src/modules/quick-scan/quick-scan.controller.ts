import { Body, Controller, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { ScanRepoDto } from "./dto/scan-repo.dto";
import { ScannerAuthGuard } from "./guards/scanner-auth.guard";
import { ScanOrchestratorService } from "./services/scan-orchestrator";
import type { ScanResponse } from "./types";
import { log } from "./utils/logger";

@Controller("api/repository")
@UseGuards(ScannerAuthGuard)
export class QuickScanController {
  constructor(private readonly scanOrchestrator: ScanOrchestratorService) {}

  /**
   * Scan a GitHub repository and return the full result as JSON.
   */
  @Post("scan")
  async scanRepository(
    @Body() body: ScanRepoDto,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    const repoUrl = body.repoUrl;

    log.info("scan:request", "Incoming scan request", {
      repoUrl,
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    const result = await this.scanOrchestrator.runRepositoryScan(repoUrl ?? "");
    res.status(result.httpStatus).json(result.body);
  }

  /**
   * Stream scan progress via Server-Sent Events, then emit the final result.
   */
  @Post("scan/stream")
  async streamRepositoryScan(
    @Body() body: ScanRepoDto,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    const repoUrl = body.repoUrl;

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
      const result = await this.scanOrchestrator.runRepositoryScan(
        repoUrl ?? "",
        (update) => {
          writeEvent("progress", update);
        }
      );

      if (result.body.status === "completed") {
        writeEvent("complete", result.body);
      } else {
        writeEvent("error", result.body);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Scan failed unexpectedly.";
      writeEvent("error", {
        repository: repoUrl ?? "",
        status: "error",
        message,
      } satisfies ScanResponse);
    }

    res.end();
  }
}
