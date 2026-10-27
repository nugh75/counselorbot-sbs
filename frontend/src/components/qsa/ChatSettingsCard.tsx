'use client';

// Pagina unica dei settaggi della conversazione, nel flusso tra il Profilo e
// la chat. Stile della card di scelta percorso: una scheda, le opzioni come
// righe leggibili, un solo pulsante per procedere. Qui il Ragionamento non
// sparisce mai: se il counselor scelto non lo supporta la riga resta con la
// spiegazione, invece di farsi mancare senza spiegazioni.
import { Button } from '@/components/ui/Button';
import { useEffect, useRef, useState } from 'react';
import { useClassChatSettings } from '@/lib/use-class-chat-settings';
import { ResponseFormatSelector } from '@/components/ui/ResponseFormatSelector';
import { ResponseLengthSelector, type ResponseLength } from '@/components/ui/ResponseLengthSelector';
import { ReasoningSelector, type ReasoningEffort } from '@/components/ui/ReasoningSelector';
import { AudioSendOption } from '@/components/ui/AudioSendOption';
import { AudioLanguageOption } from '@/components/ui/AudioLanguageOption';
import { MessageSquare, Terminal } from 'lucide-react';
import { chatPreferenceLabel, type ResponseFormat } from '@/lib/chat-preferences';
import { useI18n } from '@/lib/i18n-context';
import { ChatGPTUsageBadge } from '@/components/profile/ChatGPTUsageBadge';

interface ChatSettingsCardProps {
    classPolicyEnabled?: boolean;
    reasoningCapable: boolean;
    reasoningMandatory?: boolean;
    starting?: boolean;
    responseFormat: ResponseFormat;
    onResponseFormatChange: (value: ResponseFormat) => void;
    responseLength: ResponseLength;
    onResponseLengthChange: (value: ResponseLength) => void;
    reasoningEffort: ReasoningEffort;
    onReasoningChange: (value: ReasoningEffort) => void;
    onBack: () => void;
    onStart: () => void;
    // Scelta modalità (guidata vs chat libera), assorbita dalla scheda che prima
    // viveva in una schermata separata: la logica resta in page.tsx.
    showModeChoice?: boolean;
    experience?: 'standard' | 'opencode' | null;
    onExperienceChange?: (value: 'standard' | 'opencode') => void;
    rememberExperience?: boolean;
    onRememberChange?: (checked: boolean) => void;
}

