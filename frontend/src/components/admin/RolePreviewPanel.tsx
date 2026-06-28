'use client';

import { useEffect, useState } from 'react';
import { Check, Eye, Minus, UserCog } from 'lucide-react';
import {
    getViewAsAccount, setViewAsUsername, clearViewAs, VIEW_AS_ACCOUNTS,
    type ViewAsRole, type ViewAsAccount, type Identity,
} from '@/lib/auth';
import {
    canUseAssistant, canUsePersonalPage, canUseResearchConsole, canUseTeacherAssistant,
} from '@/lib/roles';

type RoleKey = ViewAsRole | 'admin';

const ROLE_LABEL: Record<RoleKey, string> = {
    studente: 'Studente',
    ricercatore: 'Ricercatore',
    docente: 'Docente',
    admin: 'Admin',
};

const ROLE_DESC: Record<ViewAsRole, string> = {
    studente: 'Compila gli strumenti, usa taccuino/libretto/portfolio e l\'assistente. Nessun accesso a ricerca o amministrazione.',
    ricercatore: 'Come lo studente, piu\' la console di ricerca (risultati, validazione, contatti) e l\'assistente docente.',
    docente: 'Come lo studente, piu\' l\'assistente docente. Nessun accesso alla console di ricerca.',
};

// Identita' sintetiche per costruire la matrice delle capacita' per ruolo.
function syntheticIdentity(role: RoleKey): Identity {
    const base: Identity = {
        email: '', username: 'preview', name: 'preview',
        groups: [], is_admin: false, is_researcher: false, authenticated: true,
    };
    if (role === 'admin') return { ...base, is_admin: true, groups: ['admins'] };
    if (role === 'ricercatore') return { ...base, is_researcher: true, groups: ['researchers'] };
    if (role === 'docente') return { ...base, groups: ['docenti'] };
    return { ...base, groups: ['studenti'] };
}

const CAPABILITIES: { label: string; fn: (id: Identity) => boolean }[] = [
    { label: 'Assistente', fn: canUseAssistant },
    { label: 'Taccuino / pagina personale', fn: canUsePersonalPage },
    { label: 'Assistente docente', fn: canUseTeacherAssistant },
    { label: 'Console ricerca / amministrazione', fn: canUseResearchConsole },
];

const ROLES: RoleKey[] = ['studente', 'ricercatore', 'docente', 'admin'];

export function RolePreviewPanel() {
    const [active, setActive] = useState<ViewAsAccount | null>(null);

    useEffect(() => { setActive(getViewAsAccount()); }, []);

    const startPreview = (account: ViewAsAccount) => {
        setViewAsUsername(account.username);
        // Ricarica sulla home cosi' tutta l'interfaccia usa il profilo scelto.
        window.location.href = '/';
    };

    const stopPreview = () => {
        clearViewAs();
        window.location.reload();
    };

    return (
        <div className="space-y-6">
            <div className="glass-panel p-5 space-y-2">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Eye className="h-5 w-5 text-indigo-600" />
                    Profili di prova
                </h2>
                <p className="text-sm text-slate-500">
                    Usa un profilo di prova per vedere l&apos;interfaccia degli altri ruoli e fare prove di
                    interazione. Le tue azioni (taccuino, libretto, portfolio, chat) vengono salvate sul
                    profilo di prova e <strong>restano nel database</strong>, cosi&apos; puoi riprenderle.
                    Vale solo per il tuo browser e non cambia i permessi reali; per uscire usa la barra in
                    basso o &ldquo;Torna ad Admin&rdquo;.
                </p>
            </div>

            {active && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                        <UserCog className="h-5 w-5" />
                        Profilo attivo: {active.name} ({ROLE_LABEL[active.role]}) · {active.username}
                    </div>
                    <button
                        type="button"
                        onClick={stopPreview}
                        className="inline-flex items-center gap-1.5 rounded-md bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
                    >
                        Torna ad Admin
                    </button>
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {VIEW_AS_ACCOUNTS.map((account) => {
                    const isActive = active?.username === account.username;
                    return (
                        <div key={account.username} className="glass-panel flex flex-col gap-2 p-4">
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-slate-800">{account.name}</h3>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                    {ROLE_LABEL[account.role]}
                                </span>
                            </div>
                            <p className="text-[11px] font-semibold text-slate-400">{account.username}</p>
                            <p className="grow text-xs text-slate-500">{ROLE_DESC[account.role]}</p>
                            <button
                                type="button"
                                onClick={() => startPreview(account)}
                                className={`inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold ${
                                    isActive
                                        ? 'border border-indigo-200 bg-indigo-50 text-indigo-700'
                                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                                }`}
                            >
                                <Eye className="h-4 w-4" />
                                {isActive ? 'In uso' : 'Usa questo profilo'}
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Matrice delle capacita' per ruolo: cosa vede/puo' fare ciascun ruolo. */}
            <div className="glass-panel overflow-x-auto p-5">
                <h3 className="mb-3 text-sm font-bold text-slate-800">Cosa puo&apos; fare ogni ruolo</h3>
                <table className="w-full min-w-[34rem] text-sm">
                    <thead>
                        <tr className="border-b border-slate-200 text-left text-slate-500">
                            <th className="py-2 pr-4 font-semibold">Funzione</th>
                            {ROLES.map((role) => (
                                <th key={role} className="px-3 py-2 text-center font-semibold">{ROLE_LABEL[role]}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {CAPABILITIES.map((cap) => (
                            <tr key={cap.label} className="border-b border-slate-100">
                                <td className="py-2 pr-4 font-medium text-slate-700">{cap.label}</td>
                                {ROLES.map((role) => {
                                    const ok = cap.fn(syntheticIdentity(role));
                                    return (
                                        <td key={role} className="px-3 py-2 text-center">
                                            {ok ? (
                                                <Check className="mx-auto h-4 w-4 text-emerald-600" />
                                            ) : (
                                                <Minus className="mx-auto h-4 w-4 text-slate-300" />
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
