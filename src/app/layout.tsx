import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { ThemeProvider } from "next-themes";
import AppHeader from "@/components/layout/AppHeader";
import AppSidebar from "@/components/layout/AppSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Montserrat ships a Vietnamese subset, so diacritics render in the same font.
const sans = Montserrat({
  variable: "--font-app-sans",
  subsets: ["latin", "vietnamese"],
});

export const metadata: Metadata = {
  title: { default: "ScriptTalk: luyện nói tiếng Anh", template: "%s · ScriptTalk" },
  description: "Luyện nói tiếng Anh: hội thoại theo kịch bản tự soạn và nhiều chế độ luyện tập khác.",
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
          <TooltipProvider delayDuration={300}>
            <SidebarProvider>
              <AppSidebar />
              <SidebarInset>
                <AppHeader />
                <div className="flex flex-1 flex-col">{children}</div>
              </SidebarInset>
            </SidebarProvider>
          </TooltipProvider>
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
