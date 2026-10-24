import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AniQuotes 4K — Admin",
  description: "Owner-only wallpaper catalog management",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
