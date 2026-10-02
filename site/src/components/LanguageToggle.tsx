import { Select } from "@radix-ui/themes";
import { useLanguage } from "../contexts/LanguageContext";
import { useTranslation } from "react-i18next";
import { type Language } from "../lib/language";
interface LanguageToggleProps {
  language?: Language;
  onChange?: (lang: Language) => void;
}
export function LanguageToggle({ language: customLanguage, onChange }: LanguageToggleProps = {}) {
  const context = useLanguage();
  const { t } = useTranslation();
  return (
    <Select.Root value={customLanguage ?? context.language}
      onValueChange={(value) => (onChange ?? context.setLanguage)(value as Language)}>
      <Select.Trigger aria-label={t("settings.interfaceLanguage")} />
      <Select.Content>
        <Select.Item value="ru">Русский</Select.Item>
        <Select.Item value="en">English</Select.Item>
        <Select.Item value="zh">中文</Select.Item>
      </Select.Content>
    </Select.Root>
  );
}
