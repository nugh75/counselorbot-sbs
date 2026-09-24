'use client';

// Pagina unica dei settaggi della conversazione, nel flusso tra il Profilo e
// la chat. Stile della card di scelta percorso: una scheda, le opzioni come
// righe leggibili, un solo pulsante per procedere. Qui il Ragionamento non
// sparisce mai: se il counselor scelto non lo supporta la riga resta con la
// spiegazione, invece di farsi mancare senza spiegazioni.
import { Button } from '@/components/ui/Button';
import { ResponseFormatSelector } from '@/components/ui/ResponseFormatSelector';
import { ResponseLengthSelector, type ResponseLength } from '@/components/ui/ResponseLengthSelector';
import { ReasoningSelector, type ReasoningEffort } from '@/components/ui/ReasoningSelector';
import { AudioSendOption } from '@/components/ui/AudioSendOption';
import { AudioLanguageOption } from '@/components/ui/AudioLanguageOption';
import { MessageSquare, Terminal } from 'lucide-react';
import { chatPreferenceLabel, type ResponseFormat } from '@/lib/chat-preferences';
import { useI18n } from '@/lib/i18n-context';

interface ChatSettingsCardProps {
    reasoningCapable: boolean;
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
    starting = false,
    responseFormat,
    onResponseFormatChange,
    responseLength,
    onResponseLengthChange,
    reasoningEffort,
    onReasoningChange,
    onBack,
    onStart,
    showModeChoice = false,
    experience = null,
    onExperienceChange,
    rememberExperience = false,
    onRememberChange,
}: ChatSettingsCardProps) {
    const { t, lang } = useI18n();

    return (
        <div className="mx-auto w-full max-w-md space-y-4">
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
                    <ResponseFormatSelector value={responseFormat} onChange={onResponseFormatChange} />
                </div>

                <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-500">{t('responseLength.label')}</p>
                    <ResponseLengthSelector value={responseLength} onChange={onResponseLengthChange} />
                </div>

                {reasoningCapable ? (
                    <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-500">{t('reasoning.label')}</p>
                        <ReasoningSelector value={reasoningEffort} onChange={onReasoningChange} />
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

                <Button onClick={onStart} disabled={starting || (showModeChoice && !experience)} className="w-full">{t('chatSettings.start')}</Button>
            </fieldset>
        </div>
    );
}
