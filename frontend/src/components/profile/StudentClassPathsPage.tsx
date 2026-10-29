'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch } from '@/lib/auth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Skeleton } from '@/components/ui/Skeleton';
import { classPathText, type PathTextKey } from '@/lib/i18n-class-paths';
import { parseStudentClassPaths, type StudentClassPath } from '@/lib/class-paths';
import { ClassPathHeroList } from './ClassPathHeroList';

// The same cards as the overview: every plan, the priority one open.
export function StudentClassPathsPage() {
    const { lang } = useI18n();
    const l = (key: PathTextKey) => classPathText(lang, key);

    const [paths, setPaths] = useState<StudentClassPath[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const requestVersion = useRef(0);

    const loadPaths = useCallback(async () => {
        const version = ++requestVersion.current;
        setLoading(true);
        setError(false);
        try {
            const res = await apiFetch('/api/user/paths');
            if (!res.ok) throw new Error('Failed to load student paths');
            const data = await res.json();
            if (version === requestVersion.current) setPaths(parseStudentClassPaths(data));
        } catch {
            if (version === requestVersion.current) setError(true);
        } finally {
            if (version === requestVersion.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        void Promise.resolve().then(loadPaths);
        const visible = () => { if (document.visibilityState === 'visible') void loadPaths(); };
        window.addEventListener('focus', visible);
        window.addEventListener('pageshow', visible);
        document.addEventListener('visibilitychange', visible);
        return () => {
            requestVersion.current += 1;
            window.removeEventListener('focus', visible);
            window.removeEventListener('pageshow', visible);
            document.removeEventListener('visibilitychange', visible);
        };
    }, [loadPaths]);

    // A reload after an action keeps the cards (and their open state) on screen.
    if (loading && paths.length === 0) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-36 w-full rounded-xl" />
                <Skeleton className="h-64 w-full rounded-xl" />
            </div>
        );
    }

    if (error) {
        return (
            <Callout variant="danger">
                <p>{l('loadError')}</p>
                <Button variant="secondary" onClick={() => void loadPaths()}>
                    {l('reload')}
                </Button>
            </Callout>
        );
    }

    if (paths.length === 0) {
        return (
            <Card className="py-12 text-center">
                <p className="text-sm text-slate-500">{l('studentPathsEmpty')}</p>
            </Card>
        );
    }

    return <ClassPathHeroList paths={paths} onReload={loadPaths} showAllLink={false} />;
}
