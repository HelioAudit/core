import { Module } from "@nestjs/common";
import { QuickScanController } from "./quick-scan.controller";
import { ScannerAuthGuard } from "./guards/scanner-auth.guard";
import { ScanOrchestratorService } from "./services/scan-orchestrator";

@Module({
  controllers: [QuickScanController],
  providers: [ScanOrchestratorService, ScannerAuthGuard],
  exports: [ScanOrchestratorService],
})
export class QuickScanModule {}
