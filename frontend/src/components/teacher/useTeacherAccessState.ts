'use client';

import { useEffect, useState } from 'react';
import { getIdentity, type Identity } from '@/lib/auth';
import { canUseTeacherAssistant, isTeacher } from '@/lib/roles';

// Stato di accesso condiviso da /docente e dalle sue sottopagine: stesso
// controllo di prima (canUseTeacherAssistant), un solo punto di verità.
export function useTeacherAccessState(): { state: 'loading' | 'ok' | 'forbidden'; teacher: boolean } {
    const [state, setState] = useState<'loading' | 'ok' | 'forbidden'>('loading');
    const [teacher, setTeacher] = useState(false);

    useEffect(() => {
        getIdentity().then((identity: Identity | null) => {
            setState(canUseTeacherAssistant(identity) ? 'ok' : 'forbidden');
            setTeacher(isTeacher(identity));
        });
    }, []);

    return { state, teacher };
}
