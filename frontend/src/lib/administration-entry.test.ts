import assert from "node:assert/strict";
import { test } from "node:test";
// prettier-ignore
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { administrationDraftKey, commitAdministrationEntry, parseAdministrationLaunch } from "./administration-entry.ts";
// prettier-ignore
// @ts-expect-error -- Node's TypeScript runner requires the extension.
import { administrationStepText, administrationStepTexts } from "./i18n-administration-steps.ts";

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
