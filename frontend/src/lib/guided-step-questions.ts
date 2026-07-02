export interface AdminGuidedStepQuestion {
    id: number;
    questionnaire_type: string;
    step_id: string;
    language: string;
    text: string;
    sort_order: number;
    is_active: boolean;
    created_at: string;
    updated_at: string | null;
}
