'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchInstruments, type InstrumentSummary } from './instruments-api';

export function useInstrumentCatalog() {
    const [rows, setRows] = useState<InstrumentSummary[] | null>(null);
    const [error, setError] = useState(false);
    const [requestVersion, setRequestVersion] = useState(0);

    useEffect(() => {
        let active = true;
        fetchInstruments()
            .then((result) => {
                if (active) setRows(result);
            })
            .catch(() => {
                if (!active) return;
                setRows(null);
                setError(true);
            });
        return () => { active = false; };
    }, [requestVersion]);

    const retry = useCallback(() => {
        setRows(null);
        setError(false);
        setRequestVersion((value) => value + 1);
    }, []);

    return { rows, loading: rows === null && !error, error, retry };
}
