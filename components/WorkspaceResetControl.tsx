"use client";

import { useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

export default function WorkspaceResetControl({
  disabled,
  onConfirm,
}: {
  disabled: boolean;
  onConfirm: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const locked = useRef(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    if (locked.current || disabled) return;
    locked.current = true;
    setResetting(true);
    setError("");
    try {
      await onConfirm();
    } catch {
      setError(
        "The workspace could not be fully cleared. Nothing has been reported as reset. Please try again.",
      );
      locked.current = false;
      setResetting(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="button small studio-reset-button"
        disabled={disabled || resetting}
        title={
          disabled
            ? "Wait for current agent requests and saves to finish before resetting."
            : "Clear saved campaign work and start with an empty workspace."
        }
        onClick={() => {
          setError("");
          dialog.current?.showModal();
          cancel.current?.focus();
        }}
      >
        <RotateCcw size={14} aria-hidden="true" /> Reset Workspace
      </button>
      <dialog
        ref={dialog}
        className="studio-reset-dialog"
        aria-labelledby="workspace-reset-title"
        aria-describedby="workspace-reset-description"
        onCancel={(event) => {
          if (locked.current) event.preventDefault();
        }}
      >
        <h2 id="workspace-reset-title">Reset this workspace?</h2>
        <p id="workspace-reset-description">
          This permanently clears saved campaigns, uploaded brief content, agent
          results, conversations, saved considerations, strategy drafts,
          approvals and generated briefs from this workspace.
        </p>
        <p>
          Your original files and API credentials will remain untouched. This
          cannot be undone.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="studio-reset-actions">
          <button
            ref={cancel}
            type="button"
            className="button"
            disabled={resetting}
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button studio-reset-confirm"
            disabled={disabled || resetting}
            onClick={() => void confirm()}
          >
            {resetting ? "Clearing workspace…" : "Clear Workspace"}
          </button>
        </div>
      </dialog>
    </>
  );
}
