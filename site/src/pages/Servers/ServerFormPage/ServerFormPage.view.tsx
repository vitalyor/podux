import { Icon } from "@iconify/react";
import {
  Button,
  Flex,
  Text,
  TextField,
  Box,
  Badge,
  Switch,
  TextArea,
  Select,
  Spinner,
  Table,
  IconButton,
} from "@radix-ui/themes";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { AdvancedSettings } from "../../../components/AdvancedSettings";
import { FormItem } from "../../../components/FormItem";
import { PageHeader } from "../../../components/PageHeader";
import { SectionHeading } from "../../../components/SectionHeading";
import { RadioCardGroup } from "../../../components/RadioCardGroup";
import { type ServerFormData } from "./useServerForm";

interface ServerFormPageViewProps {
  isEditing: boolean;
  formData: ServerFormData;
  errors: Record<string, string>;
  submitting: boolean;
  loadingServer: boolean;
  frpVersion: string;
  mounted: boolean;
  onChange: (
    field: keyof Omit<ServerFormData, "auth" | "log" | "transport" | "metadatas">,
    value: string | number | boolean
  ) => void;
  onAuthChange: (field: keyof ServerFormData["auth"], value: string) => void;
  onLogChange: (field: keyof ServerFormData["log"], value: string | number) => void;
  onTransportChange: (field: keyof ServerFormData["transport"], value: string) => void;
  onTlsChange: (field: keyof ServerFormData["transport"]["tls"], value: boolean) => void;
  onTlsStringChange: (field: string, value: string) => void;
  onFileUpload: (field: string, e: React.ChangeEvent<HTMLInputElement>) => void;
  onSetFormData: (fn: (prev: ServerFormData) => ServerFormData) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function ServerFormPageView({
  isEditing,
  formData,
  errors,
  submitting,
  loadingServer,
  frpVersion,
  mounted,
  onChange,
  onAuthChange,
  onLogChange,
  onTransportChange,
  onTlsChange,
  onTlsStringChange,
  onFileUpload,
  onSetFormData,
  onSubmit,
  onCancel,
}: ServerFormPageViewProps) {
  const { t } = useTranslation();
  const [showToken, setShowToken] = useState(false);
  const [showOidcSecret, setShowOidcSecret] = useState(false);
  const [newMetaKey, setNewMetaKey] = useState("");
  const [newMetaValue, setNewMetaValue] = useState("");

  const handleAddMetadata = () => {
    if (!newMetaKey) return;
    onSetFormData((prev) => ({
      ...prev,
      metadatas: { ...prev.metadatas, [newMetaKey]: newMetaValue },
    }));
    setNewMetaKey("");
    setNewMetaValue("");
  };

  const handleRemoveMetadata = (key: string) => {
    onSetFormData((prev) => {
      const next = { ...prev.metadatas };
      delete next[key];
      return { ...prev, metadatas: next };
    });
  };

  if (loadingServer) {
    return (
      <Flex align="center" justify="center" className="min-h-[60vh]">
        <Spinner size="3" />
      </Flex>
    );
  }

  return (
    <div className="form-page">
      <PageHeader
        title={isEditing ? t("server.editServer") : t("server.addServer")}
        description={t("ux.connectionIntro")}
        visible={mounted}
      />
      <form
        className="compact-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!submitting) onSubmit();
        }}
      >
        <div className="form-primary">
          <section>
            <SectionHeading id="section-basic" title={t("proxy.sectionBasic")} icon="lucide:info" />
            <Flex direction="column" gap="4">
              <FormItem label={t("server.serverName")} required error={errors.serverName}>
                <TextField.Root
                  aria-label={t("server.serverName")}
                  size="2"
                  placeholder={t("server.serverNamePlaceholder")}
                  value={formData.serverName}
                  onChange={(e) => onChange("serverName", e.target.value)}
                  color={errors.serverName ? "red" : undefined}
                />
              </FormItem>

