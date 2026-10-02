import i18n from "../../i18n";
import { useState, useEffect } from "react";
import { apiGet } from "../../lib/api";

export interface GithubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  download_url: string;
}

export function useVersion() {
  const [releases, setReleases] = useState<GithubRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReleases() {
      try {
        setLoading(true);
        const response = await apiGet("/api/github/frp/releases");
        if (!response.ok) {
          throw new Error("Failed to fetch releases");
        }
        const data = await response.json();
        setReleases(data);
      } catch {
        setError(i18n.t("version.loadFailed"));
      } finally {
        setLoading(false);
      }
    }

    fetchReleases();
  }, []);

  return {
    releases,
    loading,
    error,
  };
}
