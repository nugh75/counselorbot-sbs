import { useI18n } from '@/lib/i18n-context';
import { personalAPIText } from '@/lib/i18n-personal-api';
import type { PersonalSources } from '@/lib/personal-sources';

// The person's APIs and ChatGPT models as <option> groups (#200).
export function SourceOptions({ sources }: { sources: PersonalSources }) {
    const { lang } = useI18n();
    return <>
        {sources.api_enabled && sources.connections.length > 0 && <optgroup label={personalAPIText(lang, 'sourceApi')}>{sources.connections.map(c => <option key={c.id} value={`api:${c.id}`}>{c.name} · {c.model}</option>)}</optgroup>}
        {sources.chatgpt_enabled && sources.chatgpt_models.length > 0 && <optgroup label={personalAPIText(lang, 'sourceChatgpt')}>{sources.chatgpt_models.map(m => <option key={m.slug} value={`chatgpt:${m.slug}`}>{`ChatGPT · ${m.display_name}`}</option>)}</optgroup>}
    </>;
}