              <Flex gap="3" direction={{ initial: "column", sm: "row" }}>
                <Box className="flex-[2]">
                  <FormItem label={t("server.hostAddressLabel")} required error={errors.serverAddr}>
                    <TextField.Root
                      aria-label={t("server.hostAddressLabel")}
                      size="2"
                      placeholder={t("server.hostAddressPlaceholder")}
                      value={formData.serverAddr}
                      onChange={(e) => onChange("serverAddr", e.target.value)}
                      color={errors.serverAddr ? "red" : undefined}
                    />
                  </FormItem>
                </Box>
                <Box className="flex-1">
                  <FormItem label={t("server.portLabel")} required error={errors.serverPort}>
                    <TextField.Root
                      aria-label={t("server.portLabel")}
                      size="2"
                      type="number"
                      placeholder={t("server.portPlaceholder")}
                      value={formData.serverPort || ""}
                      onChange={(e) => onChange("serverPort", parseInt(e.target.value) || 0)}
                      color={errors.serverPort ? "red" : undefined}
                    />
                  </FormItem>
                </Box>
              </Flex>

              <Flex gap="2" align="center" wrap="wrap">
                <Badge variant="soft" color={formData.transport.tls.enable ? "green" : "amber"}>
                  {formData.transport.tls.enable ? t("ux.tlsOn") : t("ux.tlsOff")}
                </Badge>
                {formData.auth.method === "none" && (
                  <Badge color="amber">{t("server.authMethodNone")}</Badge>
                )}
                <Badge variant="soft" color="gray">
                  FRPC {frpVersion || "—"}
                </Badge>
                <Text size="1" color="gray">
                  {t("ux.runtimeVersion")}
                </Text>
              </Flex>
            </Flex>
            <FormItem label={t("server.user")}>
              <TextField.Root
                aria-label={t("server.user")}
                size="2"
                placeholder={t("server.userPlaceholder")}
                value={formData.user}
                onChange={(e) => onChange("user", e.target.value)}
              />
            </FormItem>
            <AnimatePresence>
              {formData.auth.method === "token" && (
                <FormItem
                  key="token-field"
                  label={t("server.token")}
                  required
                  error={errors.token}
                  animate
                >
                  <TextField.Root
                    size="2"
                    aria-label={t("server.token")}
                    aria-invalid={!!errors.token}
                    type={showToken ? "text" : "password"}
                    placeholder={t("server.tokenPlaceholder")}
                    value={formData.auth.token}
                    onChange={(e) => onAuthChange("token", e.target.value)}
                  >
                    <TextField.Slot side="right">
                      <IconButton
                        type="button"
                        size="1"
                        variant="ghost"
                        aria-label={showToken ? t("ux.hideSecret") : t("ux.showSecret")}
                        onClick={() => setShowToken(!showToken)}
                      >
                        <Icon icon={showToken ? "lucide:eye-off" : "lucide:eye"} />
                      </IconButton>
                    </TextField.Slot>
                  </TextField.Root>
                </FormItem>
              )}
            </AnimatePresence>
            <Flex justify="between" align="center">
              <Box>
                <Text size="2" weight="medium">
                  {t("server.autoConnection")}
                </Text>
                <Text as="p" size="1" color="gray">
                  {t("server.autoConnectionDesc")}
                </Text>
              </Box>
              <Switch
                aria-label={t("server.autoConnection")}
                size="2"
                checked={formData.autoConnection}
                onCheckedChange={(v) => onChange("autoConnection", v)}
              />
            </Flex>
            <Text size="1" color="gray">
              {t("ux.connectionHint")}
            </Text>
          </section>
        </div>
        <AdvancedSettings description={t("ux.connectionAdvanced")}>
          <section>
            <SectionHeading
              id="section-auth"
              title={t("server.authentication")}
              icon="lucide:lock"
            />
            <Flex direction="column" gap="4">
              <Text size="2" color="gray">
                {t("ux.authHint")}
              </Text>
              <FormItem label={t("server.authentication")} required>
                <RadioCardGroup
                  options={[
                    { value: "none", label: t("server.authMethodNone"), icon: "lucide:ban" },
                    { value: "token", label: t("server.authMethodToken"), icon: "lucide:key" },
                  ]}
                  value={formData.auth.method}
                  onChange={(v) => onAuthChange("method", v as ServerFormData["auth"]["method"])}
                  comingSoonLabel={t("common.comingSoon")}
                />
              </FormItem>

