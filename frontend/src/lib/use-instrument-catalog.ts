'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchInstruments, type InstrumentSummary } from './instruments-api';
import {
    buildDynamicQuestionnaireConfig,
    getQuestionnaire,
    type QuestionnaireConfig,
    type QuestionnaireType,
} from './questionnaires';

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

    const getInstrument = useCallback((code: string): InstrumentSummary | undefined => {
        return rows?.find((r) => r.code === code);
    }, [rows]);

    const resolveConfig = useCallback((code: string, lang = 'it'): QuestionnaireConfig => {
        const found = rows?.find((r) => r.code === code);
        if (found) return buildDynamicQuestionnaireConfig(found, lang);
        return getQuestionnaire(code as QuestionnaireType);
    }, [rows]);

    return {
        rows,
        loading: rows === null && !error,
        error,
        retry,
        getInstrument,
        resolveConfig,
    };
}
