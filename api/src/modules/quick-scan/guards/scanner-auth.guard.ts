import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

/**
 * Require `Authorization: Bearer <SCANNER_API_TOKEN>` when the token is configured.
 */
@Injectable()
export class ScannerAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.SCANNER_API_TOKEN?.trim();
    if (!expected) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const auth = request.get("authorization");

    if (auth !== `Bearer ${expected}`) {
      throw new UnauthorizedException({
        status: "error",
        message: "Unauthorized — invalid or missing scanner API token.",
      });
    }

    return true;
  }
}
