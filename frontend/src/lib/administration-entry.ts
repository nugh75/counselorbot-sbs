export interface AdministrationLaunch {
  path_id: number;
  step_id: number;
  administration_plan_id: number;
  instrument_code: string;
  locale: string;
  delivery_mode: "external_it" | "in_app";
  external_href: string | null;
  score_factors?: {
    code: string;
    label_i18n: Record<string, string>;
    label_it: string | null;
    label_en: string | null;
  }[];
  institution: { id: number; name: string; institution_code: string | null };
}
// Manual Italian entry carries scores; in-app entry carries the saved runner result.
export interface AdministrationEntryDraft {
  scores?: Record<string, number>;
  result_id?: number;
  session_id: string;
  request_id: string;
  institution_grant: string;
}
export interface AdministrationEntryAck {
  result: {
    id: number;
    scores: Record<string, number>;
    questionnaire_type: string;
  };
  guided_entry_id: number;
  evidence_id: number;
  session_id: string;
  accepted_at: string;
}
export interface AdministrationResult {
  id: number;
  session_id: string;
  scores: Record<string, number>;
  questionnaire_type: string;
  administration_plan_id: number;
  source: string;
  capture_method: string;
  source_system: string | null;
  locale: string;
}
export interface AdministrationRunnerDraft {
  session_id: string;
  answers: Record<number, number>;
  institution_grant: string;
}
export interface AdministrationRunnerAck {
  result: AdministrationResult;
}
export function parseAdministrationLaunch(
  value: unknown,
): AdministrationLaunch {
  const row = value as Omit<AdministrationLaunch, "delivery_mode"> & {
    delivery_mode?: string;
  };
  const delivery = row?.delivery_mode ?? "external_it";
  const deliveryValid =
    !!row &&
    (delivery === "external_it"
      ? row.locale === "it" &&
        row.external_href === "https://www.competenzestrategiche.it/"
      : delivery === "in_app" &&
        typeof row.locale === "string" &&
        row.locale !== "it" &&
        row.external_href === null);
  if (
    !row ||
    ![row.path_id, row.step_id, row.administration_plan_id].every(
      Number.isInteger,
    ) ||
    typeof row.instrument_code !== "string" ||
    !deliveryValid ||
    !row.institution ||
    !Number.isInteger(row.institution.id) ||
    typeof row.institution.name !== "string"
  ) {
    throw new Error("Invalid administration launch");
  }
  return {
    path_id: row.path_id,
    step_id: row.step_id,
    administration_plan_id: row.administration_plan_id,
    instrument_code: row.instrument_code,
    locale: row.locale,
    delivery_mode: delivery as AdministrationLaunch["delivery_mode"],
    external_href: row.external_href,
    score_factors: row.score_factors,
    institution: {
      id: row.institution.id,
      name: row.institution.name,
      institution_code: row.institution.institution_code,
    },
  };
}
export async function commitAdministrationEntry(
  fetcher: (url: string, init?: RequestInit) => Promise<Response>,
  pathId: number,
  stepId: number,
  draft: AdministrationEntryDraft,
): Promise<AdministrationEntryAck> {
  const response = await fetcher(
    `/api/user/paths/${pathId}/steps/${stepId}/guided-entry`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    },
  );
  if (!response.ok) throw new Error(`Entry failed: ${response.status}`);
  const ack = (await response.json()) as AdministrationEntryAck;
  if (
    !ack?.result ||
    ![ack.result.id, ack.guided_entry_id, ack.evidence_id].every(
      (id) => Number.isInteger(id) && id > 0,
    ) ||
    ack.session_id !== draft.session_id ||
    typeof ack.accepted_at !== "string"
  ) {
    throw new Error("Missing committed guided entry acknowledgement");
  }
  return ack;
}

export async function scoreAdministrationStep(
  fetcher: (url: string, init?: RequestInit) => Promise<Response>,
  pathId: number,
  stepId: number,
  draft: AdministrationRunnerDraft,
): Promise<AdministrationRunnerAck> {
  const response = await fetcher(
    `/api/user/paths/${pathId}/steps/${stepId}/score`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    },
  );
  if (!response.ok) throw new Error(`Scoring failed: ${response.status}`);
  const ack = (await response.json()) as AdministrationRunnerAck;
  const result = ack?.result;
  if (
    !result ||
    !Number.isInteger(result.id) ||
    result.id <= 0 ||
    result.session_id !== draft.session_id ||
    result.source !== "in-app" ||
    result.capture_method !== "item_runner" ||
    !result.scores
  ) {
    throw new Error("Missing saved in-app result");
  }
  return { result };
}

export function administrationDraftKey(
  owner: string,
  pathId: number,
  stepId: number,
): string {
  return `counselorbot-it-step:${encodeURIComponent(owner)}:${pathId}:${stepId}`;
}
