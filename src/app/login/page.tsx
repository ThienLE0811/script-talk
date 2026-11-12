import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { authMode, safeNextPath } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Đăng nhập" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const mode = authMode();
  if (mode === "open") redirect(safeNextPath(next));
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 px-4">
      <LoginForm next={safeNextPath(next)} misconfigured={mode === "misconfigured"} />
    </main>
  );
}
