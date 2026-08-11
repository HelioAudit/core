import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Create a temporary work directory
 * @param prefix - The prefix for the work directory
 * @returns The path to the work directory
 */
export async function createWorkDir(prefix = "helio-scan-"): Promise<string> {
    return mkdtemp(join(tmpdir(), prefix));
}

/**
 * Remove a temporary work directory
 * @param dir - The path to the work directory
 */
export async function removeWorkDir(dir: string): Promise<void> {
    await rm(dir, { recursive: true, force: true });
}

/**
 * Count the files in a directory
 * @param dir - The path to the directory
 * @returns The number of files in the directory
 */
export async function countFiles(dir: string): Promise<number> {
    const { readdir, stat } = await import("node:fs/promises");
    let count = 0;

    async function walk(current: string): Promise<void> {
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === ".git" || entry.name === "node_modules") continue;
            const full = join(current, entry.name);
            if (entry.isDirectory()) {
                await walk(full);
            } else if (entry.isFile()) {
                count++;
            }
        }
    }

    await walk(dir);
    return count;
}