export function ChatSettingsCard({
    reasoningCapable,
    reasoningMandatory = false,
    starting = false,
    responseFormat,
    onResponseFormatChange,
    responseLength,
    onResponseLengthChange,
    reasoningEffort,
    onReasoningChange,
    onBack,
    onStart,
    classPolicyEnabled = true,
    showModeChoice = false,
    experience = null,
    onExperienceChange,
    rememberExperience = false,
    onRememberChange,
}: ChatSettingsCardProps) {
    const { t, lang } = useI18n();
    const [subscription, setSubscription] = useState(false);
    const classSettings = useClassChatSettings(classPolicyEnabled);
    const { policy } = classSettings;
    const appliedPolicy = useRef<typeof policy>(null);
    useEffect(() => {
        if (!policy || appliedPolicy.current === policy) return;
        appliedPolicy.current = policy;
        if (policy.response_format || !policy.allow_student_response_format) onResponseFormatChange(policy.response_format ?? 'standard');
        if (policy.response_length || !policy.allow_student_response_length) onResponseLengthChange(policy.response_length ?? 'medium');
        if (policy.response_reasoning || !policy.allow_student_response_reasoning) onReasoningChange(policy.response_reasoning ?? 'standard');
    }, [policy, onResponseFormatChange, onResponseLengthChange, onReasoningChange]);

    return (
        <div className="mx-auto w-full max-w-md space-y-4">
            <ChatGPTUsageBadge onSubscription={setSubscription} />
            {classSettings.error && <div role="alert">{t('toast.error')} <Button variant="ghost" onClick={classSettings.retry}>{t('lp.retry')}</Button></div>}
            {onBack && <button type="button" onClick={onBack} className="min-h-11 text-sm text-slate-600">{t('nav.back')}</button>}
            <fieldset className="glass-panel space-y-4 p-5" data-testid="chat-settings">
                <legend className="px-1 font-semibold text-slate-800">{t('chatSettings.title')}</legend>

                {showModeChoice && (
                    <div className="space-y-2">
                        <div>
                            <p className="text-sm font-semibold text-slate-800">{t('experience.choose.title')}</p>
                            <p className="text-xs text-slate-500">{t('experience.choose.sub')}</p>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-2.5">
                            <Button
                                variant={experience === 'standard' ? 'primary' : 'secondary'}
                                aria-pressed={experience === 'standard'}
                                onClick={() => onExperienceChange?.('standard')}
                            >
                                <MessageSquare className="w-4 h-4" />
                                {t('guided.mode.guided')}
                            </Button>
                            <Button
                                variant={experience === 'opencode' ? 'primary' : 'secondary'}
                                disabled={subscription}
                                aria-pressed={experience === 'opencode'}
                                onClick={() => onExperienceChange?.('opencode')}
                            >
                                <Terminal className="w-4 h-4" />
                                {t('guided.mode.sandbox')}
                            </Button>
                        </div>
                        {onRememberChange && (
                            <label className="flex min-h-11 items-center gap-3 text-left text-sm text-slate-600">
                                <input type="checkbox" checked={rememberExperience} onChange={event => onRememberChange(event.target.checked)} className="h-4 w-4 accent-indigo-600" />
                                {t('experience.remember')}
                            </label>
                        )}
                    </div>
                )}

                <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500">{chatPreferenceLabel(lang, 'format')}</p>
                    <ResponseFormatSelector disabled={!classSettings.allowsFormat} value={policy?.allow_student_response_format === false ? policy.response_format ?? 'standard' : responseFormat} onChange={onResponseFormatChange} />
                </div>

                <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500">{t('responseLength.label')}</p>
                    <ResponseLengthSelector disabled={!classSettings.allowsLength} value={policy?.allow_student_response_length === false ? policy.response_length ?? 'medium' : responseLength} onChange={onResponseLengthChange} />
                </div>

                {reasoningCapable ? (
                    <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-500">{t('reasoning.label')}</p>
                        <ReasoningSelector disabled={!classSettings.allowsReasoning} value={policy?.allow_student_response_reasoning === false ? policy.response_reasoning ?? 'standard' : reasoningEffort} onChange={onReasoningChange} mandatory={reasoningMandatory} />
                        {reasoningMandatory && (
                            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                {t('reasoning.mandatory')}
                            </p>
                        )}
                    </div>
                ) : (
                    // Il Ragionamento non sparisce: la riga resta, spiegata, così
                    // l'assenza dipende dal counselor e non sembra un difetto.
                    <div className="space-y-1" aria-disabled="true" data-testid="reasoning-unavailable">
                        <p className="text-xs font-semibold text-slate-500">{t('reasoning.label')}</p>
                        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">{t('reasoning.unavailable')}</p>
                    </div>
                )}

                <div className="space-y-1 border-t border-slate-100 pt-3">
                    <p className="text-xs font-semibold text-slate-500">{t('audio.voice.title')}</p>
                    <AudioSendOption />
                    <AudioLanguageOption />
                </div>

                {subscription && showModeChoice && <p className="text-xs text-slate-600">{t('chatgpt.errors.unsupported')}</p>}
                <Button onClick={onStart} disabled={starting || (classPolicyEnabled && !policy) || (showModeChoice && !experience) || (subscription && experience === 'opencode')} className="w-full">{t('chatSettings.start')}</Button>
            </fieldset>
        </div>
    );
}
