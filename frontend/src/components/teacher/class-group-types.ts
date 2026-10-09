export interface StudentGroup {
    id: number;
    code: string;
    name: string;
    school: string | null;
    school_level: string | null;
    institution_id: number | null;
    institution_name?: string | null;
    description: string | null;
    methodologies: string | null;
    context_visible_to_students: boolean;
    owner_username: string;
    is_active: boolean;
    members_count: number;
    created_at: string | null;
}

export function parseClassGroups(payload: unknown): StudentGroup[] {
    if (!Array.isArray(payload)) throw new Error('invalid groups');
    return payload as StudentGroup[];
}
