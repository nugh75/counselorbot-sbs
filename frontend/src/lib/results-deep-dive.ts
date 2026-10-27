import type { AdministrationResult } from "./administration-entry";

// Server-issued guided session bound to the result of an earlier administration step.
export interface ResultsDeepDiveSession {
  path_id: number;
  step_id: number;
  results_step_id: number | null;
  session_id: string;
  started_at: string;
  result: AdministrationResult;
}

export type ResultsDeepDiveFailure = "incomplete" | "locked" | "legacy" | "error";

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
    (row.results_step_id !== null && !Number.isInteger(row.results_step_id)) ||
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
  resultId?: number,
): Promise<ResultsDeepDiveSession> {
  const response = await fetcher(
    `/api/user/paths/${pathId}/steps/${stepId}/deep-dive`,
    { method: "POST", ...(resultId === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ result_id: resultId }),
    }) },
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

interface SourceStep {
  id?: number;
  client_key?: string;
  results_key?: string;
  step_type?: string;
  results_step_id?: number | null;
  pending_config?: {kind?: string; results_step_id?: number} | null;
}

export function pathStepKey(step: SourceStep): string {
  return step.id === undefined ? step.client_key || '' : `id:${step.id}`;
}

/** Every preceding questionnaire, saved, newly added or pending, linked at most once. */
export function deepDiveSources<T extends SourceStep>(steps: T[]): T[] {
  const linked = new Set(steps.flatMap(step => {
    const sourceId = step.step_type === 'guided_results_chat' ? step.results_step_id
      : step.pending_config?.kind === 'guided_results_chat' ? step.pending_config.results_step_id : undefined;
    return step.results_key ? [step.results_key] : sourceId != null ? [`id:${sourceId}`] : [];
  }));
  return steps.filter(step => (step.step_type === 'questionnaire_administration'
    || (step.step_type === 'pending' && step.pending_config?.kind === 'questionnaire_administration'))
    && !linked.has(pathStepKey(step)));
}

/** Resolve editor links only when sending the complete ordered payload. */
export function resultsSourcePayload<T extends SourceStep>(step: T, steps: T[]) {
  if (step.results_key) return {results_from: steps.findIndex(source => pathStepKey(source) === step.results_key)};
  return step.results_step_id != null ? {results_step_id: step.results_step_id} : {};
}

export interface ResultsDeepDiveOptions {
  personal: boolean;
  ready: boolean;
  source_href: string;
  results: {id: number; submitted_at: string; locale: string}[];
  session: ResultsDeepDiveSession | null;
  /** The bound session already reached its final guided turn. */
  completed: boolean;
  legacy_profile?: boolean;
}

export async function loadResultsDeepDiveOptions(
  fetcher: (url: string, init?: RequestInit) => Promise<Response>, pathId: number, stepId: number,
): Promise<ResultsDeepDiveOptions> {
  const response = await fetcher(`/api/user/paths/${pathId}/steps/${stepId}/deep-dive`);
  if (!response.ok) throw new ResultsDeepDiveError('error');
  const row = await response.json();
  if (typeof row.personal !== 'boolean' || typeof row.ready !== 'boolean'
      || typeof row.source_href !== 'string' || !Array.isArray(row.results)
      || !row.results.every((item: ResultsDeepDiveOptions['results'][number]) => Number.isSafeInteger(item?.id)
        && item.id > 0 && typeof item.submitted_at === 'string' && typeof item.locale === 'string')) {
    throw new ResultsDeepDiveError('error');
  }
  // API controls this navigation; accept only local application links.
  if (!row.source_href.startsWith('/') || row.source_href.startsWith('//')) throw new ResultsDeepDiveError('error');
  return {...row, completed: row.completed === true, session: row.session ? parseResultsDeepDive(row.session, pathId, stepId) : null};
}
