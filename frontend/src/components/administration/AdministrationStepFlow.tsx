"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, getIdentity } from "@/lib/auth";
import { useI18n } from "@/lib/i18n-context";
import { administrationStepText } from "@/lib/i18n-administration-steps";
import {
  administrationDraftKey,
  commitAdministrationEntry,
  parseAdministrationLaunch,
  type AdministrationLaunch,
  type AdministrationEntryAck,
} from "@/lib/administration-entry";
import { parseVerificationGrant } from "@/lib/institution-credentials";
import {
  buildDynamicQuestionnaireConfig,
  type QuestionnaireConfig,
} from "@/lib/questionnaires";
import { fetchInstruments } from "@/lib/instruments-api";
import { getSelectedCounselorId } from "@/lib/counselor";
import { ScoreInputForm } from "@/components/qsa/ScoreInputForm";
import { GuidedChatInterface } from "@/components/qsa/GuidedChatInterface";
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
  const router = useRouter();
  const l = (key: Parameters<typeof administrationStepText>[1]) =>
    administrationStepText(lang, key);
  const [launch, setLaunch] = useState<AdministrationLaunch | null>(null);
  const [questionnaire, setQuestionnaire] =
    useState<QuestionnaireConfig | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [grant, setGrant] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, number> | null>(null);
  const [ack, setAck] = useState<AdministrationEntryAck | null>(null);
  const [reload, setReload] = useState(0);
  const owner = useRef<string | null>(null);
  const draftKey = useRef<string | null>(null);
  const retryIds = useRef<{ session_id: string; request_id: string } | null>(
    null,
  );
  const accountMatches = async () =>
    owner.current === (await getIdentity())?.username;
  const remember = (values: Record<string, number>) => {
    setScores(values);
    if (draftKey.current)
      try {
        sessionStorage.setItem(
          draftKey.current,
          JSON.stringify({ scores: values, retryIds: retryIds.current }),
        );
      } catch {}
  };
  useDraftGuard(!!scores && !ack, l("back"), { blocked: busy });
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
        if (!response.ok) throw new Error("launch");
        const target = parseAdministrationLaunch(await response.json());
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
            if (stored?.retryIds) retryIds.current = stored.retryIds;
          } catch {}
          setLaunch(target);
          setQuestionnaire(config);
          setError(false);
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
    if (!launch || busy || !(await accountMatches())) return;
    setBusy(true);
    setError(false);
    const transientPassword = password;
    setPassword("");
    try {
      const response = await apiFetch(
        `/api/user/administrations/${launch.administration_plan_id}/verify-institution`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            institution_code: launch.institution.institution_code,
            password: transientPassword,
          }),
        },
      );
      if (!response.ok) throw new Error("verification");
      const verified = parseVerificationGrant(await response.json());
      if (await accountMatches()) setGrant(verified.grant);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  const enter = async (values: Record<string, number>) => {
    if (!grant || busy || !(await accountMatches())) return;
    setBusy(true);
    setError(false);
    retryIds.current ??= {
      session_id: crypto.randomUUID(),
      request_id: crypto.randomUUID(),
    };
    remember(values);
    try {
      const saved = await commitAdministrationEntry(apiFetch, pathId, stepId, {
        ...retryIds.current,
        scores: values,
        institution_grant: grant,
      });
      if (await accountMatches()) {
        setAck(saved);
        if (draftKey.current) sessionStorage.removeItem(draftKey.current);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  if (ack && questionnaire)
    return (
      <GuidedChatInterface
        scores={ack.result.scores}
        questionnaireType={questionnaire.id}
        sessionId={ack.session_id}
        counselorId={getSelectedCounselorId()}
        locale={lang}
        onComplete={() => router.push("/profilo/percorsi")}
      />
    );
  return (
    <div className="space-y-4">
      <Link href="/profilo/percorsi">{l("back")}</Link>
      <h1 className="text-xl font-semibold">{l("administration")}</h1>
      {error && (
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
      {!launch || !questionnaire ? (
        <p>{l("loading")}</p>
      ) : (
        <>
          <Card className="space-y-3 p-4">
            <p>
              {launch.instrument_code} · {launch.institution.name} ·{" "}
              {launch.institution.institution_code}
            </p>
            <a
              href={launch.external_href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-indigo-700 underline"
            >
              {l("external")}
            </a>
            <p>{l("loginHint")}</p>
            <p className="text-sm text-slate-600">{l("rule")}</p>
            <label className="block">
              {l("password")}
              <input
                type="password"
                autoComplete="off"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="ml-2 rounded border border-slate-300 p-2"
              />
            </label>
            <Button disabled={busy || !password} onClick={() => void verify()}>
              {l("verify")}
            </Button>
          </Card>
          <ScoreInputForm
            questionnaire={questionnaire}
            persistDraft={false}
            initialScores={scores || undefined}
            onDraftChange={remember}
            submitLabel={l("enter")}
          submitDisabled={busy || !grant || !getSelectedCounselorId()}
          onSubmit={(values) => {remember(values);void enter(values);}}
          />
          {!getSelectedCounselorId() && (
            <Link href={`/counselor?next=${encodeURIComponent(`/profilo/percorsi/${pathId}/${stepId}`)}`}>
              {l("counselor")}
            </Link>
          )}
        </>
      )}
    </div>
  );
}
