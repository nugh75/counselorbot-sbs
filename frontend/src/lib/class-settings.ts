export interface ClassTool {
    key: string;
    kind: 'instrument' | 'personal';
    category: 'assessment' | 'guided' | 'personal' | 'support' | 'always_on';
    label_key?: string;
    label_i18n: Record<string, string>;
    admin_enabled: boolean;
    enabled: boolean;
    always_on: boolean;
}

export interface ClassSettings {
    group_id: number;
    revision: number;
    disabled_tool_keys: string[];
    tools: ClassTool[];
}

export function parseClassSettings(payload: unknown): ClassSettings {
    const row = payload as ClassSettings | null;
    if (!row || !Number.isInteger(row.group_id) || !Number.isInteger(row.revision) || row.revision < 1
        || !Array.isArray(row.disabled_tool_keys) || !row.disabled_tool_keys.every(key => typeof key === 'string')
        || !Array.isArray(row.tools) || !row.tools.every(tool => tool && typeof tool.key === 'string'
            && typeof tool.admin_enabled === 'boolean' && typeof tool.enabled === 'boolean'
            && typeof tool.always_on === 'boolean' && tool.label_i18n && typeof tool.label_i18n === 'object')) {
        throw new Error('Invalid class settings');
    }
    return row;
}
