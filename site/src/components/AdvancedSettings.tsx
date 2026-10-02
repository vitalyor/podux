import type { ReactNode } from "react";
import { Icon } from "@iconify/react";
import { useTranslation } from "react-i18next";

export function AdvancedSettings({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <details className="advanced-settings">
      <summary>
        <span>
          <strong>{title || t("ux.advanced")}</strong>
          {description && <small>{description}</small>}
        </span>
        <Icon icon="lucide:chevron-down" width="18" />
      </summary>
      <div className="advanced-content">{children}</div>
    </details>
  );
}
