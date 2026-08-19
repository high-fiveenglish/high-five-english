import { useEffect, useState } from "react";
import { MessageCircle, ClipboardCheck, ChevronUp } from "lucide-react";

export function FloatingSideButtons({
  onOpenLevelTest,
  onOpenContact,
}: {
  onOpenLevelTest: () => void;
  onOpenContact: () => void;
}) {
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="fixed right-4 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-3 sm:right-6">
      <button
        onClick={onOpenContact}
        aria-label="카카오톡 · 위챗 상담"
        className="group flex w-16 flex-col items-center gap-1 rounded-2xl bg-kakao px-2 py-3 text-center shadow-[0_8px_24px_rgba(0,0,0,0.15)] transition hover:-translate-y-0.5 sm:w-[72px]"
      >
        <MessageCircle size={22} className="text-kakao-text" strokeWidth={2.2} />
        <span className="text-[11px] font-bold leading-tight text-kakao-text">
          카카오톡
          <br />
          상담
        </span>
      </button>

      <button
        onClick={onOpenLevelTest}
        aria-label="무료 레벨테스트 신청"
        className="group flex w-16 flex-col items-center gap-1 rounded-2xl bg-gradient-to-b from-accent-400 to-accent-600 px-2 py-3 text-center shadow-[0_8px_24px_rgba(248,114,26,0.35)] transition hover:-translate-y-0.5 sm:w-[72px]"
      >
        <ClipboardCheck size={22} className="text-white" strokeWidth={2.2} />
        <span className="text-[11px] font-bold leading-tight text-white">
          레벨테스트
          <br />
          신청
        </span>
      </button>

      {showTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="맨 위로"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-brand-700 shadow-[0_8px_20px_rgba(20,44,88,0.12)] transition hover:-translate-y-0.5 hover:text-brand-900"
        >
          <ChevronUp size={20} />
        </button>
      )}
    </div>
  );
}
