import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import ignore, { type Ignore } from "ignore";
import type { RawFinding } from "../types";

export type RepoIgnoreMatcher = {
    patternCount: number;
    ignoresRepoRelativePath: (relPath: string) => boolean;
};

function posixJoin(dir: string, pattern: string): string {
    const base = dir === "." ? "" : dir.replace(/\\/g, "/").replace(/\/$/, "");
    const p = pattern.replace(/\\/g, "/");
    if (!base) return p.replace(/^\//, "");
    if (p.startsWith("/")) return `${base}${p}`;
    return `${base}/${p}`;
}

function parseGitignoreLines(content: string, dirRelativeToRepo: string): string[] {
    const out: string[] = [];
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        if (dirRelativeToRepo === ".") {
            out.push(trimmed);
            continue;
        }

        if (trimmed.startsWith("!")) {
            out.push(`!${posixJoin(dirRelativeToRepo, trimmed.slice(1))}`);
        } else if (trimmed.startsWith("/")) {
            out.push(posixJoin(dirRelativeToRepo, trimmed));
        } else {
            out.push(posixJoin(dirRelativeToRepo, trimmed));
        }
    }
    return out;
}

async function addGitignoreFile(ig: Ignore, absPath: string, dirRelativeToRepo: string): Promise<number> {
    let content: string;
    try {
        content = await readFile(absPath, "utf8");
    } catch {
        return 0;
    }
    const patterns = parseGitignoreLines(content, dirRelativeToRepo);
    if (patterns.length > 0) ig.add(patterns);
    return patterns.length;
}

async function collectNestedGitignoreFiles(
    repoRoot: string,
    current: string,
    onFile: (absPath: string, dirRel: string) => Promise<void>
): Promise<void> {
    let entries;
    try {
        entries = await readdir(current, { withFileTypes: true });
    } catch {
        return;
    }

    for (const entry of entries) {
        if (entry.name === "node_modules") continue;
        const full = join(current, entry.name);
        if (entry.isDirectory()) {
            if (entry.name.startsWith(".")) continue;
            await collectNestedGitignoreFiles(repoRoot, full, onFile);
        } else if (entry.name === ".gitignore" && full !== join(repoRoot, ".gitignore")) {
            const dirRel = relative(repoRoot, current).replace(/\\/g, "/") || ".";
            await onFile(full, dirRel);
        }
    }
}

/** Build a matcher from root and nested `.gitignore` files. `SCAN_RESPECT_GITIGNORE=false` disables. */
export async function loadRepoGitignoreMatcher(repoRoot: string): Promise<RepoIgnoreMatcher | null> {
    if (process.env.SCAN_RESPECT_GITIGNORE === "false") {
        return null;
    }

    const ig = ignore();
    let patternCount = 0;

    patternCount += await addGitignoreFile(ig, join(repoRoot, ".gitignore"), ".");

    await collectNestedGitignoreFiles(repoRoot, repoRoot, async (absPath, dirRel) => {
        patternCount += await addGitignoreFile(ig, absPath, dirRel);
    });

    const ignoresRepoRelativePath = (relPath: string): boolean => {
        const norm = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
        if (!norm) return false;
        if (ig.ignores(norm)) return true;
        const parts = norm.split("/");
        let accum = "";
        for (let i = 0; i < parts.length; i++) {
            accum = i === 0 ? parts[i] : `${accum}/${parts[i]}`;
            if (ig.ignores(`${accum}/`)) return true;
            if (ig.ignores(accum)) return true;
        }
        return false;
    };

    return { patternCount, ignoresRepoRelativePath };
}

export function repoRelativePathFromFinding(repoRoot: string, filePath: string): string {
    const repo = repoRoot.replace(/\\/g, "/").replace(/\/$/, "");
    const normalized = filePath.replace(/\\/g, "/");
    if (normalized.startsWith(`${repo}/`)) {
        return normalized.slice(repo.length + 1);
    }
    const repoMatch = normalized.match(/\/repo\/(.+)$/);
    if (repoMatch) return repoMatch[1];
    return filePath.replace(/^\/tmp\/[^/]+\/repo\//, "");
}

export function filterFindingsByGitignore<T extends Pick<RawFinding, "file">>(
    repoRoot: string,
    matcher: RepoIgnoreMatcher | null,
    findings: T[]
): T[] {
    if (!matcher) return findings;
    return findings.filter((f) => {
        const rel = repoRelativePathFromFinding(repoRoot, f.file);
        return !matcher.ignoresRepoRelativePath(rel);
    });
}