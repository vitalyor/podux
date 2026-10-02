import { useState } from "react";
import { Button, Callout, Flex, Heading, Text, TextField } from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";
import { PageTransition } from "../../components/PageTransition";
import { ThemeToggle } from "../../components/ThemeToggle";
import { LanguageToggle } from "../../components/LanguageToggle";
import { Icon } from "@iconify/react";
import logo from "../../assets/logo.svg";
import { useTranslation } from "react-i18next";

interface LoginViewProps {
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  loading: boolean;
  error: string;
  handleSubmit: (e: React.FormEvent) => void;
}

export function LoginView({
  email,
  setEmail,
  password,
  setPassword,
  loading,
  error,
  handleSubmit,
}: LoginViewProps) {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);

  return (
    <PageTransition>
      <Flex
        align="center"
        justify="center"
        className="relative min-h-screen"
        style={{ backgroundColor: "var(--gray-2)" }}
      >
        <Flex gap="2" className="absolute top-4 right-4">
          <ThemeToggle />
          <LanguageToggle />
        </Flex>

        {/* <Card size="4" className="w-full max-w-md shadow-lg"> */}
        <form onSubmit={handleSubmit} style={{ width: "min(360px, calc(100vw - 40px))" }}>
          <Flex direction="column" gap="3">
            {/* Logo & Title */}
            <Flex direction="column" align="center" gap="2">
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                <Flex align="center" gap="3">
                  <motion.img
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 260,
                      damping: 20,
                      delay: 0.1,
                    }}
                    whileHover={{ scale: 1.1, rotate: 10 }}
                    whileTap={{ scale: 0.95 }}
                    src={logo}
                    alt="Podux Logo"
                    className="h-16 w-16 cursor-pointer rounded-2xl object-contain"
                  />
                  <Heading size="6">Podux</Heading>
                </Flex>
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
              >
                <Text color="gray" size="2" align="center">
                  {t("auth.signInToAccount")}
                </Text>
              </motion.div>
            </Flex>

            {/* Error Message */}
            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  initial={{ opacity: 0, x: 0 }}
                  animate={{ opacity: 1, x: [0, -5, 5, -5, 5, 0] }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                >
                  <Callout.Root color="red">
                    <Callout.Icon>
                      <Icon icon="lucide:alert-circle"></Icon>
                    </Callout.Icon>
                    <Callout.Text>{error}</Callout.Text>
                  </Callout.Root>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email Field */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.4 }}
            >
              <Flex direction="column" gap="1">
                <Text as="label" size="3" weight="medium" className="">
                  {t("auth.email")}
                </Text>
                <TextField.Root
                  size="3"
                  placeholder={t("auth.enterEmail")}
                  type="email"
                  aria-label={t("auth.email")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                >
                  <TextField.Slot>
                    <Icon icon="lucide:mail"></Icon>
                  </TextField.Slot>
                </TextField.Root>
              </Flex>
            </motion.div>

            {/* Password Field */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.4 }}
            >
              <Flex direction="column" gap="1">
                <Flex justify="between" align="center">
                  <Text as="label" size="3" weight="medium" className="">
                    {t("auth.password")}
                  </Text>
                </Flex>
                <TextField.Root
                  size="3"
                  placeholder={t("auth.enterPassword")}
                  type={showPassword ? "text" : "password"}
                  aria-label={t("auth.password")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                >
                  <TextField.Slot>
                    <Icon icon="lucide:key-round" />
                  </TextField.Slot>
                  <TextField.Slot>
                    <button
                      type="button"
                      className="copy-address"
                      aria-label={t(showPassword ? "ux.hidePassword" : "ux.showPassword")}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      <Icon icon={showPassword ? "lucide:eye-off" : "lucide:eye"} />
                    </button>
                  </TextField.Slot>
                </TextField.Root>
              </Flex>
            </motion.div>

            {/* Submit Button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.4 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full"
            >
              <Button size="3" type="submit" disabled={loading} className="!w-full cursor-pointer">
                {loading ? (
                  <Icon icon="lucide:loader" className="animate-spin"></Icon>
                ) : (
                  <Icon icon="lucide:arrow-right"></Icon>
                )}
                {loading ? t("auth.signingIn") : t("auth.signIn")}
              </Button>
            </motion.div>
          </Flex>
        </form>
        {/* </Card> */}
      </Flex>
    </PageTransition>
  );
}
