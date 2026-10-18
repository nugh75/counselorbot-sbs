'use client';

// Chat guidate in prova di un taccuino: aperte o concluse, dai log dei turni.
// La trascrizione resta leggibile anche dopo «Concludi»; quelle ancora aperte
// (snapshot autosalvato) si riaprono per proseguire.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n-context';
import { practiceNotebookText } from '@/lib/i18n-practice-notebooks';
import { QUESTIONNAIRES, type QuestionnaireType } from '@/lib/questionnaires';
import type { FrozenSessionSummary } from '@/lib/frozen-session';
import type { PracticeChat, PracticeChatMessage } from '@/lib/practice-notebooks';
import { practiceNotebookApi } from '@/lib/practice-notebooks-api';

const secondary = 'min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

type Row = { sessionId: string; instrument: string; updatedAt?: string | null; turns?: number; logged: boolean; open: boolean };

export function PracticeChats({ notebookId, openChats, openChatsFailed }: {
    notebookId: number;
    openChats: FrozenSessionSummary[] | null;
    openChatsFailed: boolean;
}) {
    const { lang, t } = useI18n();
    const l = (key: Parameters<typeof practiceNotebookText>[1]) => practiceNotebookText(lang, key);
    const [chats, setChats] = useState<PracticeChat[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [shown, setShown] = useState<string | null>(null);
    const [transcript, setTranscript] = useState<PracticeChatMessage[] | null>(null);
    const [transcriptFailed, setTranscriptFailed] = useState(false);

    const load = useCallback(async () => {
        setFailed(false);
        try {
            setChats(await practiceNotebookApi.chats(notebookId));
        } catch {
            setFailed(true);
        }
    }, [notebookId]);
    useEffect(() => {
        practiceNotebookApi.chats(notebookId).then(setChats).catch(() => setFailed(true));
    }, [notebookId]);

    const instrumentName = (id: string) => {
        const localized = t(`q.${id}.name`);
        return localized === `q.${id}.name` ? QUESTIONNAIRES[id as QuestionnaireType]?.name ?? id : localized;
    };

    // Le chat aperte prima che il server registrasse il taccuino arrivano solo dallo snapshot.
    const openIds = new Set((openChats ?? []).map((chat) => chat.session_id));
    const rows: Row[] = [
        ...(chats ?? []).map((chat) => ({
            sessionId: chat.session_id, instrument: chat.questionnaire_type ?? '', updatedAt: chat.updated_at,
            turns: chat.turns, logged: true, open: openIds.has(chat.session_id),
        })),
        ...(openChats ?? []).filter((chat) => !(chats ?? []).some((row) => row.session_id === chat.session_id)).map((chat) => ({
            sessionId: chat.session_id, instrument: chat.questionnaire_type, updatedAt: chat.updated_at, logged: false, open: true,
        })),
    ];

    const toggle = async (sessionId: string) => {
        if (shown === sessionId) { setShown(null); return; }
        setShown(sessionId);
        setTranscript(null);
        setTranscriptFailed(false);
        try {
            setTranscript(await practiceNotebookApi.transcript(notebookId, sessionId));
        } catch {
            setTranscriptFailed(true);
        }
    };

    return (
        <section data-practice-chats className="space-y-2 border-t border-slate-200 pt-3">
            <h3 className="text-sm font-semibold text-slate-700">{l('practiceChats')}</h3>
            <p className="text-xs text-slate-500">{l('practiceChatsHint')}</p>
            {(failed || openChatsFailed) && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-red-600">
                <p>{l('chatsError')}</p>
                {failed && <button type="button" onClick={() => void load()} className={secondary}>{l('retry')}</button>}
            </div>}
            {chats !== null && openChats !== null && !rows.length && <p className="text-xs text-slate-500">{l('noPracticeChats')}</p>}
            <ul className="space-y-2">
                {rows.map((row) => (
                    <li key={row.sessionId} data-practice-chat={row.sessionId} className="rounded-md border border-slate-200 p-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="min-w-0 flex-1 text-slate-800">
                                <span className="font-semibold">{instrumentName(row.instrument)}</span>
                                <span className="ml-2 text-xs text-slate-500">
                                    {[row.updatedAt ? new Date(row.updatedAt).toLocaleDateString(lang) : '', l(row.open ? 'chatOpen' : 'chatCompleted')].filter(Boolean).join(' · ')}
                                </span>
                            </span>
                            {row.logged && <button type="button" aria-expanded={shown === row.sessionId} onClick={() => void toggle(row.sessionId)} className={secondary}>
                                {l(shown === row.sessionId ? 'hideTranscript' : 'readTranscript')}
                            </button>}
                            {row.open && <Link href={`/?frozen=${encodeURIComponent(row.sessionId)}`} className={`${secondary} inline-flex items-center`}>{l('openChat')}</Link>}
                        </div>
                        {shown === row.sessionId && (
                            <div data-practice-transcript className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                                {transcript === null && !transcriptFailed && <p role="status" className="text-xs text-slate-500">{t('common.loading')}</p>}
                                {transcriptFailed && <p role="alert" className="text-xs text-red-600">{l('transcriptError')}</p>}
                                {transcript?.map((message, index) => (
                                    <div key={index}>
                                        <p className="text-xs font-semibold text-slate-600">{l(message.role === 'student' ? 'roleStudent' : 'roleCounselor')}</p>
                                        <p className="whitespace-pre-line text-slate-800">{message.text}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}
