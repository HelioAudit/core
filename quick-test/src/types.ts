export type Severity = "critical" | "high" | "medium" | "low";
export type Confidence = "high" | "medium" | "low";

export type FindingType =
  | "hardcoded_secret"
  | "vulnerable_dependency"
  | "command_injection"
  | "sql_injection"
  | "nosql_injection"
  | "xss"
  | "ssrf"
  | "path_traversal"
  | "dangerous_api"
  | "security_misconfiguration"
  | "sensitive_data_exposure"
  | "authentication_issue"
  | "authorization_issue";

export interface Finding {
  id: string;
  type: FindingType;
  severity: Severity;
  title: string;
  file: string;
  line: number;
  description: string;
  recommendation: string;
  confidence: Confidence;
}

export interface FindingsSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export type ScannerStatus = "ran" | "skipped" | "failed";

export interface ScannerReport {
  name: string;
  status: ScannerStatus;
  durationMs: number;
  findingsCount: number;
  message: string;
}

export interface ScanPhases {
  githubApiMs: number;
  downloadMs: number;
  fileCountMs: number;
  scannersMs: number;
  totalMs: number;
}

export interface ScanCompletedResponse {
  repository: string;
  status: "completed";
  filesScanned: number;
  dependenciesScanned: number;
  scanDurationSeconds: number;
  scanPhases: ScanPhases;
  scanners: ScannerReport[];
  findingsSummary: FindingsSummary;
  /** Full count before preview cap */
  totalFindings: number;
  /** Max rows in `findings` (default 10) */
  findingsPreviewLimit: number;
  findings: Finding[];
}

export interface ScanPrivateRepoResponse {
  repository: string;
  status: "private_repo";
  message: string;
}

export interface ScanNotFoundResponse {
  repository: string;
  status: "not_found";
  message: string;
}

export interface ScanErrorResponse {
  repository: string;
  status: "error";
  message: string;
}

export type ScanResponse =
  | ScanCompletedResponse
  | ScanPrivateRepoResponse
  | ScanNotFoundResponse
  | ScanErrorResponse;

export interface ParsedRepoUrl {
  owner: string;
  repo: string;
  fullName: string;
}

export interface GitHubRepoMeta {
  fullName: string;
  private: boolean;
  defaultBranch: string;
  sizeKb: number;
}

export interface RawFinding {
  type: FindingType;
  severity: Severity;
  title: string;
  file: string;
  line: number;
  description: string;
  recommendation: string;
  confidence: Confidence;
}
