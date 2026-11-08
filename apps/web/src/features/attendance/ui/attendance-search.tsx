import { useEffect, useLayoutEffect, useRef } from "react";
import { Search } from "lucide-react";
import { Input } from "@/shared/ui/input";

export function AttendanceSearch({
  value,
  disabled,
  onValue,
  onCommit,
}: {
  value: string;
  disabled: boolean;
  onValue: (raw: string) => void;
  onCommit: (q: string) => void;
}) {
  const composing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onCommit);
  useLayoutEffect(() => {
    latest.current = onCommit;
  }, [onCommit]);
  function cancel() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }
  function schedule(raw: string) {
    cancel();
    if (!disabled && !composing.current)
      timer.current = setTimeout(() => {
        timer.current = null;
        latest.current(raw.trim());
      }, 300);
  }
  useEffect(() => {
    if (disabled) cancel();
    return cancel;
  }, [disabled]);
  return (
    <label className="attendance-search">
      <span>Tìm tên hoặc ID trong toàn bộ nhân sự của tháng</span>
      <span className="search-field">
        <Search aria-hidden="true" />
        <Input
          type="search"
          value={value}
          disabled={disabled}
          placeholder="Nhập tên hoặc ID…"
          onChange={(event) => {
            onValue(event.target.value);
            schedule(event.target.value);
          }}
          onCompositionStart={() => {
            composing.current = true;
            cancel();
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            schedule(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.nativeEvent.isComposing &&
              !composing.current &&
              !disabled
            ) {
              event.preventDefault();
              cancel();
              latest.current(event.currentTarget.value.trim());
            }
          }}
        />
      </span>
    </label>
  );
}
