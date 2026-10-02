export const languages = ["ru", "en", "zh"] as const;
export type Language = (typeof languages)[number];
export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && languages.includes(value as Language);
}
export function getBrowserLanguage(): Language {
  const lang = navigator.language.toLowerCase().split("-")[0];
  return isLanguage(lang) ? lang : "en";
}
export function getInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem("user-language");
    if (isLanguage(saved)) return saved;
  } catch { /* Storage may be unavailable in private mode. */ }
  return getBrowserLanguage();
}
