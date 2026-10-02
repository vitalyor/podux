import { Flex, Heading } from "@radix-ui/themes";
import { Icon } from "@iconify/react";
export function SectionHeading({ id, title, icon }: { id: string; title: string; icon: string }) {
  return (
    <Flex id={id} align="center" gap="2" mb="3">
      <Icon icon={icon} width="18" style={{ color: "var(--gray-11)" }} />
      <Heading as="h2" size="3">
        {title}
      </Heading>
    </Flex>
  );
}
