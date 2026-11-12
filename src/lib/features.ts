import { MessagesSquareIcon, ScrollTextIcon, type LucideIcon } from "lucide-react";

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
    description: "Nói chuyện tự do theo chủ đề bạn chọn, không cần kịch bản soạn trước.",
    status: "soon",
  },
];

export function findFeature(pathname: string): Feature | undefined {
  return FEATURES.find((f) => pathname === f.href || pathname.startsWith(f.href + "/"));
}
