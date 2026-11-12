import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import DueReviewBanner from "@/components/phrases/DueReviewBanner";
import ProgressOverview from "@/components/progress/ProgressOverview";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FEATURES } from "@/lib/features";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Luyện nói tiếng Anh, <span className="text-primary">mỗi ngày một chút</span>
        </h1>
        <p className="mt-3 text-muted-foreground">
          Chọn một chế độ để bắt đầu. Mọi thứ chạy ngay trên trình duyệt: máy đọc, bạn nói, và bạn biết ngay mình nói
          đúng tới đâu.
        </p>
      </div>

      <DueReviewBanner />
      <ProgressOverview />

      <div className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => {
          const ready = f.status === "ready";
          const card = (
            <Card
              className={cn(
                "h-full transition",
                ready ? "hover:shadow-md hover:ring-primary/40" : "opacity-75",
              )}
            >
              <CardHeader>
                <div className="mb-2 flex items-center justify-between">
                  <div
                    className={cn(
                      "flex size-10 items-center justify-center rounded-xl",
                      ready ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    )}
                  >
                    <f.icon className="size-5" />
                  </div>
                  {!ready && <Badge variant="secondary">Sắp ra mắt</Badge>}
                </div>
                <CardTitle className="text-lg">{f.title}</CardTitle>
                <CardDescription>{f.description}</CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto border-t-0 bg-transparent">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-sm font-medium",
                    ready ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {ready ? "Bắt đầu" : "Xem trước"} <ArrowRightIcon className="size-4" />
                </span>
              </CardFooter>
            </Card>
          );
          return (
            <Link
              key={f.id}
              href={f.href}
              className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {card}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
