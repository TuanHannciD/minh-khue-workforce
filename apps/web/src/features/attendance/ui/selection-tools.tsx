import { Button } from "@/shared/ui/button";
export function SelectionTools({
  multi,
  mode,
  waiting,
  onToggle,
  onMode,
  onAdd,
}: {
  multi: boolean;
  mode: string;
  waiting: boolean;
  onToggle: () => void;
  onMode: (value: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="selection-tools">
      <Button aria-pressed={multi} onClick={onToggle}>
        Chọn nhiều
      </Button>
      {multi && (
        <>
          <label>
            Cách chọn ô{" "}
            <select
              aria-label="Cách chọn ô"
              value={mode}
              onChange={(e) => onMode(e.target.value)}
            >
              <option value="cells">Ô rời</option>
              <option value="range">Vùng chữ nhật</option>
            </select>
          </label>
          <Button onClick={onAdd}>Thêm vùng</Button>
        </>
      )}
      <span className="help" role="status">
        {waiting
          ? "Chọn ô cuối bằng chạm hoặc Enter; chưa ghi dữ liệu."
          : "Ctrl/Cmd + bấm/kéo thêm ô, vùng. Cảm ứng: giữ 450ms để kéo; vuốt để cuộn."}
      </span>
    </div>
  );
}
