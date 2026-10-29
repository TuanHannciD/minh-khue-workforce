import { AlertDialog } from "radix-ui";
import { useRef, useState, type ReactNode } from "react";
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
  // Capture before Radix moves focus into this controlled dialog. The guard
  // has no Trigger because its open decision belongs to the draft consumer.
  const [opener] = useState(() => document.activeElement);
  const discarded = useRef(false);
  return (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onKeep();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="guard-overlay" />
        <AlertDialog.Content
          className="guard-dialog"
          aria-modal="true"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (
              !discarded.current &&
              opener instanceof HTMLElement &&
              opener.isConnected &&
              !opener.matches(":disabled, [aria-disabled='true']") &&
              !opener.closest("[inert]") &&
              document.activeElement === document.body
            )
              opener.focus();
          }}
        >
          <AlertDialog.Title>{title}</AlertDialog.Title>
          <AlertDialog.Description asChild>
            <div>{children}</div>
          </AlertDialog.Description>
          <div className="guard-actions">
            <AlertDialog.Cancel asChild>
              <Button onClick={onKeep}>{keepLabel}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                onClick={() => {
                  discarded.current = true;
                  onDiscard();
                }}
              >
                {discardLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
