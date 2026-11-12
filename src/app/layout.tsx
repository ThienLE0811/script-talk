import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Montserrat ships a Vietnamese subset, so diacritics render in the same font.
const sans = Montserrat({
  variable: "--font-app-sans",
  subsets: ["latin", "vietnamese"],
});

export const metadata: Metadata = {
  title: "ScriptTalk: luyện hội thoại tiếng Anh",
  description: "Soạn kịch bản, máy đóng một vai, bạn đóng vai còn lại.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The font variable must live on <html>: the root font-family rule reads it there,
    // and if it is only defined on <body> the root falls back to the browser default (Times).
    <html lang="vi" className={sans.variable} suppressHydrationWarning>
      {/* Browser extensions (Grammarly, ColorZilla...) inject attributes on <body> before hydration. */}
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
