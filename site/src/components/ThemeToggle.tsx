import { Icon } from "@iconify/react";
import { IconButton } from "@radix-ui/themes";
import { useTranslation } from "react-i18next";
import { useTheme } from "../contexts/ThemeContext";
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  return (
    <IconButton
      size="2"
      variant="ghost"
      color="gray"
      onClick={toggleTheme}
      aria-label={t("ux.toggleTheme")}
      title={t("ux.toggleTheme")}
    >
      <Icon icon={theme === "light" ? "lucide:sun" : "lucide:moon"} width="18" />
    </IconButton>
  );
}
