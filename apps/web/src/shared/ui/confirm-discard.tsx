import { AlertDialog } from "radix-ui";
import type { ReactNode } from "react";
import { Button } from "./button";

// Authored on the installed Radix foundation; shared only by real draft guards.
export function ConfirmDiscard({
  title,
  children,
  keepLabel = "Giữ phần nhập",
  discardLabel = "Bỏ phần nhập và tiếp tục",
  onKeep,
  onDiscard,
}: {
  title: string;
  children: ReactNode;
  keepLabel?: string;
  discardLabel?: string;
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onKeep();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="guard-overlay" />
        <AlertDialog.Content className="guard-dialog" aria-modal="true">
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div>{children}</div>
          </AlertDialog.Description>
          <div className="guard-actions">
            <AlertDialog.Cancel asChild>
              <Button onClick={onKeep}>{keepLabel}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button onClick={onDiscard}>{discardLabel}</Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
