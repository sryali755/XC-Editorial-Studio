import { useState } from "react";
import PackDialog from "./PackDialog";
import { campaignDisplayName } from "@/lib/campaign-display";
import {
  readProjects,
  saveProject,
  type SavedProject,
} from "@/lib/saved-projects";
import type { StrategySession } from "@/lib/types";

export default function SavedProjects({
  session,
  disabled,
  onOpen,
}: {
  session: StrategySession;
  disabled: boolean;
  onOpen: (session: StrategySession) => void;
}) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const hasWork = !!(
    session.preparation.upstreamDraft.trim() ||
    session.outputs.length ||
    session.brief
  );
  function show() {
    setOpen(true);
    setName(
      campaignDisplayName(session.pack.campaignName) || "Untitled project",
    );
    setNotice("");
    setError("");
    try {
      setProjects(readProjects(localStorage));
    } catch {
      setError(
        "This browser is blocking project storage. Your current tab remains open.",
      );
    }
  }
  return (
    <>
      <button className="button small" disabled={disabled} onClick={show}>
        Saved projects
      </button>
      {open && (
        <PackDialog
          title="Saved projects"
          eyebrow="YOUR WORKSPACE"
          onClose={() => setOpen(false)}
        >
          <p className="context-note">
            Save a named snapshot to reopen after closing this tab. Snapshots
            stay in this browser; save again to keep later changes. They are not
            shared with other devices.
          </p>
          <form
            className="project-save"
            onSubmit={(event) => {
              event.preventDefault();
              if (!hasWork || disabled) return;
              try {
                saveProject(localStorage, name, session);
                setProjects(readProjects(localStorage));
                setError("");
                setNotice("Snapshot saved in this browser.");
              } catch {
                setError(
                  "The snapshot could not be saved. Browser storage may be full or blocked. Your current work is still open.",
                );
              }
            }}
          >
            <label className="field">
              <span>Snapshot name</span>
              <input
                value={name}
                maxLength={120}
                required
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button
              className="button primary"
              disabled={disabled || !hasWork || !name.trim()}
            >
              Save snapshot
            </button>
          </form>
          {notice && <p role="status">{notice}</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="saved-project-list">
            {!projects.length && (
              <p className="muted">No saved snapshots yet.</p>
            )}
            {projects.map((project) => (
              <article key={project.id}>
                <div>
                  <h3>{project.name}</h3>
                  <small>
                    Saved {new Date(project.savedAt).toLocaleString()}
                  </small>
                </div>
                <button
                  className="button"
                  disabled={disabled}
                  onClick={() => {
                    try {
                      // Preserve the current working draft before switching projects.
                      if (hasWork)
                        saveProject(
                          localStorage,
                          `${campaignDisplayName(session.pack.campaignName) || "Working draft"} · before switching`,
                          session,
                        );
                      onOpen(structuredClone(project.session));
                      setOpen(false);
                    } catch {
                      setError(
                        "Your current draft could not be saved, so the project was not switched.",
                      );
                    }
                  }}
                >
                  Open snapshot
                </button>
              </article>
            ))}
          </div>
        </PackDialog>
      )}
    </>
  );
}
