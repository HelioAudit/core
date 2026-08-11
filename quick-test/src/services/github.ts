import type { GitHubRepoMeta } from "../types.js";

const GITHUB_API = "https://api.github.com";

/**
 * The headers for the GitHub API
 * @returns The headers
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
 * Fetch the repository metadata
 * @param owner - The owner of the repository
 * @param repo - The repository name
 * @returns The repository metadata
 */
export async function fetchRepoMeta(
    owner: string,
    repo: string
): Promise<{ ok: true; meta: GitHubRepoMeta } | { ok: false; reason: "not_found" | "forbidden" | "error"; message: string }> {
    const url = `${GITHUB_API}/repos/${owner}/${repo}`;

    try {
        const res = await fetch(url, { headers: githubHeaders() });

        if (res.status === 404) {
            return { ok: false, reason: "not_found", message: "Repository not found. Check the URL and try again." };
        }

        if (res.status === 403) {
            const body = await res.text();
            const rateLimited = body.toLowerCase().includes("rate limit");
            return {
                ok: false,
                reason: "error",
                message: rateLimited
                    ? "GitHub API rate limit exceeded. Set GITHUB_TOKEN or try again later."
                    : "Access to this repository was denied.",
            };
        }

        if (!res.ok) {
            return { ok: false, reason: "error", message: `GitHub API error (${res.status}).` };
        }

        const data = (await res.json()) as {
            full_name: string;
            private: boolean;
            default_branch: string;
            size: number;
        };

        return {
            ok: true,
            meta: {
                fullName: data.full_name,
                private: data.private,
                defaultBranch: data.default_branch ?? "main",
                sizeKb: data.size ?? 0,
            },
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to reach GitHub API.";
        return { ok: false, reason: "error", message };
    }
}

/**
 * Check if the repository is too large
 * @param sizeKb - The size of the repository in kilobytes
 * @returns True if the repository is too large
 */
export function isRepoTooLarge(sizeKb: number): boolean {
    const maxMb = Number(process.env.MAX_REPO_SIZE_MB ?? 200);
    return sizeKb / 1024 > maxMb;
}
