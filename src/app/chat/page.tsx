import { CheckIcon, MessagesSquareIcon, ScrollTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Trò chuyện tự nhiên",
};

const PLANNED = [
  "Chọn chủ đề hoặc tình huống (phỏng vấn, du lịch, gọi món…) rồi nói chuyện tự do",
  "Máy trả lời bằng giọng nói và hỏi lại để cuộc trò chuyện tiếp diễn",
  "Góp ý ngữ pháp và gợi ý cách nói tự nhiên hơn sau mỗi lượt",
];

export default function ChatPage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <MessagesSquareIcon className="size-7" />
      </div>
      <Badge variant="secondary" className="mb-3">
        Sắp ra mắt
      </Badge>
      <h1 className="text-2xl font-semibold tracking-tight">Trò chuyện tự nhiên</h1>
      <p className="mt-2 text-muted-foreground">
        Nói chuyện tiếng Anh tự do, không cần soạn kịch bản trước. Chế độ này đang được xây dựng.
      </p>

      <ul className="mt-6 grid gap-2.5 text-left text-sm">
        {PLANNED.map((item) => (
          <li key={item} className="flex gap-2.5">
            <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <Button asChild className="mt-8">
        <Link href="/script">
          <ScrollTextIcon /> Luyện theo kịch bản trong lúc chờ
        </Link>
      </Button>
    </div>
  );
}
