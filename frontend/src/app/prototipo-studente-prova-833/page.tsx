'use client';
// PROTOTYPE #833 (throwaway, never merged, mock data only, no backend).
// Question: how does a teacher pick/create a test student before an UNSCORED guided chat?
// Three variants via ?variant=A|B|C. Next to the scored method-choice screen (InputMethodSelector).
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Student = { id: number; name: string; meta: string; notes: number; chats: number };
const SEED: Student[] = [
  { id: 1, name: 'Giulia – 3ª liceo', meta: '17 y · undecided about university', notes: 4, chats: 2 },
  { id: 2, name: 'Marco – 2ª tecnico', meta: '15 y · low motivation', notes: 2, chats: 0 },
  { id: 3, name: 'Sara – 5ª professionale', meta: '19 y · wants to work abroad', notes: 6, chats: 5 },
];
const TOOL = 'SAVICKAS – Career construction interview (unscored guided chat)';
const VARIANTS = ['A', 'B', 'C'] as const;
const NAMES: Record<string, string> = { A: 'Same screen as questionnaires', B: 'Notebook cards', C: 'Search / create bar' };

const css = `
.p833{--t-soft:#e2f1fb;--t-line:#a9cfe8;--t-ink:#0b3a57;--t-mut:#33566f;--bg:#fff;--fg:#0f172a;--mut:#475569;--bd:#cbd5e1;--cream:#f8f5d7;--cl:#e0d89a;
 background:var(--bg);color:var(--fg);min-height:100vh;padding:16px 16px 96px;font-family:system-ui,sans-serif}
.p833.dark{--t-soft:#0e3149;--t-line:#2a6288;--t-ink:#d7ecfb;--t-mut:#a9c8de;--bg:#0b1117;--fg:#e5edf3;--mut:#9fb0bd;--bd:#334155;--cream:#2b2910;--cl:#5a5320}
.p833 .wrap{max-width:880px;margin:0 auto;display:grid;gap:14px}
.p833 .card{border:1px solid var(--bd);border-radius:10px;padding:14px}
.p833 .test{background:var(--t-soft);border-color:var(--t-line);color:var(--t-ink)}
.p833 .test .mut{color:var(--t-mut)}.p833 .mut{color:var(--mut);font-size:13px}
.p833 .badge{display:inline-block;border-radius:99px;padding:2px 10px;font-size:12px;font-weight:600;background:var(--t-soft);border:1px solid var(--t-line);color:var(--t-ink)}
.p833 button.b{min-height:44px;border-radius:8px;border:1px solid var(--bd);background:var(--bg);color:var(--fg);padding:0 14px;cursor:pointer;font-size:14px}
.p833 button.go{background:#0f6e72;color:#fff;border-color:#0f6e72;font-weight:600}
.p833 button:disabled{opacity:.45;cursor:not-allowed}
.p833 input,.p833 select{min-height:44px;border:1px solid var(--bd);border-radius:8px;padding:0 10px;background:var(--bg);color:var(--fg);font-size:14px;width:100%}
.p833 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.p833 .sel{outline:3px solid var(--t-ink)}
.p833 pre{font-size:12px;background:#0f172a;color:#cbd5e1;border-radius:8px;padding:10px;overflow:auto}
.p833 .bar{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);display:flex;gap:10px;align-items:center;background:#111;color:#fff;border-radius:99px;padding:8px 14px;box-shadow:0 4px 20px #0008;z-index:99;font-size:13px}
.p833 .bar button{background:none;border:0;color:#fff;font-size:18px;cursor:pointer;padding:4px 8px}
`;

type S = { students: Student[]; chosen: number | 'self' | null; started: boolean; log: string[] };

