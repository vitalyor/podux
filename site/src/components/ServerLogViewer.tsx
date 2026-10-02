import { useEffect, useRef, useState } from "react";
import { Box, Button, Flex, Heading, Text, Switch } from "@radix-ui/themes";
import { Icon } from "@iconify/react";
import { useTranslation } from "react-i18next";
import pb from "../lib/pocketbase";

interface ServerLogViewerProps {
  serverId: string;
  /** Height of the scrollable log area. Defaults to 300px. */
  height?: number | string;
  /** Whether to show the card heading. Defaults to true. */
  showHeading?: boolean;
}

export function ServerLogViewer({
  serverId,
  height = 300,
  showHeading = true,
}: ServerLogViewerProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<string[]>([]);
  const [follow, setFollow] = useState(true);
  const [disconnected, setDisconnected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // SSE log streaming
  useEffect(() => {
    const token = pb.authStore.token;
    const es = new EventSource(`/api/frpc/logs/stream?id=${serverId}&token=${token}`);

    const MAX_LOGS = 500;
    es.onmessage = (event) => {
      setLogs((prev) => {
        const next = [...prev, event.data];
        return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
      });
    };

    es.onerror = () => {
      setDisconnected(true);
      es.close();
    };

    return () => {
      es.close();
    };
  }, [serverId]);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (follow && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, follow]);

  return (
    <Flex direction="column" gap="3">
      <Flex justify="between" align="center" gap="3" wrap="wrap">
        <Text as="label" size="2">
          <Flex gap="2" align="center">
            <Switch checked={follow} onCheckedChange={setFollow} aria-label={t("ux.followLogs")} />
            {t("ux.followLogs")}
          </Flex>
        </Text>
        {disconnected && (
          <Text size="1" color="gray">
            {t("ux.logsDisconnected")}
          </Text>
        )}
      </Flex>
      {showHeading && (
        <Flex justify="between" align="center">
          <Heading size="4">{t("server.connectionLogs")}</Heading>
          <Button size="1" variant="soft" onClick={() => setLogs([])}>
            <Icon icon="lucide:trash-2" width="14" height="14" />
            {t("server.clear")}
          </Button>
        </Flex>
      )}

      {!showHeading && (
        <Flex justify="end">
          <Button size="1" variant="soft" onClick={() => setLogs([])}>
            <Icon icon="lucide:trash-2" width="14" height="14" />
            {t("server.clear")}
          </Button>
        </Flex>
      )}

      <Box
        ref={containerRef}
        style={{
          backgroundColor: "var(--gray-2)",
          borderRadius: "var(--radius-3)",
          padding: "1rem",
          fontFamily: "monospace",
          fontSize: "0.9rem",
          height,
          overflowY: "auto",
          overflowX: "auto",
          minHeight: 180,
        }}
      >
        {logs.length > 0 ? (
          logs.map((log, index) => (
            <div key={index} style={{ marginBottom: "4px" }}>
              <Text color="gray">{log}</Text>
            </div>
          ))
        ) : (
          <Text color="gray" style={{ fontStyle: "italic" }}>
            {t("server.noLogsAvailable")}
          </Text>
        )}
      </Box>
    </Flex>
  );
}
