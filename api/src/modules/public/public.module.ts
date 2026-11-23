import { Module } from "@nestjs/common";
import { PublicController } from "./public.controller";
import { ZohoDeskService } from "./services/zoho-desk.service";

@Module({
  controllers: [PublicController],
  providers: [ZohoDeskService],
})
export class PublicModule {}