function Result({ s }: { s: S }) {
  const st = typeof s.chosen === 'number' ? s.students.find((x) => x.id === s.chosen) : null;
  return (
    <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
      {s.started && (
        <div className={`card ${st ? 'test' : ''}`}>
          <b>Chat started</b> · {TOOL}
          <div style={{ margin: '6px 0' }}>
            {st ? <span className="badge">🧪 Test student: {st.name}</span> : <span className="badge">Teacher's own account (no notebook)</span>}
          </div>
          <div className="mut">
            {st ? `[SIMULATION] notice in prompt · [PROFILE] = notebook "${st.name}" · transcript saved to that notebook, not to the teacher.` : 'Today\'s behaviour: empty-score result saved under the teacher.'}
          </div>
        </div>
      )}
      <pre>{JSON.stringify({ chosen: s.chosen, notebook: st?.name ?? null, started: s.started, notebooks: s.students.length, log: s.log.slice(-4) }, null, 1)}</pre>
    </div>
  );
}

function NewForm({ onCreate, onCancel }: { onCreate: (n: string, m: string) => void; onCancel?: () => void }) {
  const [n, setN] = useState('');
  const [m, setM] = useState('');
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <input placeholder="Name (e.g. Luca – 4ª liceo)" value={n} onChange={(e) => setN(e.target.value)} />
      <input placeholder="One-line profile (age, goal, difficulty)" value={m} onChange={(e) => setM(e.target.value)} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="b go" disabled={!n.trim()} onClick={() => onCreate(n.trim(), m.trim() || 'new profile')}>Create test student</button>
        {onCancel && <button className="b" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}

/* A: mirrors the scored method-choice screen: select + method cards + Continue. */
function VariantA({ s, set }: { s: S; set: (p: Partial<S>, l: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [method, setMethod] = useState<'none' | 'practice'>('none');
  const st = typeof s.chosen === 'number' ? s.students.find((x) => x.id === s.chosen) : null;
  return (
    <>
      <div className="card test">
        <label style={{ display: 'grid', gap: 6 }}><b>Practice student</b>
          <select value={typeof s.chosen === 'number' ? s.chosen : ''} onChange={(e) => {
            if (e.target.value === 'new') { setCreating(true); return; }
            const v = e.target.value ? Number(e.target.value) : null;
            set({ chosen: v, started: false }, `select ${v}`); setMethod(v ? 'practice' : 'none');
          }}>
            <option value="">— none (use my own account) —</option>
            {s.students.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            <option value="new">＋ New test student…</option>
          </select>
        </label>
        {st && <p className="mut">Chat and notes will be saved in the notebook of {st.name}.</p>}
        {creating && <div style={{ marginTop: 10 }}><NewForm onCancel={() => setCreating(false)} onCreate={(n, m) => {
          const id = Date.now(); set({ students: [...s.students, { id, name: n, meta: m, notes: 0, chats: 0 }], chosen: id, started: false }, `create ${n}`); setCreating(false); setMethod('practice');
        }} /></div>}
      </div>
      <div className="grid">
        <div className={`card ${method === 'practice' && st ? 'test sel' : ''}`}>
          <b>Start as test student</b><p className="mut">Guided chat with the notebook as profile (no scores to enter: this tool has none).</p>
        </div>
        <div className={`card ${method === 'none' ? 'sel' : ''}`}><b>Start with my own data</b><p className="mut">Current behaviour for unscored tools.</p></div>
      </div>
      <button className="b go" onClick={() => set({ started: true }, 'continue')} disabled={method === 'practice' && !st}>Continue →</button>
    </>
  );
}

/* B: notebook cards with inline create card; click card = start. */
function VariantB({ s, set }: { s: S; set: (p: Partial<S>, l: string) => void }) {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <p className="mut">Who is this conversation for?</p>
      <div className="grid">
        <button className={`card b ${s.chosen === 'self' ? 'sel' : ''}`} style={{ textAlign: 'left', height: 'auto', padding: 14 }} onClick={() => set({ chosen: 'self', started: false }, 'self')}>
          <b>Me (no test student)</b><div className="mut">Teacher account</div>
        </button>
        {s.students.map((x) => (
          <button key={x.id} className={`card test ${s.chosen === x.id ? 'sel' : ''}`} style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => set({ chosen: x.id, started: false }, `pick ${x.name}`)}>
            <span className="badge">🧪 Test student</span><div style={{ fontWeight: 700, marginTop: 6 }}>{x.name}</div>
            <div className="mut">{x.meta}</div><div className="mut">{x.notes} notes · {x.chats} chats</div>
          </button>
        ))}
        <div className="card" style={{ borderStyle: 'dashed' }}>
          {creating ? <NewForm onCancel={() => setCreating(false)} onCreate={(n, m) => {
            const id = Date.now(); set({ students: [...s.students, { id, name: n, meta: m, notes: 0, chats: 0 }], chosen: id, started: false }, `create ${n}`); setCreating(false);
          }} /> : <button className="b" style={{ width: '100%' }} onClick={() => setCreating(true)}>＋ New test student</button>}
        </div>
      </div>
      <button className="b go" disabled={s.chosen === null} onClick={() => set({ started: true }, 'start')}>Start chat →</button>
    </>
  );
}

/* C: one search/create bar; typing filters, last row creates. */
function VariantC({ s, set }: { s: S; set: (p: Partial<S>, l: string) => void }) {
  const [q, setQ] = useState('');
  const hits = s.students.filter((x) => x.name.toLowerCase().includes(q.toLowerCase()));
  const exact = s.students.some((x) => x.name.toLowerCase() === q.trim().toLowerCase());
  const st = typeof s.chosen === 'number' ? s.students.find((x) => x.id === s.chosen) : null;
  return (
    <>
      <div className="card">
        <b>Start with…</b>
        {st ? (
          <div className="card test" style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><span className="badge">🧪 Test student</span> <b>{st.name}</b></span>
            <button className="b" onClick={() => set({ chosen: null, started: false }, 'clear')}>Change</button>
          </div>
        ) : (
          <>
            <input style={{ marginTop: 8 }} placeholder="Type a test student name, or a new one…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              {hits.map((x) => <button key={x.id} className="b test" style={{ textAlign: 'left' }} onClick={() => { set({ chosen: x.id, started: false }, `pick ${x.name}`); setQ(''); }}>🧪 {x.name} <span className="mut">· {x.meta}</span></button>)}
              {q.trim() && !exact && <button className="b go" onClick={() => {
                const id = Date.now(); set({ students: [...s.students, { id, name: q.trim(), meta: 'new profile', notes: 0, chats: 0 }], chosen: id, started: false }, `create ${q}`); setQ('');
              }}>＋ Create “{q.trim()}” as new test student</button>}
              <button className="b" style={{ textAlign: 'left' }} onClick={() => set({ chosen: 'self', started: false }, 'self')}>Skip: use my own account {s.chosen === 'self' && '✓'}</button>
            </div>
          </>
        )}
      </div>
      <button className="b go" disabled={s.chosen === null} onClick={() => set({ started: true }, 'start')}>Start chat →</button>
    </>
  );
}

function Proto() {
  const router = useRouter();
  const sp = useSearchParams();
  const v = (VARIANTS as readonly string[]).includes(sp.get('variant') ?? '') ? (sp.get('variant') as string) : 'A';
  const [dark, setDark] = useState(false);
  const [s, setS] = useState<S>({ students: SEED, chosen: null, started: false, log: [] });
  const set = (p: Partial<S>, l: string) => setS((o) => ({ ...o, ...p, log: [...o.log, l] }));
  const go = (d: number) => { const i = VARIANTS.indexOf(v as 'A'); router.replace(`?variant=${VARIANTS[(i + d + 3) % 3]}`); };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
      if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });
  if (process.env.NODE_ENV === 'production') return null;
  const V = v === 'A' ? VariantA : v === 'B' ? VariantB : VariantC;
  return (
    <div className={`p833 ${dark ? 'dark' : ''}`}>
      <style>{css}</style>
      <div className="wrap">
        <div className="badge" style={{ justifySelf: 'start' }}>PROTOTYPE #833 · mock data · throwaway</div>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>{TOOL}</h1>
        <p className="mut">Before starting: pick an existing test student notebook or create one (same notebook as the scored questionnaires).</p>
        <V key={v} s={s} set={set} />
        <Result s={s} />
      </div>
      <div className="bar">
        <button onClick={() => go(-1)}>←</button><span>{v} ({NAMES[v]})</span><button onClick={() => go(1)}>→</button>
        <button onClick={() => setDark(!dark)} title="light/dark">{dark ? '☀' : '☾'}</button>
      </div>
    </div>
  );
}

export default function Page() { return <Suspense><Proto /></Suspense>; }
