"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Role = "teacher" | "student";
const KEYS = ["A", "B", "C"] as const;
const NAMES: Record<string, string> = {
    A: "Page background per area",
    B: "Header band only",
    C: "Cards and badges only",
};

// Proposed tokens. Light first, dark under .dark (mirrors the central remap).
const CSS = `
.rc{--rc-teacher:#f8f5d7;--rc-teacher-card:#fbf9e6;--rc-teacher-line:#e0d89a;--rc-teacher-ink:#0f172a;
--rc-student:#e9f2f2;--rc-student-line:#a0cccd;
--rc-test:#e2f1fb;--rc-test-line:#a9cfe8;--rc-neutral:#f8fafc;--rc-card:#ffffff;--rc-line:#e2e8f0;
--rc-ink:#0f172a;--rc-body:#334155;--rc-link:#155e63;}
.dark .rc{--rc-teacher:#2b2910;--rc-teacher-card:#34311a;--rc-teacher-line:#5a5320;
--rc-student:#103f42;--rc-student-line:#1f7376;
--rc-test:#0e3149;--rc-test-line:#2a6288;--rc-neutral:#0f172a;--rc-card:#1e293b;--rc-line:#334155;
--rc-ink:#f8fafc;--rc-body:#cbd5e1;--rc-link:#8fcfd1;}
`;

const area = (r: Role) => (r === "teacher" ? "var(--rc-teacher)" : "var(--rc-student)");
const areaLine = (r: Role) => (r === "teacher" ? "var(--rc-teacher-line)" : "var(--rc-student-line)");
const label = (r: Role) => (r === "teacher" ? "Teacher area" : "Student area");

const text = { color: "var(--rc-ink)" };
const body = { color: "var(--rc-body)" };

function Badge({ kind }: { kind: "test" | Role }) {
    const bg = kind === "test" ? "var(--rc-test)" : area(kind);
    const line = kind === "test" ? "var(--rc-test-line)" : areaLine(kind);
    const t = kind === "test" ? "Test student" : label(kind);
    return (
        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium" style={{ background: bg, borderColor: line, ...text }}>
            {kind === "test" ? "◇" : kind === "teacher" ? "▣" : "●"} {t}
        </span>
    );
}

const NAV = (r: Role) => (r === "teacher" ? ["Classes", "Assignments", "Prompts"] : ["My path", "Questionnaires", "Compass"]);

function Nav({ r, bg }: { r: Role; bg?: string }) {
    return (
        <div className="flex items-center gap-4 border-b px-4 py-3 text-sm" style={{ background: bg ?? "var(--rc-card)", borderColor: bg ? areaLine(r) : "var(--rc-line)", ...text }}>
            <strong>Counselorbot</strong>
            {NAV(r).map((n) => (
                <span key={n} style={body}>{n}</span>
            ))}
        </div>
    );
}

function Body({ r, cardBg, cardBorder, badge }: { r: Role; cardBg?: string; cardBorder?: string; badge?: boolean }) {
    const rows = r === "teacher" ? ["3B — Orientation", "4A — Study method"] : ["Study method questionnaire", "Guided chat: motivation"];
    return (
        <div className="space-y-3 p-4">
            <h2 className="text-lg font-semibold" style={text}>{r === "teacher" ? "Your classes" : "Your path"}</h2>
            {badge && <Badge kind={r} />}
            {rows.map((x) => (
                <div key={x} className="rounded-lg border p-3 text-sm" style={{ background: cardBg ?? "var(--rc-card)", borderColor: cardBorder ?? "var(--rc-line)", ...text }}>
                    <div className="font-medium">{x}</div>
                    <div style={body}>{r === "teacher" ? "24 students · 2 tests" : "In progress · 60%"}</div>
                </div>
            ))}
            <button className="rounded-md px-3 py-1.5 text-sm text-white" style={{ background: "var(--rc-link)", color: "var(--rc-card)" }}>Open</button>
        </div>
    );
}

