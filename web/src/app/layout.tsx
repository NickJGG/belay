import type { Metadata } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { SearchPalette } from "@/components/layout/search";
import { AppShell } from "@/components/layout/shell";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { navData } from "@/lib/data";
import "katex/dist/katex.min.css";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Belay",
  description: "Projects, grills and courses, worked through Claude Code sessions.",
};

/** The shell wraps every page, Not found included, so the sidebar, Tabs and Drawer stay put across them. */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const nav = await navData();
  return (
    <html
      lang="en"
      className={`${inter.variable} ${interTight.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>
          <AppShell live={nav.live} seeds={nav.seeds}>
            {children}
          </AppShell>
          <SearchPalette />
        </ThemeProvider>
      </body>
    </html>
  );
}
