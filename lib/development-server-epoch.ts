import "server-only";

// Persist through development module reloads; a new Node process gets a new ID.
const server = globalThis as typeof globalThis & {
  __xcDevelopmentServerEpoch?: string;
};

export function developmentServerEpoch(): string | undefined {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.XC_OFFLINE_TEST === "1"
  )
    return undefined;
  return (server.__xcDevelopmentServerEpoch ??= crypto.randomUUID());
}
