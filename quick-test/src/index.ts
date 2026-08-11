import "dotenv/config";
import cors from "cors";
import express from "express";
import { requireScannerToken } from "./middleware/scannerAuth.js";
import { scanRouter } from "./routes/scan.js";
import { log } from "./utils/logger.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

/**
 * Log the request
 * @param req - The request
 * @param res - The response
 * @param next - The next function
 */
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        log.info("http", `${req.method} ${req.originalUrl}`, {
            status: res.statusCode,
            durationMs: Date.now() - start,
            ip: req.ip,
        });
    });
    next();
});

/**
 * Get the health of the server
 * @param _req - The request
 * @param res - The response
 */
app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "helioaudit-scanner" });
});

/**
 * Scan the repository (token required when SCANNER_API_TOKEN is set)
 */
app.use("/api", requireScannerToken, scanRouter);

/**
 * Handle 404 errors
 * @param _req - The request
 * @param res - The response
 */
app.use((_req, res) => {
    res.status(404).json({ status: "error", message: "Not found" });
});

/**
 * Start the server
 * @param port - The port to listen on
 */
app.listen(port, () => {
    log.info("server", `HelioAudit scanner API listening on http://localhost:${port}`);
    log.info("server", "Endpoints: POST /api/repository/scan, POST /api/repository/scan/stream, GET /health");
});
