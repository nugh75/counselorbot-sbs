import type { AdministrationResult } from "./administration-entry";

// Server-issued guided session bound to the result of an earlier administration step.
export interface ResultsDeepDiveSession {
  path_id: number;
  step_id: number;
  results_step_id: number;
  session_id: string;
  started_at: string;
  result: AdministrationResult;
}

export type ResultsDeepDiveFailure = "incomplete" | "locked" | "error";

export class ResultsDeepDiveError extends Error {
  readonly reason: ResultsDeepDiveFailure;
  constructor(reason: ResultsDeepDiveFailure) {
    super(`Deep dive unavailable: ${reason}`);
    this.reason = reason;
  }
}

export function parseResultsDeepDive(
  value: unknown,
  pathId: number,
  stepId: number,
): ResultsDeepDiveSession {
  const row = value as ResultsDeepDiveSession;
  const result = row?.result;
  if (
    !row ||
    row.path_id !== pathId ||
    row.step_id !== stepId ||
    !Number.isInteger(row.results_step_id) ||
    typeof row.session_id !== "string" ||
    !row.session_id ||
    typeof row.started_at !== "string" ||
    !result ||
    !Number.isInteger(result.id) ||
    result.id <= 0 ||
    typeof result.questionnaire_type !== "string" ||
    !result.scores ||
    typeof result.scores !== "object"
  ) {
    throw new ResultsDeepDiveError("error");
  }
  return row;
}

// Start is idempotent: a retry or a reload returns the same bound session.
export async function startResultsDeepDive(
  fetcher: (url: string, init?: RequestInit) => Promise<Response>,
  pathId: number,
  stepId: number,
): Promise<ResultsDeepDiveSession> {
  const response = await fetcher(
    `/api/user/paths/${pathId}/steps/${stepId}/deep-dive`,
    { method: "POST" },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (body?.detail === "results_step_incomplete")
      throw new ResultsDeepDiveError("incomplete");
    if (body?.detail === "class_path_step_locked")
      throw new ResultsDeepDiveError("locked");
    throw new ResultsDeepDiveError("error");
  }
  return parseResultsDeepDive(await response.json(), pathId, stepId);
}

// Saved administration steps that a new deep dive may follow; each is linked once.
export function deepDiveSources<
  T extends { id?: number; step_type?: string; results_step_id?: number | null },
>(steps: T[]): T[] {
  const linked = new Set(
    steps
      .filter((step) => step.step_type === "guided_results_chat")
      .map((step) => step.results_step_id),
  );
  return steps.filter(
    (step) =>
      step.step_type === "questionnaire_administration" &&
      step.id !== undefined &&
      !linked.has(step.id),
  );
}
