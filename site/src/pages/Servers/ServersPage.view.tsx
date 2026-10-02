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
import type { Server } from "./useServers";
import { ServerLatency } from "../../components/ServerLatency";
interface ServersViewProps {
  servers: Server[];
  loading?: boolean;
  refreshing: boolean;
  deleteServer: (id: string) => void;
  launchServer: (id: string) => void;
  terminateServer: (id: string) => void;
  search: string;
  setSearch: (value: string) => void;
  refreshServers: () => void;
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
}

export function ServersView({
  servers,
  loading,
  refreshing,
  deleteServer,
  launchServer,
  terminateServer,
  search,
  setSearch,
  refreshServers,
  page,
  setPage,
  totalPages,
}: ServersViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const changeConnection = async (server: Server) => {
    setBusy(server.id);
    try {
      await (server.bootStatus === "running"
        ? terminateServer(server.id)
        : launchServer(server.id));
    } finally {
      setBusy(null);
    }
  };
  const status = (server: Server) => (
    <Badge variant="soft" color={server.bootStatus === "running" ? "green" : "gray"}>
      {t(server.bootStatus === "running" ? "server.running" : "server.stopped")}
    </Badge>
  );
  const actions = (server: Server) => (
    <Flex gap="2" align="center">
      <Button
        size="1"
        variant="soft"
        color={server.bootStatus === "running" ? "gray" : undefined}
        disabled={busy !== null}
        onClick={() => changeConnection(server)}
      >
        {busy === server.id ? (
          <Spinner size="1" />
        ) : (
          <Icon icon={server.bootStatus === "running" ? "lucide:pause" : "lucide:play"} />
        )}
        {t(server.bootStatus === "running" ? "server.stop" : "server.launch")}
      </Button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            aria-label={`${t("ux.moreActions")}: ${server.serverName}`}
          >
            <Icon icon="lucide:ellipsis" width="18" />
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item onClick={() => navigate(`/servers/${server.id}`)}>
            {t("server.view")}
          </DropdownMenu.Item>
          <DropdownMenu.Item onClick={() => navigate(`/servers/${server.id}/edit`)}>
            {t("common.edit")}
          </DropdownMenu.Item>
          <DropdownMenu.Item onClick={() => navigate(`/servers/${server.id}/logs`)}>
            {t("server.viewLogs")}
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item color="red" onClick={() => setDeleteId(server.id)}>
            {t("common.delete")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </Flex>
  );
  return (
    <Flex direction="column" gap="5">
      <PageHeader
        title={t("server.title")}
        description={t("ux.connectionsListHint")}
        extra={
          <>
            <Button variant="soft" color="gray" onClick={() => navigate("/import")}>
              <Icon icon="lucide:file-input" />
              {t("nav.import")}
            </Button>
            <Button onClick={() => navigate("/servers/new")}>
              <Icon icon="lucide:plus" />
              {t("server.addServer")}
            </Button>
          </>
        }
      />
      <Card size="3">
        <div className="resource-toolbar">
          <TextField.Root
            aria-label={t("server.searchServers")}
            placeholder={t("server.searchServers")}
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
            <Text size="2" color="gray">
              {t("ux.onPage", { count: servers.length })}
            </Text>
            <IconButton
              variant="soft"
              color="gray"
              aria-label={t("server.refresh")}
              title={t("server.refresh")}
              disabled={refreshing}
              onClick={refreshServers}
            >
              <Icon icon="lucide:refresh-cw" className={refreshing ? "animate-spin" : ""} />
            </IconButton>
          </Flex>
        </div>
        {loading ? (
          <Flex justify="center" py="8">
            <Spinner size="3" />
          </Flex>
        ) : servers.length === 0 ? (
          <EmptyState
            title={search ? t("ux.noMatches") : t("server.noServers")}
            description={search ? t("ux.noMatchesHint") : t("server.addFirstServer")}
            actionText={search ? t("server.clearSearch") : t("server.addServer")}
            onAction={() => (search ? setSearch("") : navigate("/servers/new"))}
          />
        ) : (
          <>
            <div className="resource-desktop">
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>{t("common.name")}</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>{t("server.hostAddressLabel")}</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>{t("server.latency")}</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>{t("server.bootStatus")}</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>{t("common.actions")}</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {servers.map((server) => (
                    <Table.Row key={server.id} align="center">
                      <Table.Cell>
                        <Link
                          to={`/servers/${server.id}`}
                          style={{
                            color: "var(--accent-11)",
                            textDecoration: "none",
                            fontWeight: 500,
                          }}
                        >
                          {server.serverName}
                        </Link>
                      </Table.Cell>
                      <Table.Cell>
                        <CopyAddress value={`${server.serverAddr}:${server.serverPort}`} />
                      </Table.Cell>
                      <Table.Cell>
                        <ServerLatency networkStatus={server.networkStatus} />
                      </Table.Cell>
                      <Table.Cell>{status(server)}</Table.Cell>
                      <Table.Cell>{actions(server)}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </div>
            <div className="resource-mobile">
              {servers.map((server) => (
                <Card key={server.id}>
                  <Flex direction="column" gap="3">
                    <Flex justify="between" gap="2">
                      <Link
                        to={`/servers/${server.id}`}
                        style={{
                          color: "var(--accent-11)",
                          overflowWrap: "anywhere",
                          fontWeight: 500,
                        }}
                      >
                        {server.serverName}
                      </Link>
                      {status(server)}
                    </Flex>
                    <Text size="2">
                      <CopyAddress value={`${server.serverAddr}:${server.serverPort}`} />
                    </Text>
                    <Flex justify="between" align="center">
                      <ServerLatency networkStatus={server.networkStatus} />
                      {actions(server)}
                    </Flex>
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
          <AlertDialog.Title>{t("server.confirmDeletion")}</AlertDialog.Title>
          <AlertDialog.Description>{t("server.deleteConfirmMessage")}</AlertDialog.Description>
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
                  await deleteServer(deleteId);
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
