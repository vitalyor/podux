import { useTranslation } from "react-i18next";
import { Card, Flex, Text, Badge, Button, Spinner, Callout, Table } from "@radix-ui/themes";
import { PageHeader } from "../../components/PageHeader";
// import { MainLayout } from "../../layouts/MainLayout";
import type { GithubRelease } from "./useVersion";

interface VersionViewProps {
  releases: GithubRelease[];
  loading: boolean;
  error: string | null;
}

export function VersionView({ releases, loading, error }: VersionViewProps) {
  const { t, i18n } = useTranslation();
  return (
    <>
      <Flex direction="column" gap="5">
        <PageHeader
          title={t("version.frpVersions")}
          description={t("version.description")}
          extra={loading ? <Spinner /> : undefined}
        />

        {error && (
          <Callout.Root color="red">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        {!loading && !error && releases.length > 0 && (
          <Card style={{ overflowX: "auto" }}>
            <Table.Root>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>{t("nav.version")}</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>{t("version.releaseDate")}</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>{t("version.download")}</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Github</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {releases.map((release) => (
                  <Table.Row key={release.tag_name} align="center">
                    <Table.Cell>
                      <Badge variant="surface" size="2">
                        {release.tag_name}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2">
                        {new Date(release.published_at).toLocaleDateString(i18n.language)}
                      </Text>
                    </Table.Cell>
                    <Table.Cell>
                      {release.download_url ? (
                        <Button
                          variant="soft"
                          size="1"
                          onClick={() => window.open(release.download_url)}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                          {t("version.downloadArch")}
                        </Button>
                      ) : (
                        <Text size="1" color="gray">
                          {t("version.notFound")}
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Button
                        variant="ghost"
                        size="1"
                        onClick={() => window.open(release.html_url)}
                      >
                        {t("version.viewGithub")}
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Card>
        )}

        {!loading && !error && releases.length === 0 && (
          <Text align="center" color="gray">
            {t("version.noReleases")}
          </Text>
        )}
      </Flex>
    </>
  );
}
