import type { ComponentProps } from "react";
import { cn } from "./cn";
export function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn("ui-input", className)}
      {...props}
    />
  );
}
