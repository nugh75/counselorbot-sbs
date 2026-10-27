"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch, getIdentity } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-context";
import { administrationStepText } from "@/lib/i18n-administration-steps";
import {
  administrationDraftKey,
  commitAdministrationEntry,
  parseAdministrationLaunch,
  scoreAdministrationStep,
  type AdministrationLaunch,
  type AdministrationEntryAck,
  type AdministrationResult,
} from "@/lib/administration-entry";
import { parseVerificationGrant } from "@/lib/institution-credentials";
import {
  buildDynamicQuestionnaireConfig,
  type QuestionnaireConfig,
} from "@/lib/questionnaires";
import { fetchInstruments } from "@/lib/instruments-api";
import { getSelectedCounselorId } from "@/lib/counselor";
import { deleteFrozenSession, getFrozenSession, type FrozenSessionDetail } from "@/lib/frozen-session";
import { resultsChatText } from "@/lib/i18n-results-chats";
import { ScoreInputForm } from "@/components/qsa/ScoreInputForm";
import { GuidedChatInterface } from "@/components/qsa/GuidedChatInterface";
import { InAppAdministrationRunner } from "@/components/administration/InAppAdministrationRunner";
import { PlanChatCompleted } from "@/components/administration/PlanChatCompleted";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import { useDraftGuard } from "@/lib/use-draft-guard";

