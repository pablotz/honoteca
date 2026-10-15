export function detectLanguage(languages = []) {
  for (const tag of languages) {
    const language = String(tag).toLowerCase().split(/[-_]/)[0];
    if (language === 'es' || language === 'en') return language;
  }
  return 'en';
}

export const language = detectLanguage(
  globalThis.navigator?.languages?.length
    ? globalThis.navigator.languages
    : [globalThis.navigator?.language || 'en'],
);

// Interface text only; book titles, publishers and synopses keep their edition language.
export const t = (spanish, english, locale = language) => locale === 'es' ? spanish : english;
