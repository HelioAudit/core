import type { NextFunction, Request, Response } from "express";

/**
 * Require `Authorization: Bearer <SCANNER_API_TOKEN>` when the token is configured.
 */
export function requireScannerToken(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const expected = process.env.SCANNER_API_TOKEN?.trim();
    if (!expected) {
        next();
        return;
    }

    const auth = req.get("authorization");
    if (auth !== `Bearer ${expected}`) {
        res.status(401).json({
            status: "error",
            message: "Unauthorized — invalid or missing scanner API token.",
        });
        return;
    }

    next();
}
