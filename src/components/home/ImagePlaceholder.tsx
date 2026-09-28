import type { LucideIcon } from "lucide-react";
import { ImageIcon } from "lucide-react";

// 이미지 자리표시자 — 실제 이미지/영상 에셋이 아직 없는 자리(Hero 영상, Feedback
// 이미지 등)에, 실제 파일이 들어갔을 때의 크기/비율/여백을 그대로 보여주기 위한
// 컴포넌트다. 관리자 업로드 기능이 붙기 전까지 홈페이지에서 계속 이 상태로 보인다.
export function ImagePlaceholder({
  label,
  aspect = "16/10",
  icon: Icon = ImageIcon,
  className = "",
  tone = "brand",
  size = "default",
}: {
  label: string;
  aspect?: string;
  icon?: LucideIcon;
  className?: string;
  tone?: "brand" | "accent" | "white";
  size?: "default" | "compact";
}) {
  const toneClass =
    tone === "accent"
      ? "border-accent-200 bg-accent-50/60 text-accent-500"
      : tone === "white"
        ? "border-slate-200 bg-slate-50 text-slate-400"
        : "border-brand-200 bg-brand-50/60 text-brand-400";
  const sizeClass = size === "compact" ? "gap-1 px-2 py-2" : "gap-2 px-4";
  const iconSize = size === "compact" ? 18 : 28;
  const labelClass = size === "compact" ? "text-[10px] font-semibold leading-snug" : "text-xs font-bold leading-snug";

  return (
    <div
      style={{ aspectRatio: aspect }}
      className={`flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center ${sizeClass} ${toneClass} ${className}`}
    >
      <Icon size={iconSize} strokeWidth={1.5} />
      <span className={labelClass}>{label}</span>
    </div>
  );
}
