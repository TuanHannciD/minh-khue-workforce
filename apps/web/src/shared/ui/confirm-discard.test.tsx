// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDiscard } from "./confirm-discard";
import { Button } from "./button";
afterEach(cleanup);

function Guard({
  hideOpener = false,
  disableOpener = false,
}: {
  hideOpener?: boolean;
  disableOpener?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {!hideOpener && (
        <Button disabled={disableOpener} onClick={() => setOpen(true)}>
          Đổi ngữ cảnh
        </Button>
      )}
      <Button id="new-destination" onClick={() => {}}>
        Đích mới
      </Button>
      {open && (
        <ConfirmDiscard
          title="Quyết định"
          onKeep={() => setOpen(false)}
          onDiscard={() => {
            setOpen(false);
            queueMicrotask(() =>
              document.getElementById("new-destination")?.focus(),
            );
          }}
        >
          <p>Bản nháp vẫn giữ</p>
        </ConfirmDiscard>
      )}
    </>
  );
}
it.each(["keep", "escape"])(
  "real Radix %s restores the connected opener",
  async (choice) => {
    render(<Guard />);
    const user = userEvent.setup();
    const opener = screen.getByRole("button", { name: "Đổi ngữ cảnh" });
    await user.click(opener);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Giữ phần nhập" }),
    );
    if (choice === "keep")
      await user.click(screen.getByRole("button", { name: "Giữ phần nhập" }));
    else await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(opener));
  },
);
it("discard preserves deliberate destination focus", async () => {
  render(<Guard />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Đổi ngữ cảnh" }));
  await user.click(
    screen.getByRole("button", { name: "Bỏ phần nhập và tiếp tục" }),
  );
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Đích mới" }),
  );
});
it("Keep does not focus a disabled opener", async () => {
  const view = render(<Guard />);
  const user = userEvent.setup();
  const opener = screen.getByRole("button", { name: "Đổi ngữ cảnh" });
  await user.click(opener);
  view.rerender(<Guard disableOpener />);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(document.activeElement).not.toBe(opener);
});
it("Keep does not focus a disconnected opener", async () => {
  const view = render(<Guard />);
  const user = userEvent.setup();
  const opener = screen.getByRole("button", { name: "Đổi ngữ cảnh" });
  await user.click(opener);
  view.rerender(<Guard hideOpener />);
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(document.activeElement).not.toBe(opener);
});

it("closing one guard leaves focus in the next modal", async () => {
  function SequentialGuards() {
    const [step, setStep] = useState(0);
    return (
      <>
        <Button onClick={() => setStep(1)}>Mở guard đầu</Button>
        {step === 1 && (
          <ConfirmDiscard
            key="first"
            title="Guard đầu"
            onKeep={() => setStep(2)}
            onDiscard={() => setStep(0)}
          >
            <p>Giữ để mở guard sau</p>
          </ConfirmDiscard>
        )}
        {step === 2 && (
          <ConfirmDiscard
            key="second"
            title="Guard sau"
            keepLabel="Giữ guard sau"
            onKeep={() => setStep(0)}
            onDiscard={() => setStep(0)}
          >
            <p>Ngữ cảnh sau</p>
          </ConfirmDiscard>
        )}
      </>
    );
  }
  render(<SequentialGuards />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Mở guard đầu" }));
  await user.click(screen.getByRole("button", { name: "Giữ phần nhập" }));
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Giữ guard sau" }),
    ),
  );
  expect(
    screen.getByRole("alertdialog").getAttribute("aria-labelledby"),
  ).toBeTruthy();
});
