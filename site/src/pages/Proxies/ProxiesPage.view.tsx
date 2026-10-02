import {
  Badge,
  Button,
  Card,
  Flex,
  Table,
  Text,
  TextField,
  AlertDialog,
  DropdownMenu,
  IconButton,
  Spinner,
} from "@radix-ui/themes";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "@iconify/react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState } from "../../components/EmptyState";
import { CopyAddress } from "../../components/CopyAddress";
import { ListPagination } from "../../components/ListPagination";
import type { Proxy } from "./useProxies";
interface ProxiesViewProps {
  proxies: Proxy[];
  loading: boolean;
  refreshing: boolean;
  stats: {
    total: number;
    online: number;
    offline: number;
  };
  onDeleteProxy: (id: string) => Promise<void>;
  onToggleStatus: (proxy: Proxy) => Promise<void>;
  refreshProxies: () => void;
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  search: string;
  setSearch: (value: string) => void;
}

export function ProxiesView({
  proxies,
  loading,
  refreshing,
  stats,
  onDeleteProxy,
  onToggleStatus,
  refreshProxies,
  page,
  setPage,
  totalPages,
  search,
  setSearch,
}: ProxiesViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const target = (proxy: Proxy) =>
    ["http", "https"].includes(proxy.proxyType)
      ? proxy.customDomains?.filter(Boolean).join(", ") || proxy.subdomain || "—"
      : String(proxy.remotePort || "—");
  const status = (proxy: Proxy) => (
    <Badge
      variant="soft"
      color={
        proxy.status === "disabled" ? "gray" : proxy.bootStatus === "online" ? "green" : "gray"
      }
    >
      {t(
        proxy.status === "disabled"
          ? "proxy.disabled"
          : proxy.bootStatus === "online"
            ? "proxy.online"
            : "proxy.offline"
      )}
    </Badge>
  );
  const actions = (proxy: Proxy) => (
    <Flex gap="2" align="center">
      <Button
        size="1"
        variant="soft"
        color={proxy.status === "enabled" ? "gray" : undefined}
        disabled={busy !== null}
        onClick={async () => {
          setBusy(proxy.id);
          try {
            await onToggleStatus(proxy);
          } finally {
            setBusy(null);
          }
        }}
      >
        {busy === proxy.id ? (
          <Spinner size="1" />
        ) : (
          <Icon icon={proxy.status === "enabled" ? "lucide:pause" : "lucide:play"} />
        )}
        {t(proxy.status === "enabled" ? "proxy.disable" : "proxy.enable")}
      </Button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            aria-label={`${t("ux.moreActions")}: ${proxy.name}`}
          >
            <Icon icon="lucide:ellipsis" />
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item onClick={() => navigate(`/proxies/${proxy.id}/edit`)}>
            {t("common.edit")}
          </DropdownMenu.Item>
          <DropdownMenu.Item onClick={() => navigate(`/servers/${proxy.serverId}`)}>
            {t("server.view")}
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item color="red" onClick={() => setDeleteId(proxy.id)}>
            {t("common.delete")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </Flex>
  );
  return (
    <Flex direction="column" gap="5">
      <PageHeader
        title={t("proxy.title")}
        description={t("proxy.manageProxies")}
        extra={
          <>
            <Button variant="soft" color="gray" onClick={() => navigate("/import")}>
              <Icon icon="lucide:file-input" />
              {t("nav.import")}
            </Button>
            <Button onClick={() => navigate("/proxies/new")}>
              <Icon icon="lucide:plus" />
              {t("proxy.addProxy")}
            </Button>
          </>
        }
      />
      <Card size="3">
        <div className="resource-toolbar">
          <TextField.Root
            aria-label={t("proxy.searchProxies")}
            placeholder={t("proxy.searchProxies")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          >
            <TextField.Slot>
              <Icon icon="lucide:search" />
            </TextField.Slot>
            {search && (
              <TextField.Slot>
                <IconButton
                  size="1"
                  variant="ghost"
                  aria-label={t("server.clearSearch")}
                  onClick={() => setSearch("")}
                >
                  <Icon icon="lucide:x" />
                </IconButton>
              </TextField.Slot>
            )}
          </TextField.Root>
          <Flex gap="3" align="center">
            <Badge color="green" variant="soft">
              {t("proxy.online")}: {stats.online}
            </Badge>
            <Text size="2" color="gray">
              {t("proxy.totalProxies")}: {stats.total}
            </Text>
            <IconButton
              variant="soft"
              color="gray"
              aria-label={t("proxy.refresh")}
              title={t("proxy.refresh")}
              disabled={refreshing}
              onClick={refreshProxies}
            >
              <Icon icon="lucide:refresh-cw" className={refreshing ? "animate-spin" : ""} />
            </IconButton>
          </Flex>
        </div>
        {loading ? (
          <Flex justify="center" py="8">
            <Spinner size="3" />
          </Flex>
        ) : proxies.length === 0 ? (
          <EmptyState
            title={search ? t("ux.noMatches") : t("proxy.noProxies")}
            description={search ? t("ux.noMatchesHint") : t("proxy.addFirstProxy")}
            actionText={search ? t("server.clearSearch") : t("proxy.addProxy")}
            onAction={() => (search ? setSearch("") : navigate("/proxies/new"))}
          />
        ) : (
          <>
            <div className="resource-desktop">
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>{t("common.name")}</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>{t("ux.source")}</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>{t("ux.destination")}</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>{t("common.status")}</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>{t("common.actions")}</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {proxies.map((proxy) => (
                    <Table.Row key={proxy.id} align="center">
                      <Table.Cell>
                        <Flex direction="column" gap="1">
                          <Link
                            to={`/proxies/${proxy.id}/edit`}
                            style={{
                              color: "var(--accent-11)",
                              fontWeight: 500,
                              textDecoration: "none",
                            }}
                          >
                            {proxy.name}
                          </Link>
                          <Flex gap="2" align="center">
                            <Badge color="gray" variant="surface">
                              {proxy.proxyType.toUpperCase()}
                            </Badge>
                            <Link
                              to={`/servers/${proxy.serverId}`}
                              style={{ color: "var(--gray-11)", fontSize: 12 }}
                            >
                              {proxy.expand?.serverId?.serverName || "—"}
                            </Link>
                          </Flex>
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>
                        {proxy.plugin?.type === "socks5" ? (
                          "SOCKS5"
                        ) : (
                          <CopyAddress
                            value={`${proxy.localIP || "127.0.0.1"}:${proxy.localPort || "—"}`}
                          />
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <CopyAddress value={target(proxy)} />
                      </Table.Cell>
                      <Table.Cell>{status(proxy)}</Table.Cell>
                      <Table.Cell>{actions(proxy)}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </div>
            <div className="resource-mobile">
              {proxies.map((proxy) => (
                <Card key={proxy.id}>
                  <Flex direction="column" gap="3">
                    <Flex justify="between" gap="2">
                      <Link
                        to={`/proxies/${proxy.id}/edit`}
                        style={{ color: "var(--accent-11)", fontWeight: 500 }}
                      >
                        {proxy.name}
                      </Link>
                      {status(proxy)}
                    </Flex>
                    <Text size="1" color="gray">
                      {proxy.proxyType.toUpperCase()} · {proxy.expand?.serverId?.serverName || "—"}
                    </Text>
                    <Text size="2">
                      <CopyAddress
                        value={`${proxy.localIP || "127.0.0.1"}:${proxy.localPort || "—"}`}
                      />
                    </Text>
                    <Flex gap="2" align="center">
                      <Icon icon="lucide:arrow-right" />
                      <CopyAddress value={target(proxy)} />
                    </Flex>
                    <Flex justify="end">{actions(proxy)}</Flex>
                  </Flex>
                </Card>
              ))}
            </div>
            <ListPagination page={page} totalPages={totalPages} setPage={setPage} />
          </>
        )}
      </Card>
      <AlertDialog.Root open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialog.Content maxWidth="440px">
          <AlertDialog.Title>{t("proxy.confirmDeletion")}</AlertDialog.Title>
          <AlertDialog.Description>{t("proxy.deleteConfirmMessage")}</AlertDialog.Description>
          <Flex justify="end" gap="3" mt="4">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                {t("common.cancel")}
              </Button>
            </AlertDialog.Cancel>
            <Button
              color="red"
              disabled={busy !== null}
              onClick={async () => {
                if (!deleteId) return;
                setBusy(deleteId);
                try {
                  await onDeleteProxy(deleteId);
                  setDeleteId(null);
                } finally {
                  setBusy(null);
                }
              }}
            >
              {t("common.delete")}
            </Button>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Flex>
  );
}
