"use client";
import type { ReactNode } from "react";

// Compatibility for older imports. Reload now restores work; it never clears it.
export default function DevelopmentCleanStart({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
