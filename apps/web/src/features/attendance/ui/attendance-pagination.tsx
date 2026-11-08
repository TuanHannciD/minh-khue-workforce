import { useId, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import type { AttendancePageDto } from "../model/types";

export function AttendancePagination({
  pagination,
  disabled,
  onPage,
  onPageSize,
  position,
}: {
  pagination: AttendancePageDto["pagination"];
  disabled: boolean;
  onPage: (page: number) => void;
  onPageSize: (size: 25 | 50) => void;
  position: "top" | "bottom";
}) {
  const id = useId();
  const [jump, setJump] = useState("");
  const [error, setError] = useState(false);
  const {
    page,
    totalPages,
    from,
    to,
    totalResults,
    monthEmployeeCount,
    pageSize,
  } = pagination;
  const empty = totalPages === 0;
  return (
    <nav
      className="attendance-pagination"
      aria-label={
        position === "top" ? "Phân trang đầu bảng" : "Phân trang cuối bảng"
      }
    >
      <div className="page-range">
        <span>
          {from}–{to} / {totalResults.toLocaleString("vi-VN")}{" "}
          {totalResults === monthEmployeeCount ? "nhân sự" : "kết quả"}
        </span>
        <span>
          Trang {empty ? 0 : page} / {totalPages}
        </span>
      </div>
      <label htmlFor={`${id}-size`}>Số nhân sự mỗi trang</label>
      <select
        id={`${id}-size`}
        value={pageSize}
        disabled={disabled}
        onChange={(event) => {
          setJump("");
          setError(false);
          onPageSize(event.target.value === "50" ? 50 : 25);
        }}
      >
        <option value="25">25</option>
        <option value="50">50</option>
      </select>
      <Button
        disabled={disabled || empty || page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Trang trước
      </Button>
      <Button
        disabled={disabled || empty || page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Trang tiếp
      </Button>
      <form
        aria-label="Chuyển trang"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled || empty) return;
          const next = Number(jump);
          if (
            !/^\d+$/.test(jump) ||
            !Number.isSafeInteger(next) ||
            next < 1 ||
            next > totalPages
          ) {
            setError(true);
            return;
          }
          setError(false);
          onPage(next);
        }}
      >
        <label htmlFor={`${id}-jump`}>Đến trang</label>
        <Input
          id={`${id}-jump`}
          inputMode="numeric"
          value={jump}
          disabled={disabled || empty}
          aria-invalid={error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            setJump(event.target.value);
            setError(false);
          }}
        />
        <Button type="submit" disabled={disabled || empty}>
          Đi
        </Button>
        {error && (
          <p id={`${id}-error`} role="alert">
            Nhập số nguyên từ 1 đến {totalPages}.
          </p>
        )}
      </form>
    </nav>
  );
}
