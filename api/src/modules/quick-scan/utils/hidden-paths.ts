import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { RawFinding } from "../types";

/**
 * True when any parent directory segment in a repo-relative path is hidden (name starts with ".").
 * Dotfiles at repo root (e.g. `.env`) are still scanned — only hidden directories are excluded.
 */
export function pathHasHiddenDirectory(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, "/");
    const segments = normalized.split("/").filter(Boolean);
    if (segments.length <= 1) return false;
    return segments.slice(0, -1).some((part) => part.startsWith("."));
}

/**
 * Remove hidden directories (`.github`, `.vscode`, `.git`, etc.) from a downloaded repo before scanning.
 */
export async function removeHiddenDirectories(repoRoot: string): Promise<number> {
    let removed = 0;

    async function walk(current: string): Promise<void> {
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const full = join(current, entry.name);
            if (entry.name.startsWith(".")) {
                await rm(full, { recursive: true, force: true });
                removed++;
                continue;
            }
            await walk(full);
        }
    }

    await walk(repoRoot);
    return removed;
}

/** Drop findings under hidden directory paths (safety net if a scanner still reports them). */
export function filterFindingsOutsideHiddenDirs<T extends Pick<RawFinding, "file">>(
    findings: T[]
): T[] {
    return findings.filter((f) => !pathHasHiddenDirectory(f.file));
}