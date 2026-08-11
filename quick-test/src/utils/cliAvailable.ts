import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * PATH with ~/.local/bin so user installs work without sudo.
 * @returns The environment variables
 */
export function scannerPathEnv(): NodeJS.ProcessEnv {
    const localBin = join(homedir(), ".local", "bin");
    const current = process.env.PATH ?? "";
    if (current.split(":").includes(localBin)) {
        return process.env;
    }
    return { ...process.env, PATH: `${localBin}:${current}` };
}

/**
 * Resolve the path to the CLI
 * @param command - The command to resolve
 * @returns The path to the CLI
 */
export async function resolveCli(command: string): Promise<string | null> {
    const localBin = join(homedir(), ".local", "bin", command);
    try {
        await access(localBin);
        return localBin;
    } catch {
        // not in ~/.local/bin
    }

    try {
        const { stdout } = await execFileAsync("which", [command], {
            timeout: 3000,
            env: scannerPathEnv(),
        });
        const path = stdout.trim();
        return path || null;
    } catch {
        return null;
    }
}

export async function isCliAvailable(command: string): Promise<boolean> {
    return (await resolveCli(command)) !== null;
}
