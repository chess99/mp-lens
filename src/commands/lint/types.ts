/**
 * Types for the linting feature
 */

/**
 * Represents an issue found during linting
 */
export interface LintIssue {
  /** Unique id for the page/component (e.g. page:pages/xxx or comp:components/xxx) */
  id: string;
  /** Path to the WXML file */
  wxmlFile: string;
  /** Path to the JSON file */
  jsonFile: string;
  /** Components declared in JSON but not used in WXML */
  declaredNotUsed: Array<{
    /** Component tag name */
    componentTag: string;
    /** Path to the component (from usingComponents) */
    path?: string;
  }>;
  /** Tags used in WXML but not declared in JSON */
  usedNotDeclared: Array<{
    /** Component tag name */
    componentTag: string;
    /** WXML files where this tag was used */
    usedIn: string[];
    /** Suggestion for fixing the issue */
    suggestion?: string;
  }>;
}

/**
 * Represents the overall result of linting
 */
export interface LintResult {
  /** Summary statistics */
  summary: {
    /** Total number of files scanned */
    filesScanned: number;
    /** Number of files with issues */
    filesWithIssues: number;
    /** Total count of declared but not used components */
    declaredNotUsedCount: number;
    /** Total count of used but not declared components */
    usedNotDeclaredCount: number;
  };
  /** List of issues found */
  issues: LintIssue[];
}
