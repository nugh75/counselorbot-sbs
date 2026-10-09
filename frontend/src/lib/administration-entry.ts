export interface AdministrationLaunch {
  path_id: number;
  step_id: number;
  administration_plan_id: number;
  instrument_code: string;
  locale: "it";
  external_href: string;
  score_factors?: {
    code: string;
    label_i18n: Record<string, string>;
    label_it: string | null;
    label_en: string | null;
  }[];
  institution: { id: number; name: string; institution_code: string | null };
}
export interface AdministrationEntryDraft {
  scores: Record<string, number>;
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
export function parseAdministrationLaunch(
  value: unknown,
): AdministrationLaunch {
  const row = value as AdministrationLaunch;
  if (
    !row ||
    ![row.path_id, row.step_id, row.administration_plan_id].every(
      Number.isInteger,
    ) ||
    typeof row.instrument_code !== "string" ||
    row.locale !== "it" ||
    row.external_href !== "https://www.competenzestrategiche.it/" ||
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

export function administrationDraftKey(
  owner: string,
  pathId: number,
  stepId: number,
): string {
  return `counselorbot-it-step:${encodeURIComponent(owner)}:${pathId}:${stepId}`;
}
