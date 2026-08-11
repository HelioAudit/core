/**
 * Post-processing filters for Gitleaks results.
 * Catches false positives that slip through config allowlists.
 * Real `.env` / source files with credentials are never filtered here.
 */

export interface GitleaksReportItem {
  Description?: string;
  File?: string;
  StartLine?: number;
  RuleID?: string;
  Line?: string;
  Match?: string;
  Secret?: string;
}

const EXAMPLE_ENV_SUFFIXES = [
  ".env.example",
  ".env.sample",
  ".env.template",
  ".env.local.example",
  ".env.defaults",
] as const;

const DOC_FILE_PATTERN = /(?:^|\/)(readme|changelog|contributing)(?:[-_a-z0-9]*)?\.md$/i;

/** Markdown badge / docs URL patterns — not real credentials. */
const DOC_PLACEHOLDER_PATTERNS = [
  /img\.shields\.io/i,
  /circleci\.com/i,
  /badge\.svg/i,
  /\[circleci/i,
  /token=abc123/i,
  /\?token=[a-f0-9]{6,16}(?:[&\s"'`\])]|$)/i,
  /shields\.io\/circleci/i,
  /travis-ci\.org/i,
  /codecov\.io/i,
];

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function isExampleEnvFile(filePath: string): boolean {
  const lower = normalizePath(filePath).toLowerCase();
  return EXAMPLE_ENV_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

export function isDocumentationFile(filePath: string): boolean {
  return DOC_FILE_PATTERN.test(normalizePath(filePath));
}

function isObviousPlaceholderSecret(secret: string): boolean {
  const s = secret.trim().toLowerCase();
  if (!s) return true;
  if (s.length <= 3) return true;

  const placeholders = [
    "changeme",
    "change-me",
    "your-",
    "placeholder",
    "example",
    "xxx",
    "todo",
    "fixme",
    "insert",
    "replace",
    "dummy",
    "sample",
    "test",
    "abc123",
    "abc123def456",
  ];

  return placeholders.some((p) => s.includes(p));
}

function isDocPlaceholderMatch(item: GitleaksReportItem): boolean {
  const line = item.Line ?? "";
  const match = item.Match ?? "";
  const secret = item.Secret ?? "";
  const combined = `${line} ${match}`;

  if (DOC_PLACEHOLDER_PATTERNS.some((p) => p.test(combined))) return true;
  if (/^https?:\/\//.test(line.trim()) && isObviousPlaceholderSecret(secret)) return true;

  return false;
}

/**
 * Returns true when the finding should be dropped (false positive).
 */
export function shouldFilterGitleaksFinding(item: GitleaksReportItem): boolean {
  const file = item.File ?? "";

  if (isExampleEnvFile(file)) {
    return true;
  }

  if (isDocumentationFile(file)) {
    return isDocPlaceholderMatch(item);
  }

  return false;
}

export function filterGitleaksReport(items: GitleaksReportItem[]): {
  kept: GitleaksReportItem[];
  filteredCount: number;
} {
  const kept: GitleaksReportItem[] = [];
  let filteredCount = 0;

  for (const item of items) {
    if (shouldFilterGitleaksFinding(item)) {
      filteredCount++;
      continue;
    }
    kept.push(item);
  }

  return { kept, filteredCount };
}
