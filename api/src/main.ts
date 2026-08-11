import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.log(`HelioAudit API listening on http://localhost:${port}`);
  console.log(
    "Endpoints: POST /api/repository/scan, POST /api/repository/scan/stream, GET /health"
  );
}

bootstrap();
