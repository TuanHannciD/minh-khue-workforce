import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Employee, EmployeeIntent } from "../api/employees";
import { saveEmployee } from "../api/employees";
import type { EmployeeDraft } from "../model/employee-draft";
import type { EmployeeFields } from "../model/employee-draft";
import { employeeSchema } from "../model/employee-schema";

export function EmployeeForm({
  draft,
  save = saveEmployee,
}: {
  draft: EmployeeDraft;
  save?: (intent: EmployeeIntent) => Promise<Employee>;
}) {
  useSyncExternalStore(draft.subscribe, draft.snapshot);
  return <EmployeeFormFields key={draft.lifecycle} draft={draft} save={save} />;
}

function EmployeeFormFields({
  draft,
  save,
}: {
  draft: EmployeeDraft;
  save: (intent: EmployeeIntent) => Promise<Employee>;
}) {
  const id = useId();
  const summary = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [validationError, setValidationError] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    reset,
    formState: { errors },
  } = useForm<EmployeeFields>({
    resolver: zodResolver(employeeSchema),
    defaultValues: draft.values,
    shouldFocusError: false,
  });
  const outcome = draft.outcome;
  const blocked =
    pending || outcome.type === "unknown" || outcome.type === "conflict";
  const hasError =
    validationError ||
    ["rejected", "conflict", "unknown"].includes(outcome.type);
  useEffect(() => {
    if (hasError) summary.current?.focus();
  }, [hasError, outcome]);
  async function submit(values: EmployeeFields) {
    if (blocked) return;
    draft.change(values);
    setValidationError(false);
    setPending(true);
    const generation = draft.begin();
    const input = {
      name: values.name.trim(),
      startDate: values.startDate,
      endDate: values.endDate || null,
    };
    const intent: EmployeeIntent = draft.baseline
      ? {
          id: draft.baseline.id,
          input: { ...input, expectedRevision: draft.baseline.revision },
        }
      : { input };
    try {
      const result = await save(intent);
      if (draft.accept(result, generation)) reset(draft.values);
    } catch (error) {
      draft.reject(error, generation);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="employee-panel" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>
        {draft.baseline ? "Chỉnh sửa nhân sự" : "Thêm nhân sự"}
      </h2>
      <p className="muted">
        Ngày bắt đầu và ngày kết thúc đều tính là ngày còn làm việc.
      </p>
      {draft.baseline && (
        <p className="employee-identity">
          {draft.baseline.name}{" "}
          <span className="muted">· ID {draft.baseline.id}</span>
        </p>
      )}
      <form
        noValidate
        onChange={() => {
          draft.change(getValues());
          setValidationError(false);
        }}
        onSubmit={(event) => {
          void handleSubmit(submit, () => {
            setValidationError(true);
            queueMicrotask(() => summary.current?.focus());
          })(event);
        }}
        aria-busy={pending}
      >
        {hasError && (
          <div
            role="alert"
            tabIndex={-1}
            ref={summary}
            className="employee-error"
            aria-labelledby={`${id}-error-title`}
          >
            <h3 id={`${id}-error-title`}>
              {validationError
                ? "Vui lòng kiểm tra thông tin."
                : outcome.message}
            </h3>
            {validationError && (
              <ul>
                {(Object.keys(errors) as (keyof EmployeeFields)[]).map(
                  (field) => (
                    <li key={field}>
                      <a href={`#${id}-${field}`}>{errors[field]?.message}</a>
                    </li>
                  ),
                )}
              </ul>
            )}
            {outcome.details?.cells && (
              <>
                <p>
                  Các ô cần xử lý của {draft.baseline?.name} (ID{" "}
                  {draft.baseline?.id}):
                </p>
                <ul>
                  {outcome.details.cells.map((cell) => (
                    <li key={`${cell.employeeId}/${cell.date}/${cell.kind}`}>
                      {cell.date} · {cell.kind === "work" ? "Công" : "Tăng ca"}{" "}
                      · {cell.employeeId}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {outcome.details?.fields && (
              <ul>
                {outcome.details.fields.map((field) => (
                  <li key={field.path}>
                    <a href={`#${id}-${field.path}`}>{field.message}</a>
                  </li>
                ))}
              </ul>
            )}
            {outcome.details?.current && (
              <p>
                Thông tin hiện tại: {outcome.details.current.name}, từ{" "}
                {outcome.details.current.startDate} đến{" "}
                {outcome.details.current.endDate ?? "chưa có ngày kết thúc"}.
                Bản nháp bên dưới được giữ nguyên.
              </p>
            )}
            {["conflict", "unknown"].includes(outcome.type) && (
              <p>
                Cần đối chiếu dữ liệu đã lưu trước khi tiếp tục. Bản nháp vẫn
                gắn với nhân sự này.
              </p>
            )}
          </div>
        )}
        <div className="employee-field">
          <label htmlFor={`${id}-name`}>Họ và tên</label>
          <input
            id={`${id}-name`}
            {...register("name")}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? `${id}-name-error` : undefined}
            autoComplete="off"
            disabled={pending}
          />
          {errors.name && (
            <p className="error" id={`${id}-name-error`}>
              {errors.name.message}
            </p>
          )}
        </div>
        <div className="employee-dates">
          {(["startDate", "endDate"] as const).map((field) => (
            <div className="employee-field" key={field}>
              <label htmlFor={`${id}-${field}`}>
                {field === "startDate" ? "Ngày bắt đầu" : "Ngày kết thúc"}
              </label>
              <input
                id={`${id}-${field}`}
                {...register(field)}
                type="text"
                placeholder="YYYY-MM-DD"
                inputMode="text"
                aria-invalid={Boolean(errors[field])}
                aria-describedby={`${id}-${field}-help${errors[field] ? ` ${id}-${field}-error` : ""}`}
                disabled={pending}
              />
              <p className="muted" id={`${id}-${field}-help`}>
                {field === "startDate"
                  ? "Dùng ngày được chọn, kể cả trước ngày thêm nhân sự."
                  : "Để trống nếu chưa có ngày kết thúc."}
              </p>
              {errors[field] && (
                <p className="error" id={`${id}-${field}-error`}>
                  {errors[field].message}
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="employee-actions">
          <button className="primary" type="submit" disabled={blocked}>
            {pending ? "Đang lưu…" : "Lưu nhân sự"}
          </button>
          <button
            type="button"
            disabled={pending || outcome.type === "unknown"}
            onClick={() => {
              draft.clear();
            }}
          >
            Hủy
          </button>
        </div>
        {outcome.type === "saved" && <p role="status">Đã lưu nhân sự.</p>}
      </form>
    </section>
  );
}