function TestRow({ tinted, badgeOnly }: { tinted: boolean; badgeOnly?: boolean }) {
    const names = [["Giulia R.", false], ["Test student 1 (low motivation)", true], ["Marco B.", false], ["Test class — 3B-prova", true]] as const;
    return (
        <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--rc-line)", background: "var(--rc-card)" }}>
            {names.map(([n, t]) => (
                <div key={n} className="flex items-center justify-between border-b px-3 py-2 text-sm last:border-b-0" style={{ background: t && tinted ? "var(--rc-test)" : undefined, borderColor: "var(--rc-line)", ...text }}>
                    <span>{n}</span>
                    {t && (badgeOnly || !tinted) ? <Badge kind="test" /> : t ? <span style={body}>◇ test</span> : null}
                </div>
            ))}
        </div>
    );
}

function Frame({ title, children, bg }: { title: string; children: React.ReactNode; bg?: string }) {
    return (
        <section>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={body}>{title}</p>
            <div className="overflow-hidden rounded-xl border shadow-sm" style={{ background: bg ?? "var(--rc-neutral)", borderColor: "var(--rc-line)" }}>{children}</div>
        </section>
    );
}

// A: the whole page background carries the area tint.
function VariantA() {
    return (
        <>
            {(["teacher", "student"] as Role[]).map((r) => (
                <Frame key={r} title={label(r)} bg={area(r)}>
                    <Nav r={r} />
                    <Body r={r} />
                </Frame>
            ))}
            <Frame title="Test students (celestino rows)"><TestRow tinted /></Frame>
        </>
    );
}

// B: only a header band is tinted; page and cards stay neutral. Test = band + row badge.
function VariantB() {
    return (
        <>
            {(["teacher", "student"] as Role[]).map((r) => (
                <Frame key={r} title={label(r)}>
                    <Nav r={r} bg={area(r)} />
                    <Body r={r} />
                </Frame>
            ))}
            <Frame title="Test student view: celestino band + badge">
                <div className="border-b px-4 py-2 text-sm" style={{ background: "var(--rc-test)", borderColor: "var(--rc-test-line)", ...text }}>◇ You are viewing as Test student 1</div>
                <TestRow tinted={false} />
            </Frame>
        </>
    );
}

// C: neutral page and header; tint lives in cards, a role badge and a left stripe.
function VariantC() {
    return (
        <>
            {(["teacher", "student"] as Role[]).map((r) => (
                <Frame key={r} title={label(r)}>
                    <Nav r={r} />
                    <Body r={r} cardBg={area(r)} cardBorder={areaLine(r)} badge />
                </Frame>
            ))}
            <Frame title="Test students (badge only)"><TestRow tinted={false} badgeOnly /></Frame>
        </>
    );
}

export function Prototype() {
    const router = useRouter();
    const params = useSearchParams();
    const raw = params.get("variant") ?? "A";
    const variant = (KEYS as readonly string[]).includes(raw) ? raw : "A";
    const [dark, setDark] = useState(false);

    useEffect(() => {
        document.documentElement.classList.toggle("dark", dark);
        return () => document.documentElement.classList.remove("dark");
    }, [dark]);

    const go = (d: number) => {
        const next = KEYS[(KEYS.indexOf(variant as "A") + d + KEYS.length) % KEYS.length];
        router.replace(`?variant=${next}`);
    };

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement;
            if (t.closest("input,textarea,[contenteditable]")) return;
            if (e.key === "ArrowLeft") go(-1);
            if (e.key === "ArrowRight") go(1);
        };
        window.addEventListener("keydown", h);
        return () => window.removeEventListener("keydown", h);
    });

    if (process.env.NODE_ENV === "production") return null;

    return (
        <div className="rc mx-auto max-w-5xl space-y-4 p-4 pb-24" style={{ color: "var(--rc-ink)" }}>
            <style>{CSS}</style>
            <h1 className="text-xl font-bold">PROTOTYPE #831 — role tints (throwaway, mock data)</h1>
            <div className="grid gap-4 md:grid-cols-2">
                {variant === "A" && <VariantA />}
                {variant === "B" && <VariantB />}
                {variant === "C" && <VariantC />}
            </div>
            <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
                <button aria-label="Previous variant" onClick={() => go(-1)}>←</button>
                <span>{variant} ({NAMES[variant]})</span>
                <button aria-label="Next variant" onClick={() => go(1)}>→</button>
                <button className="ml-2 border-l border-slate-600 pl-3" onClick={() => setDark(!dark)}>{dark ? "Light" : "Dark"}</button>
            </div>
        </div>
    );
}
