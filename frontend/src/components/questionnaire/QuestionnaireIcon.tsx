'use client';

import {
    BarChart3,
    Briefcase,
    ClipboardList,
    Clock,
    Compass,
    Lightbulb,
    Target,
    type LucideIcon,
} from 'lucide-react';
import type { QuestionnaireConfig } from '@/lib/questionnaires';

const ICONS: Record<QuestionnaireConfig['icon'], LucideIcon> = {
    chart: BarChart3,
    clipboard: ClipboardList,
    target: Target,
    lightbulb: Lightbulb,
    clock: Clock,
    compass: Compass,
    briefcase: Briefcase,
};

interface QuestionnaireIconProps {
    icon: QuestionnaireConfig['icon'];
    className?: string;
}

export function QuestionnaireIcon({ icon, className }: QuestionnaireIconProps) {
    const Icon = ICONS[icon];
    return <Icon className={className} aria-hidden="true" />;
}
