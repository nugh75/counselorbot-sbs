"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n-context";
import { administrationStepText } from "@/lib/i18n-administration-steps";
import { fetchRules, type InstrumentRules } from "@/lib/instruments-api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";

// Item runner for one in-app administration: always the plan locale, never a fallback.
export function InAppAdministrationRunner({
  instrumentCode,
  locale,
  answers,
  disabled,
  onChange,
  onSubmit,
}: {
  instrumentCode: string;
  locale: string;
  answers: Record<number, number>;
  disabled: boolean;
  onChange: (answers: Record<number, number>) => void;
  onSubmit: (answers: Record<number, number>) => void;
}) {
  const { lang } = useI18n();
  const l = (key: Parameters<typeof administrationStepText>[1]) =>
    administrationStepText(lang, key);
  const [rules, setRules] = useState<InstrumentRules | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchRules(instrumentCode, locale)
      .then((result) => {
        if (cancelled) return;
        if ("unavailable" in result) setUnavailable(true);
        else setRules(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [instrumentCode, locale, reload]);
  if (unavailable)
    return <Callout variant="danger">{l("localeUnavailable")}</Callout>;
  if (failed)
    return (
      <Callout variant="danger">
        {l("error")}{" "}
        <Button variant="secondary" onClick={() => {
            setFailed(false);
            setReload((value) => value + 1);
          }}>
          {l("retry")}
        </Button>
      </Callout>
    );
  if (!rules) return <p>{l("loading")}</p>;
  const items = rules.items
    .filter((item) => item.active)
    .sort((a, b) => a.item_number - b.item_number);
  const { response_scale_min: min, response_scale_max: max, response_labels } =
    rules.instrument;
  const scale = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  const complete = items.every((item) => answers[item.item_number] !== undefined);
  return (
    <Card className="space-y-4 p-4" lang={locale}>
      <p className="text-sm text-slate-600">{l("answerAll")}</p>
      {items.map((item) => (
        <fieldset key={item.item_number} className="space-y-2">
          <legend className="font-medium">
            {item.item_number}. {item.text ?? ""}
          </legend>
          <div className="flex flex-wrap gap-2">
            {scale.map((value) => (
              <label key={value} className="inline-flex min-h-11 items-center gap-2 rounded border border-slate-300 px-3">
                <input
                  type="radio"
                  name={`item-${item.item_number}`}
                  value={value}
                  checked={answers[item.item_number] === value}
                  disabled={disabled}
                  onChange={() => onChange({ ...answers, [item.item_number]: value })}
                />
                {response_labels?.[value - min] || value}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <Button disabled={disabled || !complete} onClick={() => onSubmit(answers)}>
        {l("saveResult")}
      </Button>
    </Card>
  );
}
