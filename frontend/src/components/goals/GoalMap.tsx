import type { PersonalGoal } from '@/lib/goals';

// Stub until Task 9 (desktop map, from 1024px). Props match the Task 9 interface exactly.
export function GoalMap({ goals, all, onOpen }: { goals: PersonalGoal[]; all: PersonalGoal[]; onOpen: (id: number) => void }) {
    void goals; void all; void onOpen;
    return null;
}
