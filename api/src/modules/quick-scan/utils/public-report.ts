import type { Finding } from "../types";

export const PUBLIC_FINDINGS_LIMIT = Number(process.env.PUBLIC_FINDINGS_LIMIT ?? 10);

export function cleanRepoFilePath(file: string): string {
  const repoMatch = file.match(/\/repo\/(.+)$/);
  if (repoMatch) return repoMatch[1];
  return file.replace(/^\/tmp\/[^/]+\/repo\//, "");
}

function sanitizeFinding(finding: Finding): Finding {
  return { ...finding, file: cleanRepoFilePath(finding.file) };
}

/** Return at most `limit` findings for public API; keep full count in totalFindings. */
export function limitFindingsForPublic(findings: Finding[], limit = PUBLIC_FINDINGS_LIMIT) {
  return {
    totalFindings: findings.length,
    findingsPreviewLimit: limit,
    findings: findings.slice(0, limit).map(sanitizeFinding),
  };
}
