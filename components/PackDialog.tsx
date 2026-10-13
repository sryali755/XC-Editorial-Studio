import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export default function PackDialog({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      className="pack-dialog"
      ref={ref}
      aria-labelledby={heading}
      onCancel={onClose}
    >
      <header className="pack-dialog-header">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2 id={heading}>{title}</h2>
        </div>
        <button
          type="button"
          className="button pack-dialog-close"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="pack-dialog-body">{children}</div>
    </dialog>
  );
}
