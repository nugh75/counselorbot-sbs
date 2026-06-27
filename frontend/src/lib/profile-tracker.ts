import { QUESTIONNAIRES } from './questionnaires';

const STORAGE_KEY = 'counselorbot_completed_profiles';

interface CompletedProfile {
  questionnaireType: string;
  sessionId: string;
  completedAt: string;
  scores: Record<string, number>;
}

export function addCompletedProfile(
  type: string,
  sessionId: string,
  scores: Record<string, number>,
): void {
  const profiles = getCompletedProfiles();
  const existing = profiles.findIndex((p) => p.questionnaireType === type);
  const entry: CompletedProfile = {
    questionnaireType: type,
    sessionId,
    completedAt: new Date().toISOString(),
    scores,
  };
  if (existing >= 0) {
    profiles[existing] = entry;
  } else {
    profiles.push(entry);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function getCompletedProfiles(): CompletedProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function hasCompletedAll(): boolean {
  const profiles = getCompletedProfiles();
  const types = new Set(profiles.map((p) => p.questionnaireType));
  const hasQSA = types.has('QSA') || types.has('QSAr');
  const hasZTPI = types.has('ZTPI');
  const hasSavickas = types.has('SAVICKAS');
  return hasQSA && hasZTPI && hasSavickas;
}

export function getCombinedScoresContext(): string {
  const profiles = getCompletedProfiles();
  const parts: string[] = [];

  for (const profile of profiles) {
    const type = profile.questionnaireType;
    if (type === 'SAVICKAS') {
      parts.push(
        'PROFILO SAVICKAS:\nPercorso narrativo qualitativo completato.',
      );
      continue;
    }

    const q = QUESTIONNAIRES[type as keyof typeof QUESTIONNAIRES];
    if (!q) continue;

    const label = type === 'QSAr' ? 'QSAr' : type;
    const lines: string[] = [`PROFILO ${label}:`];

    for (const prefix of q.factorPrefix) {
      const factors = Object.entries(profile.scores)
        .filter(([k]) => k.startsWith(prefix))
        .sort(([a], [b]) => a.localeCompare(b));

      for (const [code, value] of factors) {
        const name = q.factors.find((f) => f.code === code)?.name || code;
        lines.push(`- ${code} (${name}): ${value}/9`);
      }
    }

    parts.push(lines.join('\n'));
  }

  return parts.join('\n\n');
}

export function clearCompletedProfiles(): void {
  localStorage.removeItem(STORAGE_KEY);
}
