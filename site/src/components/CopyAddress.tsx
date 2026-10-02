import { Icon } from "@iconify/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
export function CopyAddress({ value }: { value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy-address"
      title={t("common.clickToCopy")}
      aria-label={`${t("common.clickToCopy")}: ${value}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error(t("ux.copyFailed"));
        }
      }}
    >
      <span style={{ fontFamily: "var(--code-font-family)", overflowWrap: "anywhere" }}>
        {value}
      </span>
      <Icon
        icon={copied ? "lucide:check" : "lucide:copy"}
        width="13"
        style={{ color: copied ? "var(--green-11)" : "var(--gray-9)", flexShrink: 0 }}
      />
    </button>
  );
}
