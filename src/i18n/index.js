import { useMemo } from 'react';
import { translations } from './translations.js';
import { useAppState } from '../state.jsx';

// Shown in the Language dropdown (after "System"). `label` is written in that language.
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
];

export function resolveLanguage(pref) {
  if (pref && pref !== 'system') return translations[pref] ? pref : 'en';
  const system = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return translations[system] ? system : 'en';
}

export function makeT(lang) {
  return (key, vars) => {
    let text = translations[lang]?.[key] ?? translations.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
    return text;
  };
}

export function useT() {
  const { state } = useAppState();
  const lang = resolveLanguage(state.language);
  return useMemo(() => makeT(lang), [lang]);
}
