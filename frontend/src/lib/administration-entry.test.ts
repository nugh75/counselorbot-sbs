import assert from "node:assert/strict";
import { test } from "node:test";
// prettier-ignore
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { administrationDraftKey, commitAdministrationEntry, parseAdministrationLaunch, scoreAdministrationStep } from "./administration-entry.ts";
// prettier-ignore
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { administrationStepText, administrationStepTexts, resultProvenanceText } from "./i18n-administration-steps.ts";

test("launch preserves exact target and never carries a password", () => {
  const launch = parseAdministrationLaunch({
    path_id: 1,
    step_id: 2,
    administration_plan_id: 3,
    instrument_code: "QSA",
    locale: "it",
    external_href: "https://www.competenzestrategiche.it/",
    institution: { id: 4, name: "Synthetic", institution_code: "SYN" },
  });
  assert.equal(launch.administration_plan_id, 3);
  assert.equal(launch.institution.name, "Synthetic");
});

test("409, 422, 5xx and network errors leave scores and stable retry identifiers recoverable", async () => {
  const draft = {
    scores: { C1: 5 },
    session_id: "session",
    request_id: "request",
    institution_grant: "synthetic",
  };
  for (const status of [409, 422, 500]) {
    await assert.rejects(
      commitAdministrationEntry(
        async () => new Response("{}", { status }),
        1,
        2,
        draft,
      ),
    );
    assert.deepEqual(draft.scores, { C1: 5 });
    assert.equal(draft.request_id, "request");
  }
  await assert.rejects(
    commitAdministrationEntry(
      async () => {
        throw new Error("network");
      },
      1,
      2,
      draft,
    ),
  );
  assert.equal(draft.session_id, "session");
});

test("a 200 without committed result/entry/evidence acknowledgement cannot open guided chat", async () => {
  await assert.rejects(
    commitAdministrationEntry(
      async () => Response.json({ result: { id: 1 } }),
      1,
      2,
      {
        scores: { C1: 5 },
        session_id: "session",
        request_id: "request",
        institution_grant: "synthetic",
      },
    ),
  );
});

test("successful entry exposes committed acknowledgement to the chat", async () => {
  const expected = {
    result: { id: 7, scores: { C1: 5 }, questionnaire_type: "QSA" },
    guided_entry_id: 8,
    evidence_id: 9,
    session_id: "session",
    accepted_at: "2026-10-09T20:00:00Z",
  };
  const actual = await commitAdministrationEntry(
    async (_url, init) => {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        scores: { C1: 5 },
        session_id: "session",
        request_id: "request",
        institution_grant: "synthetic",
      });
      return Response.json(expected);
    },
    1,
    2,
    {
      scores: { C1: 5 },
      session_id: "session",
      request_id: "request",
      institution_grant: "synthetic",
    },
  );
  assert.deepEqual(actual, expected);
});


test('draft keys isolate accounts, paths and steps', () => {
  assert.notEqual(administrationDraftKey('one',1,2),administrationDraftKey('two',1,2));
  assert.notEqual(administrationDraftKey('one',1,2),administrationDraftKey('one',2,2));
  assert.notEqual(administrationDraftKey('one',1,2),administrationDraftKey('one',1,3));
});

test('every administration message is explicit in all six interface languages', () => {
  for (const [key,values] of Object.entries(administrationStepTexts)) {
    assert.equal(values.length,6,key);
    assert.ok(values.every(value=>value.trim().length>0),key);
  }
  assert.match(administrationStepText('en','rule'),/confirmed import/);
  assert.match(administrationStepText('it','loginHint'),/non è recuperabile/);
  assert.match(administrationStepText('en','loginHint'),/does not complete/);
});

const inAppLaunch = {
  path_id: 1,
  step_id: 2,
  administration_plan_id: 3,
  instrument_code: "QSA",
  locale: "en",
  delivery_mode: "in_app",
  external_href: null,
  institution: { id: 4, name: "Synthetic", institution_code: "SYN" },
};

test("in-app launch keeps the exact plan locale and has no external link", () => {
  const launch = parseAdministrationLaunch(inAppLaunch);
  assert.equal(launch.delivery_mode, "in_app");
  assert.equal(launch.locale, "en");
  assert.equal(launch.external_href, null);
  assert.equal(parseAdministrationLaunch({ ...inAppLaunch, delivery_mode: undefined, locale: "it",
    external_href: "https://www.competenzestrategiche.it/" }).delivery_mode, "external_it");
  for (const forged of [
    { ...inAppLaunch, locale: "it" },
    { ...inAppLaunch, external_href: "https://example.invalid/" },
    { ...inAppLaunch, delivery_mode: "external_it" },
  ]) assert.throws(() => parseAdministrationLaunch(forged));
});

const runnerResult = {
  id: 7,
  session_id: "runner",
  scores: { C1: 9 },
  questionnaire_type: "QSA",
  administration_plan_id: 3,
  source: "in-app",
  capture_method: "item_runner",
  source_system: "counselorbot",
  locale: "en",
};

test("runner scoring returns the saved in-app result and keeps answers on failure", async () => {
  const draft = { session_id: "runner", answers: { 1: 4 }, institution_grant: "synthetic" };
  const saved = await scoreAdministrationStep(async (url, init) => {
    assert.equal(url, "/api/user/paths/1/steps/2/score");
    assert.deepEqual(JSON.parse(String(init?.body)), draft);
    return Response.json({ result: runnerResult, profile: { results: [] } });
  }, 1, 2, draft);
  assert.equal(saved.result.id, 7);
  for (const status of [409, 422, 500])
    await assert.rejects(scoreAdministrationStep(async () => new Response("{}", { status }), 1, 2, draft));
  for (const result of [{ ...runnerResult, session_id: "other" }, { ...runnerResult, capture_method: "manual_scores" },
    { ...runnerResult, source: "imported" }])
    await assert.rejects(scoreAdministrationStep(async () => Response.json({ result }), 1, 2, draft));
  assert.deepEqual(draft.answers, { 1: 4 });
});

test("in-app guided entry sends the saved result instead of retyped scores", async () => {
  const draft = { result_id: 7, session_id: "runner", request_id: "request", institution_grant: "synthetic" };
  await commitAdministrationEntry(async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), draft);
    return Response.json({ result: runnerResult, guided_entry_id: 8, evidence_id: 9, session_id: "runner",
      accepted_at: "2026-10-09T20:00:00Z" });
  }, 1, 2, draft);
});

test("result provenance stays honest for in-app, imported and old results", () => {
  assert.equal(resultProvenanceText("en", { source: "in-app", capture_method: "item_runner" }),
    "Captured in CounselorBot · in-app questionnaire");
  assert.equal(resultProvenanceText("en", { source: "imported", capture_method: "csv_import" }),
    "Imported by the teacher · file import");
  assert.equal(resultProvenanceText("en", { source: "in-app", capture_method: "legacy_unknown" }),
    "Captured in CounselorBot · capture method not recorded");
  assert.equal(resultProvenanceText("en", {}), "Captured in CounselorBot · capture method not recorded");
  assert.equal(resultProvenanceText("en", { source: "in-app", capture_method: "invented" }),
    "Captured in CounselorBot · capture method not recorded");
  assert.match(resultProvenanceText("it", { source: "in-app", capture_method: "manual_scores" }), /a mano/);
});
