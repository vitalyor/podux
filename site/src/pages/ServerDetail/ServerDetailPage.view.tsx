import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Card,
  Flex,
  Text,
  Badge,
  Grid,
  Button,
  Heading,
  Box,
  Table,
  AlertDialog,
} from "@radix-ui/themes";
import { Icon } from "@iconify/react";
import { CopyAddress } from "../../components/CopyAddress";
import { AdvancedSettings } from "../../components/AdvancedSettings";
import { PageHeader } from "../../components/PageHeader";
import { Loading } from "../../components/Loading";
import pb from "../../lib/pocketbase";
import type { Server } from "../Servers/useServers";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { ServerLocation } from "../../components/ServerLocation";
import { ProbeHistory } from "../../components/ProbeHistory";
import { LatencyChart } from "../../components/LatencyChart";
import { ServerLogViewer } from "../../components/ServerLogViewer";
import { useTranslation } from "react-i18next";
import { useServerProxies } from "./useServerProxies";
import { apiPost } from "../../lib/api";

export function ServerDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [server, setServer] = useState<Server | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [deleteProxyId, setDeleteProxyId] = useState<string | null>(null);
  const { proxies, togglingId, toggleStatus, deleteProxy, refreshing, refresh } =
    useServerProxies(id);

  useEffect(() => {
    // Wait for PageTransition to complete before triggering animations
    const timer = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const [actionLoading, setActionLoading] = useState(false);

  const fetchServer = useCallback(
    async (showLoading = true) => {
      if (!id) return;
      try {
        if (showLoading) setLoading(true);
        const record = await pb.collection("fh_servers").getOne<Server>(id);
        setServer(record);
      } catch (err: unknown) {
        const failure = err as { isAbort?: boolean; message?: string };
        if (failure.isAbort) return;
        console.error("Failed to load server details:", err);
        setError(failure.message || t("server.failedToLoad"));
        toast.error(t("server.failedToLoad"));
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [id, t]
  );

  useEffect(() => {
    fetchServer();
  }, [fetchServer]);

  const handleStart = async () => {
    if (!id) return;
    try {
      setActionLoading(true);
      const response = await apiPost("/api/frpc/launch", { id });
      if (response.ok) {
        toast.success(t("server.startSuccess"));
        fetchServer(false);
      } else {
        toast.error(t("server.startFailed"));
      }
    } catch {
      toast.error(t("server.startFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    if (!id) return;
    try {
      setActionLoading(true);
      const response = await apiPost("/api/frpc/terminate", { id });
      if (response.ok) {
        toast.success(t("server.stopSuccess"));
        fetchServer(false);
      } else {
        toast.error(t("server.stopFailed"));
      }
    } catch {
      toast.error(t("server.stopFailed"));
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "running":
        return "green";
      case "stopped":
        return "red";
      default:
        return "gray";
    }
  };

  if (loading) {
    return (
      <Flex justify="center" align="center" style={{ height: "100%" }}>
        <Loading />
      </Flex>
    );
  }

  if (error) {
    return (
      <Flex direction="column" justify="center" align="center" style={{ height: "100%" }} gap="4">
        <Icon icon="lucide:alert-circle" width="48" height="48" color="var(--red-9)" />
        <Heading size="4" color="red">
          {t("server.failedToLoad")}
        </Heading>
        <Text color="gray">{error}</Text>
        <Button variant="soft" onClick={() => navigate("/servers")}>
          {t("server.backToServers")}
        </Button>
      </Flex>
    );
  }

  if (!server) return null;

  return (
    <Flex direction="column" gap="5" className="flex-1">
      {/* Header */}
      <PageHeader
        title={server.serverName}
        description={`${server.serverAddr}:${server.serverPort}`}
        visible={mounted}
        extra={
          <Flex gap="2" align="center" wrap="wrap">
            <Button variant="soft" color="gray" onClick={() => navigate(`/servers/${id}/edit`)}>
              {t("common.edit")}
            </Button>
            <Button variant="soft" color="gray" onClick={() => navigate(`/servers/${id}/logs`)}>
              {t("server.viewLogs")}
            </Button>
            <Button variant="soft" color="gray" onClick={() => navigate("/servers")}>
              <Icon icon="lucide:arrow-left" width="16" height="16" />
              {t("server.backToServers")}
            </Button>
            {server.bootStatus === "running" ? (
              <Button
                size="2"
                color="red"
                variant="soft"
                onClick={handleStop}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <Icon icon="lucide:loader-2" className="animate-spin" />
                ) : (
                  <Icon icon="lucide:square" width="16" height="16" />
                )}
                {t("server.stop")}
              </Button>
            ) : (
              <Button
                size="2"
                color="green"
                variant="soft"
                onClick={handleStart}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <Icon icon="lucide:loader-2" className="animate-spin" />
                ) : (
                  <Icon icon="lucide:play" width="16" height="16" />
                )}
                {t("server.start")}
              </Button>
            )}
          </Flex>
        }
      />
      {/*<motion.div*/}
      {/*  initial={{ opacity: 0, y: -20 }}*/}
      {/*  animate={mounted ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}*/}
      {/*  transition={{ duration: 0.5, ease: "easeOut" }}*/}
      {/*>*/}
      {/*  <Flex justify="end" align="center">*/}
      {/*    <motion.div*/}
      {/*      whileHover={{ scale: 1.05 }}*/}
      {/*      whileTap={{ scale: 0.95 }}*/}
      {/*    >*/}
      {/*      <Button variant="soft" onClick={() => navigate("/servers")}>*/}
      {/*        <Icon icon="lucide:arrow-left" width="16" height="16" />*/}
      {/*        Back to Servers*/}
      {/*      </Button>*/}
      {/*    </motion.div>*/}
      {/*  </Flex>*/}
      {/*</motion.div>*/}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={mounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
      >
        <Card size="3">
          <Flex justify="between" align="center" mb="4" gap="3" wrap="wrap">
            <Heading size="4">{t("proxy.title")}</Heading>
            <Flex gap="2">
              <Button size="1" variant="soft" onClick={refresh} disabled={refreshing}>
                <Icon
                  icon="lucide:refresh-cw"
                  width="14"
                  height="14"
                  className={refreshing ? "animate-spin" : ""}
                />
                {t("proxy.refresh")}
              </Button>
              <Button size="1" onClick={() => navigate(`/proxies/new?serverId=${id}`)}>
                <Icon icon="lucide:plus" width="14" height="14" />
                {t("proxy.addProxy")}
              </Button>
            </Flex>
          </Flex>

          {proxies.length === 0 ? (
            <Flex direction="column" align="center" gap="2" py="6">
              <Icon icon="lucide:network" width="32" height="32" color="var(--gray-8)" />
              <Text size="2" color="gray">
                {t("proxy.noProxies")}
              </Text>
            </Flex>
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
                            <Text weight="medium">{proxy.name}</Text>
                            <Text size="1" color="gray">
                              {proxy.proxyType.toUpperCase()}
                            </Text>
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
                          <CopyAddress
                            value={
                              proxy.customDomains?.filter(Boolean).join(", ") ||
                              proxy.subdomain ||
                              String(proxy.remotePort || "—")
                            }
                          />
                        </Table.Cell>
                        <Table.Cell>
                          <Badge
                            color={
                              proxy.status === "disabled"
                                ? "gray"
                                : proxy.bootStatus === "online"
                                  ? "green"
                                  : "gray"
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
                        </Table.Cell>
                        <Table.Cell>
                          <Flex gap="2">
                            <Button
                              size="1"
                              variant="soft"
                              color="gray"
                              disabled={togglingId !== null}
                              onClick={() => toggleStatus(proxy)}
                            >
                              {t(proxy.status === "enabled" ? "proxy.disable" : "proxy.enable")}
                            </Button>
                            <Button
                              size="1"
                              variant="soft"
                              onClick={() => navigate(`/proxies/${proxy.id}/edit`)}
                            >
                              {t("common.edit")}
                            </Button>
                            <Button
                              size="1"
                              variant="ghost"
                              color="red"
                              aria-label={t("common.delete")}
                              onClick={() => setDeleteProxyId(proxy.id)}
                            >
                              <Icon icon="lucide:trash" />
                            </Button>
                          </Flex>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              </div>
              <div className="resource-mobile">
                {proxies.map((proxy) => (
                  <Card key={proxy.id}>
                    <Flex direction="column" gap="3">
                      <Flex justify="between">
                        <Text weight="medium">{proxy.name}</Text>
                        <Badge
                          color={
                            proxy.status === "disabled"
                              ? "gray"
                              : proxy.bootStatus === "online"
                                ? "green"
                                : "gray"
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
                      </Flex>
                      <Text size="2">
                        <CopyAddress
                          value={`${proxy.localIP || "127.0.0.1"}:${proxy.localPort || "—"}`}
                        />
                      </Text>
                      <Text size="2">
                        →{" "}
                        {proxy.customDomains?.join(", ") ||
                          proxy.subdomain ||
                          proxy.remotePort ||
                          "—"}
                      </Text>
                      <Flex gap="2" wrap="wrap">
                        <Button
                          size="1"
                          variant="soft"
                          color="gray"
                          disabled={togglingId !== null}
                          onClick={() => toggleStatus(proxy)}
                        >
                          {t(proxy.status === "enabled" ? "proxy.disable" : "proxy.enable")}
                        </Button>
                        <Button
                          size="1"
                          variant="soft"
                          onClick={() => navigate(`/proxies/${proxy.id}/edit`)}
                        >
                          {t("common.edit")}
                        </Button>
                        <Button
                          size="1"
                          color="red"
                          variant="ghost"
                          aria-label={t("common.delete")}
                          onClick={() => setDeleteProxyId(proxy.id)}
                        >
                          <Icon icon="lucide:trash" />
                        </Button>
                      </Flex>
                    </Flex>
                  </Card>
                ))}
              </div>
            </>
          )}
        </Card>
      </motion.div>
      <AdvancedSettings title={t("ux.viewDetails")} description={t("ux.diagnosticsHint")}>
        {" "}
        <Grid columns={{ initial: "1", md: "2" }} gap="4">
          {/* Basic Info Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={mounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.5, delay: 0.1, ease: "easeOut" }}
          >
            <Card size="3">
              <Flex direction="column" gap="4">
                <Heading size="4">{t("server.basicInformation")}</Heading>

                <Grid columns={{ initial: "1", md: "2" }} gap="4">
                  <Box>
                    <Text size="2" color="gray">
                      {t("server.hostAddress")}
                    </Text>
                    <Text as="div" size="3" weight="medium">
                      {server.serverAddr}
                    </Text>
                  </Box>
                  <Box>
                    <Text size="2" color="gray">
                      {t("server.port")}
                    </Text>
                    <Text as="div" size="3" weight="medium">
                      {server.serverPort}
                    </Text>
                  </Box>
                  {server.user && (
                    <Box>
                      <Text size="2" color="gray">
                        {t("server.user")}
                      </Text>
                      <Text as="div" size="3" weight="medium">
                        {server.user}
                      </Text>
                    </Box>
                  )}

                  <Box>
                    <Text size="2" color="gray">
                      {t("server.location")}
                    </Text>
                    <Box mt="1">
                      <ServerLocation geoLocation={server.geoLocation} size="3" />
                    </Box>
                  </Box>
                  <Box>
                    <Text size="2" color="gray">
                      {t("common.status")}
                    </Text>
                    <Flex align="center" gap="2" mt="1">
                      <Badge
                        radius="full"
                        color={getStatusColor(server.bootStatus)}
                        variant="soft"
                        className={`animate-status-appear ${
                          server.bootStatus === "running"
                            ? "animate-status-pulse"
                            : server.bootStatus === "stopped"
                              ? "animate-status-fade"
                              : ""
                        }`}
                      >
                        <span
                          className={`status-dot ${
                            server.bootStatus === "running"
                              ? "status-dot-green"
                              : server.bootStatus === "stopped"
                                ? "status-dot-red"
                                : "status-dot-gray"
                          }`}
                        />
                        {server.bootStatus === "running"
                          ? t("server.running")
                          : server.bootStatus === "stopped"
                            ? t("server.stopped")
                            : t("common.status")}
                      </Badge>
                    </Flex>
                  </Box>
                  <Box>
                    <Text size="2" color="gray">
                      {t("server.protocol")}
                    </Text>
                    <Text as="div" size="3" weight="medium" style={{ textTransform: "uppercase" }}>
                      {server.transport?.protocol || "TCP"}
                    </Text>
                  </Box>
                  <Box>
                    <Text size="2" color="gray">
                      {t("server.createdAt")}
                    </Text>
                    <Text as="div" size="3">
                      {new Date(server.created).toLocaleString()}
                    </Text>
                  </Box>
                  <Box>
                    <Text size="2" color="gray">
                      {t("server.lastUpdated")}
                    </Text>
                    <Text as="div" size="3">
                      {new Date(server.updated).toLocaleString()}
                    </Text>
                  </Box>
                </Grid>
              </Flex>
            </Card>
          </motion.div>

          {/* Configuration Summary or Other Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={mounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
          >
            <Card size="3" style={{ height: "100%" }}>
              <Flex direction="column" gap="4">
                <Heading size="4">{t("server.configuration")}</Heading>
                <Box>
                  <Text size="2" color="gray">
                    {t("common.description")}
                  </Text>
                  <Text as="div" size="3">
                    {server.description || t("server.noDescription")}
                  </Text>
                </Box>

                {server.transport?.tls?.enable && (
                  <Flex align="center" gap="2">
                    <Text size="2" color="gray">
                      {t("server.tls")}
                    </Text>
                    <Badge color="blue" variant="soft">
                      {t("server.enabled")}
                    </Badge>
                  </Flex>
                )}

                {server.transport?.proxyURL && (
                  <Box>
                    <Text size="2" color="gray">
                      {t("server.proxyURL")}
                    </Text>
                    <Text as="div" size="3" style={{ wordBreak: "break-all" }}>
                      {server.transport.proxyURL}
                    </Text>
                  </Box>
                )}
              </Flex>
            </Card>
          </motion.div>
        </Grid>
        {/* Probe History */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={mounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
        >
          <Card size="3">
            <Flex direction="column" gap="3">
              <Heading size="4">{t("server.statusCard")}</Heading>
              <ProbeHistory serverId={id!} />
            </Flex>
          </Card>
        </motion.div>
        {/* Latency Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={mounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5, delay: 0.35, ease: "easeOut" }}
        >
          <Card size="3">
            <Flex direction="column" gap="3">
              <Heading size="4">{t("server.latencyChartCard")}</Heading>
              <LatencyChart serverId={id!} />
            </Flex>
          </Card>
        </motion.div>
        {/* Proxy List */}
      {/* Logs Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={mounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
      >
        <Card size="3">
          <ServerLogViewer serverId={id!} />
        </Card>
      </motion.div>
      {/* Proxy Delete Confirmation */}
      </AdvancedSettings>{" "}
      <AlertDialog.Root open={!!deleteProxyId} onOpenChange={() => setDeleteProxyId(null)}>
        <AlertDialog.Content maxWidth="450px">
          <AlertDialog.Title>{t("proxy.confirmDeletion")}</AlertDialog.Title>
          <AlertDialog.Description size="2">
            {t("proxy.deleteConfirmMessage")}
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                <Icon icon="lucide:x" width="16" height="16" />
                {t("common.cancel")}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                variant="solid"
                color="red"
                onClick={() => {
                  if (deleteProxyId) {
                    deleteProxy(deleteProxyId);
                    setDeleteProxyId(null);
                  }
                }}
              >
                <Icon icon="lucide:trash-2" width="16" height="16" />
                {t("common.delete")}
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Flex>
  );
}
