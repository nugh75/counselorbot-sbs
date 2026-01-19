'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Settings, FileText, ClipboardList } from 'lucide-react';
import { ConfigForm } from '@/components/admin/ConfigForm';
import { LogViewer } from '@/components/admin/LogViewer';
import { SurveyViewer } from '@/components/admin/SurveyViewer';

import { cn } from '@/lib/utils';

export default function AdminPage() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<'config' | 'logs' | 'surveys'>('config');
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) {
            router.push('/login');
        } else {
            setIsAuthenticated(true);
        }
    }, [router]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        router.push('/login');
    };

    if (!isAuthenticated) return null;

    return (
        <div className="min-h-screen bg-background">
            {/* Header */}
            <header className="border-b border-white/10 bg-black/20 backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                            <Settings className="w-5 h-5 text-white" />
                        </div>
                        <h1 className="font-bold text-lg text-white">Admin Dashboard</h1>
                    </div>

                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 text-sm text-gray-300 transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        Logout
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-8">
                {/* Tabs */}
                <div className="flex gap-4 mb-8">
                    <button
                        onClick={() => setActiveTab('config')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                            activeTab === 'config'
                                ? "bg-blue-600/10 border-blue-600/20 text-blue-400"
                                : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                        )}
                    >
                        <Settings className="w-4 h-4" />
                        Configurazione & Prompt
                    </button>
                    <button
                        onClick={() => setActiveTab('logs')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                            activeTab === 'logs'
                                ? "bg-blue-600/10 border-blue-600/20 text-blue-400"
                                : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                        )}
                    >
                        <FileText className="w-4 h-4" />
                        Log Conversazioni
                    </button>
                    <button
                        onClick={() => setActiveTab('surveys')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                            activeTab === 'surveys'
                                ? "bg-blue-600/10 border-blue-600/20 text-blue-400"
                                : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                        )}
                    >
                        <ClipboardList className="w-4 h-4" />
                        Questionari
                    </button>
                </div>

                {/* Content */}
                <div className="animate-fade-in-up">
                    {activeTab === 'config' && <ConfigForm />}
                    {activeTab === 'logs' && <LogViewer />}
                    {activeTab === 'surveys' && <SurveyViewer />}
                </div>
            </main>
        </div>
    );
}
