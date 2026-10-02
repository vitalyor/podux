import { Button, Flex, Text } from "@radix-ui/themes";
import { Icon } from "@iconify/react";
import { useTranslation } from "react-i18next";
export function ListPagination({
  page,
  totalPages,
  setPage,
}: {
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;
  return (
    <Flex mt="4" align="center" justify="between" gap="3">
      <Text size="2" color="gray">
        {page} / {totalPages}
      </Text>
      <Flex gap="2">
        <Button
          variant="soft"
          color="gray"
          aria-label={t("ux.previousPage")}
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <Icon icon="lucide:chevron-left" />
        </Button>
        <Button
          variant="soft"
          color="gray"
          aria-label={t("ux.nextPage")}
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          <Icon icon="lucide:chevron-right" />
        </Button>
      </Flex>
    </Flex>
  );
}