export function AdministrationStepFlow({
  pathId,
  stepId,
}: {
  pathId: number;
  stepId: number;
}) {
  const { lang } = useI18n();
  const l = (key: Parameters<typeof administrationStepText>[1]) =>
    administrationStepText(lang, key);
  const [launch, setLaunch] = useState<AdministrationLaunch | null>(null);
  const [questionnaire, setQuestionnaire] =
    useState<QuestionnaireConfig | null>(null);
  const [error, setError] = useState(false);
  const [localeUnavailable, setLocaleUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [institutionCode, setInstitutionCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [grant, setGrant] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number> | null>(null);
  // In-app: answers and the saved runner result survive reloads; the result is never retyped.
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [saved, setSaved] = useState<AdministrationResult | null>(null);
  const runnerSession = useRef<string | null>(null);
  const [ack, setAck] = useState<AdministrationEntryAck | null>(null);
  const [snapshot, setSnapshot] = useState<FrozenSessionDetail | null>(null);
  const [resumeError, setResumeError] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [reload, setReload] = useState(0);
  const owner = useRef<string | null>(null);
  const draftKey = useRef<string | null>(null);
  const retryIds = useRef<{ session_id: string; request_id: string } | null>(
    null,
  );
  const accountMatches = async () =>
    owner.current === (await getIdentity())?.username;
  const persist = (draft: Record<string, unknown>) => {
    if (draftKey.current)
      try {
        sessionStorage.setItem(
          draftKey.current,
          JSON.stringify({ retryIds: retryIds.current, ...draft }),
        );
      } catch {}
  };
  const remember = (values: Record<string, number>) => {
    setScores(values);
    persist({ scores: values });
  };
  const rememberRunner = (
    values: Record<number, number>,
    result: AdministrationResult | null = saved,
  ) => {
    setAnswers(values);
    persist({ answers: values, runnerSession: runnerSession.current, saved: result });
  };
  useDraftGuard(
    (!!scores || Object.keys(answers).length > 0 || !!saved) && !ack,
    l("back"),
    { blocked: busy },
  );
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const identity = await getIdentity();
        if (!identity?.username) throw new Error("authentication");
        owner.current ??= identity.username;
        if (!(await accountMatches())) throw new Error("account changed");
        draftKey.current = administrationDraftKey(
          identity.username,
          pathId,
          stepId,
        );
        const response = await apiFetch(
          `/api/user/paths/${pathId}/steps/${stepId}/launch`,
          { method: "POST" },
        );
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          if (body?.detail === "administration_locale_unavailable" && !cancelled)
            setLocaleUnavailable(true);
          throw new Error("launch");
        }
        const target = parseAdministrationLaunch(await response.json());
        let frozen: FrozenSessionDetail | null = null;
        let resumeFailed = false;
        try {
          frozen = target.latest_entry ? await getFrozenSession(target.latest_entry.session_id) : null;
          if (frozen && (frozen.session_id !== target.latest_entry?.session_id || frozen.questionnaire_type !== target.instrument_code))
            throw new Error("snapshot mismatch");
        } catch {
          frozen = null;
          resumeFailed = true;
        }
        const rows = await fetchInstruments();
        const instrument = rows.find(
          (row) => row.code === target.instrument_code,
        );
        if (!instrument) throw new Error("instrument");
        const config = buildDynamicQuestionnaireConfig(instrument, lang);
        if (!target.score_factors?.length) throw new Error("factors");
        config.factors = target.score_factors.map((factor) => ({
          code: factor.code,
          name:
            factor.label_i18n[lang] ||
            factor.label_en ||
            factor.label_it ||
            factor.code,
          description: "",
          lowLabel: "",
          midLabel: "",
          highLabel: "",
        }));
        config.factorPrefix = [
          ...new Set(
            config.factors.map((factor) => factor.code.replace(/[0-9]+$/, "")),
          ),
        ];
        if (!cancelled && (await accountMatches())) {
          try {
            const stored = JSON.parse(
              sessionStorage.getItem(draftKey.current) || "null",
            );
            if (stored?.scores) setScores(stored.scores);
            if (stored?.answers) setAnswers(stored.answers);
            if (stored?.runnerSession) runnerSession.current = stored.runnerSession;
            if (stored?.saved) setSaved(stored.saved);
            if (stored?.retryIds) retryIds.current = stored.retryIds;
          } catch {}
          setLaunch(target);
          setSnapshot(frozen);
          setResumeError(resumeFailed);
          setQuestionnaire(config);
          setInstitutionCode(target.institution.institution_code ?? "");
          setError(false);
          setLocaleUnavailable(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Ownership is captured at entry and checked before every write and acknowledgement.
  }, [pathId, stepId, lang, reload]);
  const verify = async () => {
    if (
      !launch ||
      busy ||
      !institutionCode.trim() ||
      !password ||
      !(await accountMatches())
    )
      return;
    setBusy(true);
    setError(false);
    setVerifyError(null);
    const transientCode = institutionCode.trim();
    const transientPassword = password;
    setPassword("");
    try {
      const response = await apiFetch(
        `/api/user/administrations/${launch.administration_plan_id}/verify-institution`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            institution_code: transientCode,
            password: transientPassword,
          }),
        },
      );
      if (!response.ok) {
        setVerifyError(
          response.status === 429
            ? l("verifyThrottled")
            : l("verifyFailed"),
        );
        return;
      }
      const verified = parseVerificationGrant(await response.json());
      if (await accountMatches()) setGrant(verified.grant);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const enter = async (
    body: { scores: Record<string, number> } | { result_id: number },
    sessionId?: string,
  ) => {
    if (!grant || busy || !(await accountMatches())) return;
    setBusy(true);
    setError(false);
    retryIds.current ??= {
      // In-app entry reuses the saved result's session so chat and result stay together.
      session_id: sessionId ?? crypto.randomUUID(),
      request_id: crypto.randomUUID(),
    };
    if ("scores" in body) remember(body.scores);
    else rememberRunner(answers);
    try {
      const committed = await commitAdministrationEntry(apiFetch, pathId, stepId, {
        ...retryIds.current,
        ...body,
        institution_grant: grant,
      });
      const frozen = await getFrozenSession(committed.session_id);
      if (frozen && (frozen.session_id !== committed.session_id || frozen.questionnaire_type !== committed.result.questionnaire_type))
        throw new Error("snapshot mismatch");
      if (await accountMatches()) {
        setSnapshot(frozen);
        setLaunch(current => current ? { ...current, latest_entry: committed } : current);
        setAck(committed);
        if (draftKey.current) sessionStorage.removeItem(draftKey.current);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const saveRunner = async (values: Record<number, number>) => {
    if (!grant || busy || !(await accountMatches())) return;
    setBusy(true);
    setError(false);
    runnerSession.current ??= crypto.randomUUID();
    rememberRunner(values);
    try {
      const { result } = await scoreAdministrationStep(apiFetch, pathId, stepId, {
        session_id: runnerSession.current,
        answers: values,
        institution_grant: grant,
      });
      if (await accountMatches()) {
        setSaved(result);
        rememberRunner(values, result);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  // Le stesse credenziali che il sito chiede per compilare: codice e password.
  // La verifica resta locale e serve solo ad accettare i punteggi.
  const verificationFields = () => (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          {l("code")}
          <input
            value={institutionCode}
            autoComplete="off"
            onChange={(event) => {
              setInstitutionCode(event.target.value);
              if (verifyError) setVerifyError(null);
            }}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          {l("password")}
          <input
            type="password"
            autoComplete="off"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (verifyError) setVerifyError(null);
            }}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <Button
        disabled={busy || !institutionCode.trim() || !password}
        onClick={() => void verify()}
      >
        {l("verify")}
      </Button>
      <p className="text-xs text-slate-500">{l("verifyNotice")}</p>
      {verifyError && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {verifyError}
        </p>
      )}
    </div>
  );
  const reenter = () => {
    setAck(null); setCompleted(false); setScores(null); setAnswers({}); setSaved(null);
    retryIds.current = null; runnerSession.current = null;
    if (draftKey.current) sessionStorage.removeItem(draftKey.current);
    setReload(value => value + 1);
  };
  const reenterButton = <Button variant="secondary" onClick={reenter}>{resultsChatText(lang, "reenterData")}</Button>;
  if (ack && questionnaire && completed)
    return <div className="space-y-4">{reenterButton}<PlanChatCompleted sessionId={ack.session_id} questionnaireType={questionnaire.id} /></div>;
  if (ack && questionnaire)
    return (
      <div className="space-y-4">{reenterButton}<GuidedChatInterface
        scores={ack.result.scores}
        questionnaireType={questionnaire.id}
        sessionId={ack.session_id}
        counselorId={snapshot?.counselor_id ?? getSelectedCounselorId()}
        locale={snapshot?.locale || lang}
        frozenSnapshot={snapshot}
        onFrozen={() => { setAck(null); setReload(value => value + 1); }}
        onComplete={() => {
          setCompleted(true);
          void deleteFrozenSession(ack.session_id).catch(() => {});
        }}
      /></div>
    );
  return (
    <div className="space-y-4">
      <Link href="/profilo/piani-operativi">{l("back")}</Link>
      <h1 className="text-xl font-semibold">{l("administration")}</h1>
      {launch?.latest_entry && snapshot && !error && <Button onClick={() => setAck(launch.latest_entry!)}>
        {resultsChatText(lang, "resumeChat")}
      </Button>}
      {resumeError && <Callout variant="warning">{l("error")}{" "}
        <Button variant="secondary" onClick={() => setReload(value => value + 1)}>{l("retry")}</Button>
      </Callout>}
      {localeUnavailable && (
        <Callout variant="danger">{l("localeUnavailable")}</Callout>
      )}
      {error && !localeUnavailable && (
        <Callout variant="danger">
          {l("error")}{" "}
          <Button
            variant="secondary"
            onClick={() => setReload((value) => value + 1)}
          >
            {l("retry")}
          </Button>
        </Callout>
      )}
      {localeUnavailable ? null : !launch || !questionnaire ? (
        <p>{l("loading")}</p>
      ) : launch.delivery_mode === "in_app" ? (
        <>
          <Card className="space-y-3 p-4">
            <p className="text-sm text-slate-600">
              {questionnaire.name} · {launch.locale.toUpperCase()} ·{" "}
              {launch.institution.name}
            </p>
            <p>{l("inAppHint")}</p>
            <p className="text-sm text-slate-600">{l("rule")}</p>
            {grant ? (
              <p role="status" className="text-sm text-green-700">
                {l("verified")}
              </p>
            ) : (
              <>
                <p>{l("verifyHint")}</p>
                {verificationFields()}
              </>
            )}
          </Card>
          {grant && !saved && (
            <InAppAdministrationRunner
              instrumentCode={launch.instrument_code}
              locale={launch.locale}
              answers={answers}
              disabled={busy}
              onChange={(values) => rememberRunner(values)}
              onSubmit={(values) => void saveRunner(values)}
            />
          )}
          {saved && (
            <Card className="space-y-3 p-4">
              <p role="status">{l("resultSaved")}</p>
              <Button
                disabled={busy || !grant || !getSelectedCounselorId()}
                onClick={() => void enter({ result_id: saved.id }, saved.session_id)}
              >
                {l("enterSaved")}
              </Button>
              {!grant && <p className="text-sm text-slate-600">{l("verifyHint")}</p>}
            </Card>
          )}
          {!getSelectedCounselorId() && (
            <Link href={`/counselor?next=${encodeURIComponent(`/profilo/piani-operativi/${pathId}/${stepId}`)}`}>
              {l("counselor")}
            </Link>
          )}
        </>
      ) : (
        <>
          <Card className="space-y-4 p-4">
            <div className="space-y-1">
              <p className="text-sm text-slate-600">
                {questionnaire.name} · {launch.institution.name}
              </p>
              <h2 className="font-semibold">{l("compileTitle")}</h2>
            </div>
            <p>{l("loginHint")}</p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {l("code")}
                </dt>
                <dd className="mt-1 font-mono text-lg text-slate-900">
                  {launch.institution.institution_code}
                </dd>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {l("password")}
                </dt>
                <dd className="mt-1 text-sm text-slate-700">
                  {launch.institution.institution_password ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="select-all whitespace-pre-wrap font-mono text-lg text-slate-900">
                        {showPassword
                          ? launch.institution.institution_password
                          : "********"}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((value) => !value)}
                      >
                        {showPassword ? l("hidePassword") : l("showPassword")}
                      </Button>
                    </span>
                  ) : (
                    l("passwordFromTeacher")
                  )}
                </dd>
              </div>
            </dl>
            <a
              href={launch.external_href ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-indigo-200 bg-white px-4 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
            >
              {l("external")}
            </a>
            <p className="text-sm text-slate-600">{l("rule")}</p>
          </Card>
          <Card className="space-y-3 p-4">
            <h2 className="font-semibold">{l("scoresTitle")}</h2>
            {grant ? (
              <p role="status" className="text-sm text-green-700">
                {l("verifiedScores")}
              </p>
            ) : (
              <>
                <p>{l("verifyHint")}</p>
                {verificationFields()}
              </>
            )}
          </Card>
          <ScoreInputForm
            questionnaire={questionnaire}
            persistDraft={false}
            initialScores={scores || undefined}
            onDraftChange={remember}
            submitLabel={l("enter")}
            submitDisabled={busy || !grant || !getSelectedCounselorId()}
            actionsPosition="bottom"
            onSubmit={(values) => {remember(values);void enter({ scores: values });}}
          />
          {!getSelectedCounselorId() && (
            <Link href={`/counselor?next=${encodeURIComponent(`/profilo/piani-operativi/${pathId}/${stepId}`)}`}>
              {l("counselor")}
            </Link>
          )}
        </>
      )}
    </div>
  );
}
