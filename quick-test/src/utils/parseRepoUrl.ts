import type { ParsedRepoUrl } from "../types.js";

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

/**
 * Parse the repository URL
 * @param input - The input URL
 * @returns The parsed repository URL
 */
export function parseRepoUrl(input: string): ParsedRepoUrl | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    let url: URL;
    try {
        url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    } catch {
        return null;
    }

    if (!GITHUB_HOSTS.has(url.hostname.toLowerCase())) return null;

    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length < 2) return null;

    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, "");

    if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
        return null;
    }

    return { owner, repo, fullName: `${owner}/${repo}` };
}
