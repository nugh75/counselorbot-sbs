'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, MessageSquare, LogIn, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

interface LogEntry {
    id: number;
    session_id: string;
    action: string;
    timestamp: string;
    details: any;
}

export function LogViewer() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedLog, setExpandedLog] = useState<number | null>(null);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/admin/logs`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setLogs(data);
            } else {
                if (res.status === 401 || res.status === 403) {
                    localStorage.removeItem('token');
                    window.location.href = '/counselorbot/login';
                }
                console.error('Failed to fetch logs:', res.statusText);
            }
        } catch (error) {
            console.error('Failed to fetch logs', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const getActionIcon = (action: string) => {
        switch (action) {
            case 'chat_message': return <MessageSquare className="w-4 h-4" />;
            case 'login': return <LogIn className="w-4 h-4" />;
            case 'qsa_completed': return <CheckCircle className="w-4 h-4" />;
            default: return null;
        }
    };

    const getActionBadge = (action: string) => {
        const styles: Record<string, string> = {
            'chat_message': 'bg-blue-100 text-blue-700',
            'login': 'bg-green-100 text-green-700',
            'qsa_completed': 'bg-purple-100 text-purple-700',
        };
        return styles[action] || 'bg-slate-100 text-slate-600';
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-slate-800">Log Attività Recenti</h3>
                <button
                    onClick={fetchLogs}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 font-medium">Data</th>
                                <th className="px-4 py-3 font-medium">Sessione</th>
                                <th className="px-4 py-3 font-medium">Azione</th>
                                <th className="px-4 py-3 font-medium">Dettagli</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {logs.map((log) => (
                                <tr
                                    key={log.id}
                                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                                    onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                                >
                                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                                        {format(new Date(log.timestamp), 'dd/MM/yyyy HH:mm')}
                                    </td>
                                    <td className="px-4 py-3 text-slate-400 font-mono text-xs">
                                        {log.session_id.substring(0, 8)}...
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getActionBadge(log.action)}`}>
                                            {getActionIcon(log.action)}
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 max-w-md">
                                        {expandedLog === log.id ? (
                                            <pre className="text-xs bg-slate-50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                                                {JSON.stringify(log.details, null, 2)}
                                            </pre>
                                        ) : (
                                            <span className="truncate block text-xs">
                                                {log.details?.mode && <span className="text-blue-600">[{log.details.mode}]</span>}
                                                {' '}
                                                {log.details?.user_input?.substring(0, 50)}...
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {logs.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                                        Nessun log trovato.
                                    </td>
                                </tr>
                            )}
                            {loading && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                                        <RefreshCw className="w-5 h-5 animate-spin mx-auto" />
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <p className="text-xs text-slate-400 text-center">
                Clicca su una riga per espandere i dettagli
            </p>
        </div>
    );
}
