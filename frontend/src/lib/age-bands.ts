// Fasce di età condivise: un'unica scala granulare per il questionario di
// gradimento (survey_responses.eta) e per la somministrazione degli strumenti
// (validation_responses.response_metadata.age_range). I valori sono stringhe
// libere: non introdurre scale parallele.
export const AGE_BANDS = ['< 14', '14-16', '17-18', '19-24', '25-34', '35-44', '45-54', '55+'] as const;
