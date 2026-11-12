"use client";

import { AudioLinesIcon, EyeIcon, EyeOffIcon, Loader2Icon, LockKeyholeIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function LoginForm({ next, misconfigured }: { next: string; misconfigured: boolean }) {
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        // Full navigation so the new cookie is sent with the next request.
        window.location.assign(next);
        return;
      }
      setError(res.status === 401 ? "Mã truy cập không đúng." : "Không đăng nhập được. Thử lại sau.");
    } catch {
      setError("Không kết nối được tới server.");
    }
    setLoading(false);
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <AudioLinesIcon className="size-5" />
        </div>
        <CardTitle className="text-xl">
          Script<span className="text-primary">Talk</span>
        </CardTitle>
        <CardDescription>Nhập mã truy cập để tiếp tục.</CardDescription>
      </CardHeader>
      <CardContent>
        {misconfigured ? (
          <p className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            Server chưa đặt biến môi trường APP_ACCESS_CODE nên trang đang bị khoá. Thêm biến này (ví dụ trong cài đặt
            Environment Variables của Vercel) rồi deploy lại.
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="relative">
              <Input
                type={showCode ? "text" : "password"}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Mã truy cập"
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                aria-invalid={!!error}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShowCode((v) => !v)}
                aria-label={showCode ? "Ẩn mã truy cập" : "Hiện mã truy cập"}
                aria-pressed={showCode}
                title={showCode ? "Ẩn mã" : "Hiện mã"}
              >
                {showCode ? <EyeOffIcon /> : <EyeIcon />}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={!code || loading}>
              {loading ? <Loader2Icon className="animate-spin" /> : <LockKeyholeIcon />} Vào ứng dụng
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
