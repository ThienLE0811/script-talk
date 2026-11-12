import { MessagesSquareIcon, NotebookPenIcon, ScrollTextIcon, type LucideIcon } from "lucide-react";

export type FeatureStatus = "ready" | "soon";

export type Feature = {
  id: string;
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
  status: FeatureStatus;
};

/**
 * Every practice mode in the app. The sidebar, the home page and the header
 * breadcrumb all read from this list, so adding a mode = adding an entry here
 * plus its route under src/app/<href>/page.tsx.
 */
export const FEATURES: Feature[] = [
  {
    id: "script",
    title: "Luyện theo kịch bản",
    href: "/script",
    icon: ScrollTextIcon,
    description: "Tự soạn hội thoại, máy đóng các vai còn lại, bạn nói phần của mình và được chấm từng từ.",
    status: "ready",
  },
  {
    id: "chat",
    title: "Trò chuyện tự nhiên",
    href: "/chat",
    icon: MessagesSquareIcon,
    description: "Nói chuyện tự do với AI theo chủ đề bạn chọn, được góp ý ngữ pháp sau mỗi câu.",
    status: "ready",
  },
  {
    id: "phrases",
    title: "Sổ tay câu",
    href: "/phrases",
    icon: NotebookPenIcon,
    description: "Các câu đã được sửa và câu còn nói chưa tốt, ôn lại theo lịch để nhớ lâu: nghe mẫu, nói lại, chấm điểm.",
    status: "ready",
  },
];

export function findFeature(pathname: string): Feature | undefined {
  return FEATURES.find((f) => pathname === f.href || pathname.startsWith(f.href + "/"));
}
