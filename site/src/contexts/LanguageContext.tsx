import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { getBrowserLanguage, isLanguage, type Language } from "../lib/language";

const USER_LANG_KEY = "user-language";


function readUserLanguage(): Language | null {
  try {
    const val = localStorage.getItem(USER_LANG_KEY);
    if (isLanguage(val)) return val;
  } catch {}
  return null;
}

interface LanguageContextType {
  language: Language;
  isManuallySet: boolean;
  setLanguage: (lang: Language) => void;
  resetToDefault: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  const [userLanguage, setUserLanguageState] = useState<Language | null>(readUserLanguage);

  const setUserLanguage = useCallback((lang: Language | null) => {
    setUserLanguageState(lang);
    try {
      if (lang === null) {
        localStorage.removeItem(USER_LANG_KEY);
      } else {
        localStorage.setItem(USER_LANG_KEY, lang);
      }
    } catch {}
  }, []);

  const language: Language = userLanguage ?? getBrowserLanguage();

  useEffect(() => {
    i18n.changeLanguage(language);
    document.documentElement.lang = language;
  }, [language, i18n]);

  const setLanguage = useCallback(
    (lang: Language) => {
      setUserLanguage(lang);
      i18n.changeLanguage(lang);
    },
    [i18n, setUserLanguage]
  );

  // 重置为浏览器默认语言（清除用户的手动设置）
  const resetToDefault = useCallback(() => {
    setUserLanguage(null);
    i18n.changeLanguage(getBrowserLanguage());
  }, [i18n, setUserLanguage]);

  return (
    <LanguageContext.Provider
      value={{
        language,
        isManuallySet: userLanguage !== null,
        setLanguage,
        resetToDefault,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
