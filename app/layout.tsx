import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "XC · Insight Discovery",
  description: "AI prepares. Kevin decides. AI packages.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
