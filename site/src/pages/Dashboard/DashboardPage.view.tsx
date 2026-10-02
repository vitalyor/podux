import { Box, Card, Flex, Text, Button, Badge, Spinner } from "@radix-ui/themes";
import type {
  DashboardStats,
  RecentActivity,
  TopologyData,
  TrafficHistoryPoint,
} from "./useDashboard";
import { TopologyChart } from "./TopologyChart";
import { Icon } from "@iconify/react";
import { PageHeader } from "../../components/PageHeader";
import { AdvancedSettings } from "../../components/AdvancedSettings";
import { StatCard } from "../../components/StatCard";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
interface DashboardViewProps {
  stats: DashboardStats;
  activities: RecentActivity[];
  trafficHistory: TrafficHistoryPoint[];
  topology: TopologyData;
  loading: boolean;
}

function formatUptime(seconds: number, locale: string): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return locale === "ru"
      ? `${days} д. ${hours} ч. ${minutes} мин.`
      : `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return locale === "ru" ? `${hours} ч. ${minutes} мин.` : `${hours}h ${minutes}m`;
  } else {
    return locale === "ru" ? `${minutes} мин.` : `${minutes}m`;
  }
}

export function DashboardView({ stats, topology, loading }: DashboardViewProps) {
  const { t, i18n } = useTranslation();
  return (
    <Flex direction="column" gap="5">
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.overview")}
        extra={
          <Button asChild>
            <Link to={stats.totalServers === 0 ? "/servers/new" : "/proxies/new"}>
              <Icon icon="lucide:plus" />
              {t(stats.totalServers === 0 ? "server.addServer" : "proxy.addProxy")}
            </Link>
          </Button>
        }
      />
      {loading ? (
        <Flex justify="center" py="8">
          <Spinner size="3" />
        </Flex>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              title={t("dashboard.runningProxies")}
              value={
                <>
                  {stats.runningProxies}
                  <Text size="2" color="gray" ml="2">
                    / {stats.totalProxies}
                  </Text>
                </>
              }
              color="green"
              icon={<Icon icon="lucide:network" width="24" />}
            />
            <StatCard
              title={t("dashboard.onlineServers")}
              value={
                <>
                  {stats.onlineServers}
                  <Text size="2" color="gray" ml="2">
                    / {stats.totalServers}
                  </Text>
                </>
              }
              color="blue"
              icon={<Icon icon="lucide:server" width="24" />}
            />
            <StatCard
              title={t("dashboard.maxLatency")}
              value={
                <>
                  {stats.maxLatency}
                  <Text size="2" color="gray" ml="2">
                    {t("common.ms")}
                  </Text>
                </>
              }
              color="gray"
              icon={<Icon icon="lucide:activity" width="24" />}
            />
          </div>
          {stats.totalServers === 0 || stats.totalProxies === 0 ? (
            <Card size="3">
              <Flex gap="4" align="start">
                <Box
                  style={{
                    padding: 12,
                    background: "var(--accent-a3)",
                    borderRadius: "var(--radius-3)",
                    color: "var(--accent-11)",
                  }}
                >
                  <Icon icon="lucide:route" width="24" />
                </Box>
                <Flex direction="column" gap="3">
                  <Text size="4" weight="bold">
                    {t(stats.totalServers === 0 ? "ux.startHere" : "proxy.addFirstProxy")}
                  </Text>
                  <Text size="2" color="gray">
                    {t("ux.startHereHint")}
                  </Text>
                  <Flex gap="2" wrap="wrap">
                    <Button asChild>
                      <Link to={stats.totalServers === 0 ? "/servers/new" : "/proxies/new"}>
                        {t(stats.totalServers === 0 ? "server.addServer" : "proxy.addProxy")}
                        <Icon icon="lucide:arrow-right" />
                      </Link>
                    </Button>
                    <Button asChild variant="soft" color="gray">
                      <Link to="/import">{t("nav.import")}</Link>
                    </Button>
                  </Flex>
                </Flex>
              </Flex>
            </Card>
          ) : (
            <Card size="3">
              <Flex direction="column" gap="3">
                <Text size="3" weight="bold">
                  {t("dashboard.topology")}
                </Text>
                <TopologyChart topology={topology} />
              </Flex>
            </Card>
          )}
          <Flex gap="2" wrap="wrap">
            <Button asChild variant="soft" color="gray">
              <Link to="/servers">
                <Icon icon="lucide:server" />
                {t("nav.servers")}
              </Link>
            </Button>
            <Button asChild variant="soft" color="gray">
              <Link to="/proxies">
                <Icon icon="lucide:network" />
                {t("nav.proxies")}
              </Link>
            </Button>
          </Flex>
          <AdvancedSettings title={t("ux.viewDetails")} description={t("ux.diagnosticsHint")}>
            <Flex direction="column" gap="4">
              {stats.totalProxies === 0 && stats.totalServers > 0 && (
                <TopologyChart topology={topology} />
              )}
              <Text size="2" color="gray">
                {t("dashboard.proxyTypeDistribution")}
              </Text>
              <Flex gap="2" wrap="wrap">
                {Object.entries(stats.proxyTypeCounts).map(([type, count]) => (
                  <Badge key={type} color="gray" variant="surface">
                    {type.toUpperCase()}: {count}
                  </Badge>
                ))}
              </Flex>
            </Flex>
          </AdvancedSettings>
          <Flex justify="end" align="center" gap="2" pt="3"
            style={{ borderTop: "1px solid var(--gray-a5)" }}>
            <Icon icon="lucide:clock" width="14" aria-hidden="true"
              style={{ color: "var(--gray-9)", flexShrink: 0 }} />
            <Text size="1" color="gray">
              {t("dashboard.systemUptime")}
              <Text ml="2" weight="medium" style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatUptime(stats.uptimeSeconds, i18n.language)}
              </Text>
            </Text>
          </Flex>
        </>
      )}
    </Flex>
  );
}