              {formData.auth.method === "oidc" && (
                <Flex direction="column" gap="3">
                  <FormItem label={t("server.clientId")}>
                    <TextField.Root
                      aria-label={t("server.clientId")}
                      size="2"
                      placeholder={t("server.clientIdPlaceholder")}
                      value={formData.auth.oidcClientId}
                      onChange={(e) => onAuthChange("oidcClientId", e.target.value)}
                    />
                  </FormItem>
                  <FormItem label={t("server.clientSecret")}>
                    <TextField.Root
                      aria-label={t("server.clientSecret")}
                      size="2"
                      type={showOidcSecret ? "text" : "password"}
                      placeholder={t("server.clientSecretPlaceholder")}
                      value={formData.auth.oidcClientSecret}
                      onChange={(e) => onAuthChange("oidcClientSecret", e.target.value)}
                    >
                      <TextField.Slot side="right">
                        <Icon
                          icon={showOidcSecret ? "lucide:eye-off" : "lucide:eye"}
                          className="cursor-pointer"
                          onClick={() => setShowOidcSecret(!showOidcSecret)}
                        />
                      </TextField.Slot>
                    </TextField.Root>
                  </FormItem>
                  <FormItem label={t("server.audience")}>
                    <TextField.Root
                      aria-label={t("server.audience")}
                      size="2"
                      placeholder={t("server.audiencePlaceholder")}
                      value={formData.auth.oidcAudience}
                      onChange={(e) => onAuthChange("oidcAudience", e.target.value)}
                    />
                  </FormItem>
                  <FormItem label={t("server.tokenEndpoint")}>
                    <TextField.Root
                      aria-label={t("server.tokenEndpoint")}
                      size="2"
                      placeholder={t("server.tokenEndpointPlaceholder")}
                      value={formData.auth.oidcTokenEndpoint}
                      onChange={(e) => onAuthChange("oidcTokenEndpoint", e.target.value)}
                    />
                  </FormItem>
                </Flex>
              )}
            </Flex>
          </section>
          <section>
            <SectionHeading
              id="section-transport"
              title={t("server.transport")}
              icon="lucide:network"
            />
            <Flex direction="column" gap="4">
              <Text size="2" color="gray">
                {t("ux.tlsHint")}
              </Text>
              <FormItem label={t("server.protocol")}>
                <Select.Root
                  value={formData.transport.protocol}
                  onValueChange={(v) => onTransportChange("protocol", v)}
                >
                  <Select.Trigger aria-label={t("server.protocol")} style={{ width: "100%" }} />
                  <Select.Content>
                    <Select.Item value="tcp">{t("server.protocolTcp")}</Select.Item>
                    <Select.Item value="kcp">{t("server.protocolKcp")}</Select.Item>
                    <Select.Item value="quic">{t("server.protocolQuic")}</Select.Item>
                    <Select.Item value="websocket">{t("server.protocolWebsocket")}</Select.Item>
                    <Select.Item value="wss">{t("server.protocolWss")}</Select.Item>
                  </Select.Content>
                </Select.Root>
              </FormItem>

              <Flex justify="between" align="center">
                <Box>
                  <Text size="2" weight="medium">
                    {t("server.tlsEnable")}
                  </Text>
                </Box>
                <Switch
                  aria-label={t("server.tlsEnable")}
                  size="2"
                  checked={formData.transport.tls.enable}
                  onCheckedChange={(v) => onTlsChange("enable", v)}
                />
              </Flex>

