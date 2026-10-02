import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zh from "./locales/zh.json";
import ru from "./locales/ru.json";
import { getInitialLanguage } from "./lib/language";

const initialLanguage = getInitialLanguage();

i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: {
      translation: en,
    },
    zh: {
      translation: zh,
    },
  },
  lng: initialLanguage,
  supportedLngs: ["ru", "en", "zh"],
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
