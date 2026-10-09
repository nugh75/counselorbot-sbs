import assert from "node:assert/strict";
import { test } from "node:test";
// prettier-ignore
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { deepDiveSources, parseResultsDeepDive, ResultsDeepDiveError, startResultsDeepDive } from "./results-deep-dive.ts";
// prettier-ignore
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { administrationStepText, typedStepTargetLabel } from "./i18n-administration-steps.ts";

const session = {
  path_id: 1,
  step_id: 3,
  results_step_id: 2,
  session_id: "bound-session",
  started_at: "2026-10-09T10:00:00+00:00",
  result: {
    id: 7,
    session_id: "entry-session",
    scores: { C1: 5 },
    questionnaire_type: "QSA",
    administration_plan_id: 4,
    source: "in-app",
    capture_method: "manual_scores",
    source_system: "competenzestrategiche.it",
    locale: "it",
  },
};

test("start returns the server-bound session and result for this exact step", async () => {
  const calls: string[] = [];
  const started = await startResultsDeepDive(
    async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method} ${url}`);
      return new Response(JSON.stringify(session), { status: 200 });
    },
    1,
    3,
  );
  assert.deepEqual(calls, ["POST /api/user/paths/1/steps/3/deep-dive"]);
  assert.equal(started.session_id, "bound-session");
  assert.deepEqual(started.result.scores, { C1: 5 });
});

test("incomplete administration, strict lock and failures are distinct", async () => {
  const cases: [number, unknown, string][] = [
    [409, { detail: "results_step_incomplete" }, "incomplete"],
    [409, { detail: "class_path_step_locked" }, "locked"],
    [403, { detail: "class_path_access_denied" }, "error"],
    [500, null, "error"],
  ];
  for (const [status, body, reason] of cases) {
    await assert.rejects(
      startResultsDeepDive(
        async () => new Response(JSON.stringify(body), { status }),
        1,
        3,
      ),
      (error: unknown) =>
        error instanceof ResultsDeepDiveError && error.reason === reason,
    );
  }
});

test("a session for another step or without a result is rejected", () => {
  for (const forged of [
    { ...session, step_id: 9 },
    { ...session, path_id: 9 },
    { ...session, session_id: "" },
    { ...session, result: { ...session.result, id: 0 } },
    { ...session, result: null },
  ]) {
    assert.throws(() => parseResultsDeepDive(forged, 1, 3), ResultsDeepDiveError);
  }
});

test("builder offers only saved, not yet linked administration steps", () => {
  const steps = [
    { id: 1, step_type: "tool" },
    { id: 2, step_type: "questionnaire_administration" },
    { step_type: "questionnaire_administration" },
    { id: 4, step_type: "questionnaire_administration" },
    { step_type: "guided_results_chat", results_step_id: 4 },
  ];
  assert.deepEqual(deepDiveSources(steps).map((step) => step.id), [2]);
});

test("deep-dive copy states the completion rule in every language", () => {
  for (const lang of ["it", "en", "es", "fr", "de", "sv"]) {
    assert.ok(administrationStepText(lang, "deepDive").length > 0, lang);
    assert.ok(administrationStepText(lang, "deepDiveRule").length > 0, lang);
  }
  assert.match(administrationStepText("en", "deepDiveRule"), /final guided turn/);
  assert.match(administrationStepText("en", "deepDiveRule"), /does not undo/);
});

test("student and teacher progress name a deep dive by kind and bound administration", () => {
  const target = { instrument_code: "QSA", code: "AP-SYN" };
  assert.equal(
    typedStepTargetLabel("en", { step_type: "guided_results_chat", target_summary: target }),
    "Guided results deep dive · QSA · AP-SYN",
  );
  assert.equal(
    typedStepTargetLabel("it", { step_type: "questionnaire_administration", target_summary: target }),
    "QSA · AP-SYN",
  );
  assert.equal(typedStepTargetLabel("en", { step_type: "tool", target_summary: null }), null);
});
