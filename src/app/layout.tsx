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
    <html lang="vi" suppressHydrationWarning>
      <body className={`${sans.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          <Toaster position="top-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