              <Flex justify="between" align="center">
                <Box>
                  <Text size="2" weight="medium">
                    {t("server.disableCustomTLSFirstByte")}
                  </Text>
                </Box>
                <Switch
                  aria-label={t("server.disableCustomTLSFirstByte")}
                  size="2"
                  checked={formData.transport.tls.disableCustomTLSFirstByte}
                  onCheckedChange={(v) => onTlsChange("disableCustomTLSFirstByte", v)}
                />
              </Flex>

              <AnimatePresence>
                {formData.transport.tls.enable && (
                  <motion.div
                    key="tls-fields"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    style={{ overflow: "hidden" }}
                  >
                    <Flex
                      direction="column"
                      gap="4"
                      className="rounded-[var(--radius-3)] bg-[var(--gray-3)] p-3"
                    >
                      <FormItem label={t("server.serverNameSNI")}>
                        <TextField.Root
                          aria-label={t("server.serverNameSNI")}
                          size="2"
                          placeholder={t("server.serverNameSNIPlaceholder")}
                          value={formData.transport.tls.serverName}
                          onChange={(e) => onTlsStringChange("serverName", e.target.value)}
                        />
                      </FormItem>

                      {(["certFile", "keyFile", "trustedCaFile"] as const).map((field) => {
                        const labelKey =
                          field === "certFile"
                            ? "server.certFileContent"
                            : field === "keyFile"
                              ? "server.keyFileContent"
                              : "server.trustedCAContent";
                        const placeholderKey =
                          field === "certFile"
                            ? "server.certFilePlaceholder"
                            : field === "keyFile"
                              ? "server.keyFilePlaceholder"
                              : "server.trustedCAPlaceholder";
                        const inputId = `file-upload-${field}`;
                        return (
                          <FormItem key={field} label={t(labelKey)}>
                            <Flex direction="column" gap="2">
                              <TextArea
                                size="2"
                                placeholder={t(placeholderKey)}
                                value={formData.transport.tls[field]}
                                onChange={(e) => onTlsStringChange(field, e.target.value)}
                                className="min-h-[80px] font-mono text-[12px]"
                              />
                              <Flex justify="end">
                                <input
                                  type="file"
                                  id={inputId}
                                  className="hidden"
                                  onChange={(e) => onFileUpload(field, e)}
                                />
                                <Button
                                  type="button"
                                  size="1"
                                  variant="soft"
                                  onClick={() => document.getElementById(inputId)?.click()}
                                >
                                  <Icon icon="lucide:upload" width="14" height="14" />
                                  {t("server.loadFromFile")}
                                </Button>
                              </Flex>
                            </Flex>
                          </FormItem>
                        );
                      })}
                    </Flex>
                  </motion.div>
                )}
              </AnimatePresence>

              <FormItem label={t("server.proxyUrl")}>
                <TextField.Root
                  aria-label={t("server.proxyUrl")}
                  size="2"
                  placeholder={t("server.proxyUrlPlaceholder")}
                  value={formData.transport.proxyURL}
                  onChange={(e) => onTransportChange("proxyURL", e.target.value)}
                />
              </FormItem>
            </Flex>
          </section>
          <section>
            <SectionHeading id="section-log" title={t("server.log")} icon="lucide:scroll-text" />
            <Flex direction="column" gap="4">
              <FormItem label={t("server.logLevel")}>
                <Select.Root
                  value={formData.log.level}
                  onValueChange={(v) => onLogChange("level", v)}
                >
                  <Select.Trigger aria-label={t("server.logLevel")} style={{ width: "100%" }} />
                  <Select.Content>
                    <Select.Item value="trace">{t("server.logLevelTrace")}</Select.Item>
                    <Select.Item value="debug">{t("server.logLevelDebug")}</Select.Item>
                    <Select.Item value="info">{t("server.logLevelInfo")}</Select.Item>
                    <Select.Item value="warn">{t("server.logLevelWarn")}</Select.Item>
                    <Select.Item value="error">{t("server.logLevelError")}</Select.Item>
                  </Select.Content>
                </Select.Root>
              </FormItem>

