import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Get the GitHub headers
 * @returns The GitHub headers
 */
function githubHeaders(): HeadersInit {
    const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "HelioAudit-Scanner/1.0",
    };
    const token = process.env.GITHUB_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

/**
 * Download the repository as a zip file
 * @param owner - The owner of the repository
 * @param repo - The repository name
 * @param branch - The branch to download
 * @param destDir - The destination directory
 * @returns The path to the repository
 */
async function downloadZip(
    owner: string,
    repo: string,
    branch: string,
    destDir: string
): Promise<string> {
    const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;
    const res = await fetch(zipUrl, { headers: githubHeaders() });

    if (!res.ok) {
        throw new Error(`Failed to download repository archive (${res.status}).`);
    }

    const zipPath = join(destDir, "repo.zip");
    await pipeline(res.body!, createWriteStream(zipPath));

    await execFileAsync("unzip", ["-q", zipPath, "-d", destDir], { timeout: 120_000 });

    const entries = await readdir(destDir);
    const extracted = entries.find((e) => e.startsWith(`${repo}-`) && e !== "repo.zip");
    if (!extracted) {
        throw new Error("Failed to extract repository archive.");
    }

    const repoRoot = join(destDir, extracted);
    const finalRoot = join(destDir, "repo");
    await rename(repoRoot, finalRoot);
    return finalRoot;
}

/**
 * Clone the repository
 * @param owner - The owner of the repository
 * @param repo - The repository name
 * @param destDir - The destination directory
 * @returns The path to the repository
 */
async function gitClone(owner: string, repo: string, destDir: string): Promise<string> {
    const repoRoot = join(destDir, "repo");
    await mkdir(repoRoot, { recursive: true });
    const cloneUrl = `https://github.com/${owner}/${repo}.git`;

    await execFileAsync(
        "git",
        ["clone", "--depth", "1", "--single-branch", cloneUrl, repoRoot],
        { timeout: 120_000 }
    );

    return repoRoot;
}

/**
 * Download the repository
 * @param owner - The owner of the repository
 * @param repo - The repository name
 * @param defaultBranch - The default branch
 * @param workDir - The working directory
 * @returns The path to the repository
 */
export async function downloadRepository(
    owner: string,
    repo: string,
    defaultBranch: string,
    workDir: string
): Promise<string> {
    try {
        return await downloadZip(owner, repo, defaultBranch, workDir);
    } catch {
        return gitClone(owner, repo, workDir);
    }
}
