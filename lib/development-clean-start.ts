// Deliberately narrow: never remove unrelated origin storage or credentials.
export function isWorkspaceStorageKey(key: string): boolean {
  return (
    key === "xc-insight-studio-v1" ||
    key === "xc-strategy-session-v1" ||
    key === "xc-insight-discovery-v1" ||
    key.startsWith("xc-insight-discovery-v2:") ||
    key.startsWith("xc-saved-project-v1:")
  );
}

export function clearWorkspaceStorage(storage: Storage): void {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
  for (const key of keys)
    if (key && isWorkspaceStorageKey(key)) storage.removeItem(key);
}

// Retained for older imports, intentionally non-destructive in every mode.
// Clearing workspace data must be a separate, explicit user action.
export function initializeDevelopmentWorkspace(): Promise<void> {
  return Promise.resolve();
}
