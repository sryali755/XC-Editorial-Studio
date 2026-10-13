import type { StrategySession } from "./types";

export interface SavedProject {
  version: 1;
  id: string;
  name: string;
  savedAt: string;
  session: StrategySession;
}
const prefix = "xc-saved-project-v1:";
export function readProjects(storage: Storage): SavedProject[] {
  const projects: SavedProject[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    try {
      const project = JSON.parse(storage.getItem(key)!);
      if (
        project.version === 1 &&
        typeof project.name === "string" &&
        typeof project.savedAt === "string" &&
        project.id === key.slice(prefix.length) &&
        project.session?.pack &&
        project.session?.preparation &&
        Array.isArray(project.session.outputs) &&
        Array.isArray(project.session.selected) &&
        Array.isArray(project.session.synthesis) &&
        project.session.execution
      )
        projects.push(project);
    } catch {
      // A damaged entry must not hide other projects or be overwritten.
    }
  }
  return projects.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
export function saveProject(
  storage: Storage,
  name: string,
  session: StrategySession,
) {
  if (!name.trim()) throw new Error("Give this snapshot a name.");
  const project: SavedProject = {
    version: 1,
    id: crypto.randomUUID(),
    name: name.trim(),
    savedAt: new Date().toISOString(),
    session: structuredClone(session),
  };
  storage.setItem(prefix + project.id, JSON.stringify(project));
  return project;
}
