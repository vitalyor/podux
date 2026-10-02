import i18n from "../i18n";
export const formatBytes = (bytes: number): { value: number; unit: string } => {
  if (bytes === 0) return { value: 0, unit: "B" };
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return { value: bytes / Math.pow(k, i), unit: sizes[i] };
};

/** Relative time uses the selected locale, including Russian plural forms. */
export const getTimeAgo = (timestamp: string | Date | null | undefined): string => {
  if (!timestamp) return i18n.t("common.never");
  const elapsed = Math.max(0, Date.now() - new Date(timestamp).getTime());
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return i18n.t("common.justNow");
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 365 * 86400], ["month", 30 * 86400], ["day", 86400],
    ["hour", 3600], ["minute", 60],
  ];
  const [unit, seconds] = units.find(([, duration]) => elapsed >= duration * 1000)!;
  return new Intl.RelativeTimeFormat(i18n.language, { numeric: "always" })
    .format(-Math.floor(elapsed / (seconds * 1000)), unit);
};
