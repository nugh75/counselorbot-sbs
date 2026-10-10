'use client';

import { useEffect, useState } from 'react';
import { getIdentity, type Identity } from '@/lib/auth';
import { canManageInstitutes, canUseTeacherAssistant, isTeacher } from '@/lib/roles';

// Stato di accesso condiviso da /docente e dalle sue sottopagine: stesso
// controllo di prima (canUseTeacherAssistant), un solo punto di verità.
export function useTeacherAccessState(): { state: 'loading' | 'ok' | 'forbidden'; teacher: boolean; institutes: boolean } {
    const [state, setState] = useState<'loading' | 'ok' | 'forbidden'>('loading');
    const [teacher, setTeacher] = useState(false);
    const [institutes, setInstitutes] = useState(false);

    useEffect(() => {
        getIdentity().then((identity: Identity | null) => {
            setState(canUseTeacherAssistant(identity) ? 'ok' : 'forbidden');
            setTeacher(isTeacher(identity));
            setInstitutes(canManageInstitutes(identity));
        });
    }, []);

    return { state, teacher, institutes };
}
