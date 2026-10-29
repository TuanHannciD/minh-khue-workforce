import { Grip } from "lucide-react";
export function FillHandle({ onFill }: { onFill: () => void }) {
  return (
    <button
      type="button"
      className="fill-handle"
      data-fill="true"
      aria-label="Kéo điền từ ô này"
      onClick={(event) => {
        event.stopPropagation();
        onFill();
      }}
    >
      <Grip aria-hidden="true" />
    </button>
  );
}
