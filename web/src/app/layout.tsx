import type { Metadata } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/belay/toaster";
import { AppShell } from "@/components/layout/shell";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { navData } from "@/lib/data";
import { siteDescription } from "@/lib/extensions";
import { activeKinds } from "@/lib/extensions.server";
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

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Belay", description: siteDescription(activeKinds().map((k) => k.id)) };
}

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
          <AppShell live={nav.live} seeds={nav.seeds} active={activeKinds().map((k) => k.id)}>
            {children}
          </AppShell>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
