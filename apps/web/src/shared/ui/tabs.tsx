import type { ComponentProps } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "./cn";
export function Tabs(props: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" {...props} />;
}
export function TabsList({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("switcher", className)}
      {...props}
    />
  );
}
export function TabsTrigger(
  props: ComponentProps<typeof TabsPrimitive.Trigger>,
) {
  return <TabsPrimitive.Trigger data-slot="tabs-trigger" {...props} />;
}
export function TabsContent(
  props: ComponentProps<typeof TabsPrimitive.Content>,
) {
  return <TabsPrimitive.Content data-slot="tabs-content" {...props} />;
}
