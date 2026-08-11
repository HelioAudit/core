import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { QuickScanModule } from "./modules/quick-scan/quick-scan.module";

@Module({
  imports: [QuickScanModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