              <FormItem label={t("server.maxDays")}>
                <TextField.Root
                  aria-label={t("server.maxDays")}
                  size="2"
                  type="number"
                  placeholder={t("server.maxDaysPlaceholder")}
                  value={formData.log.maxDays}
                  onChange={(e) => onLogChange("maxDays", parseInt(e.target.value) || 0)}
                />
              </FormItem>
            </Flex>
          </section>
          <section>
            <SectionHeading
              id="section-misc"
              title={t("proxy.descriptionLabel")}
              icon="lucide:file-text"
            />
            <Flex direction="column" gap="4">
              <FormItem label={t("server.descriptionLabel")}>
                <TextArea
                  aria-label={t("server.descriptionLabel")}
                  size="2"
                  placeholder={t("server.descriptionPlaceholder")}
                  value={formData.description}
                  onChange={(e) => onChange("description", e.target.value)}
                  className="min-h-[80px]"
                />
              </FormItem>
            </Flex>
          </section>
          <section>
            <SectionHeading
              id="section-metadatas"
              title={t("server.metadatas")}
              icon="lucide:tag"
            />
            <Flex direction="column" gap="4">
              <Table.Root variant="surface">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>{t("server.metadataKey")}</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>{t("server.metadataValue")}</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell width="40px" />
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {Object.entries(formData.metadatas).map(([key, value]) => (
                    <Table.Row key={key}>
                      <Table.Cell>{key}</Table.Cell>
                      <Table.Cell>{value}</Table.Cell>
                      <Table.Cell>
                        <IconButton
                          type="button"
                          aria-label={t("common.delete")}
                          variant="ghost"
                          color="red"
                          onClick={() => handleRemoveMetadata(key)}
                        >
                          <Icon icon="lucide:trash" />
                        </IconButton>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                  {Object.keys(formData.metadatas).length === 0 && (
                    <Table.Row>
                      <Table.Cell colSpan={3} align="center">
                        <Text color="gray" size="2">
                          {t("server.noMetadata")}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table.Root>

              <Flex gap="2" direction={{ initial: "column", sm: "row" }}>
                <TextField.Root
                  className="flex-1"
                  placeholder={t("server.metadataKeyPlaceholder")}
                  aria-label={t("server.metadataKey")}
                  value={newMetaKey}
                  onChange={(e) => setNewMetaKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddMetadata();
                    }
                  }}
                />
                <TextField.Root
                  className="flex-1"
                  placeholder={t("server.metadataValuePlaceholder")}
                  aria-label={t("server.metadataValue")}
                  value={newMetaValue}
                  onChange={(e) => setNewMetaValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddMetadata();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="soft"
                  onClick={handleAddMetadata}
                  disabled={!newMetaKey}
                >
                  <Icon icon="lucide:plus" />
                  {t("common.add")}
                </Button>
              </Flex>
            </Flex>
          </section>
        </AdvancedSettings>
        <Flex justify="end" gap="3" className="form-actions">
          <Button variant="soft" color="gray" size="2" type="button" onClick={onCancel}>
            <Icon icon="lucide:arrow-left" width="16" height="16" />
            {t("common.cancel")}
          </Button>
          <Button size="2" disabled={submitting} type="submit">
            {submitting ? (
              <Spinner size="1" />
            ) : isEditing ? (
              <Icon icon="lucide:pencil" width="16" height="16" />
            ) : (
              <Icon icon="lucide:plus" width="16" height="16" />
            )}
            {submitting
              ? isEditing
                ? t("server.saving")
                : t("server.adding")
              : isEditing
                ? t("server.saveChanges")
                : t("server.addServer")}
          </Button>
        </Flex>
      </form>
    </div>
  );
}
