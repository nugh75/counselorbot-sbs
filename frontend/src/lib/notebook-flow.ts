export function shouldReviewNotebookBeforeInstrument(
    hasCompletedQuestionnaires: boolean,
    reviewedThisVisit: boolean,
): boolean {
    return !hasCompletedQuestionnaires && !reviewedThisVisit;
}
