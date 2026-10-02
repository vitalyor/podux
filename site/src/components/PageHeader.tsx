import { Box, Flex, Heading, Text } from "@radix-ui/themes";
import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  extra?: ReactNode;
  visible?: boolean;
}
export function PageHeader({ title, description, extra }: PageHeaderProps) {
  return (
    <Flex className="page-header" justify="between" align="start" gap="4" wrap="wrap">
      <Box style={{ minWidth: 0 }}>
        <Heading size="6" style={{ overflowWrap: "anywhere" }}>
          {title}
        </Heading>
        {description && (
          <Text as="p" color="gray" size="2" mt="1" style={{ maxWidth: 640 }}>
            {description}
          </Text>
        )}
      </Box>
      {extra && (
        <Flex gap="2" wrap="wrap" className="page-actions">
          {extra}
        </Flex>
      )}
    </Flex>
  );
}
