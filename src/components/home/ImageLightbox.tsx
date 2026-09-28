import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// 홈페이지 카드 안의 작은 이미지/플레이스홀더를 클릭하면 팝업(모달)으로 크게 볼 수
// 있게 감싸는 공용 래퍼. fullSrc를 주면 그 원본 이미지를 그대로 크게 보여주고,
// 없으면(아직 실제 이미지가 없는 플레이스홀더) children을 더 큰 컨테이너 안에 다시
// 렌더링해 확대된 형태로 보여준다.
export function ImageLightbox({
  children,
  label,
  fullSrc,
}: {
  children: ReactNode;
  label: string;
  fullSrc?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full cursor-zoom-in text-left"
        aria-label={`${label} 크게 보기`}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/70 p-4 sm:p-8"
            onClick={() => setOpen(false)}
          >
            <div
              className="relative max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-5 py-3 backdrop-blur">
                <p className="text-sm font-bold text-brand-950">{label}</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  aria-label="닫기"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-4">
                {fullSrc ? (
                  <img src={fullSrc} alt={label} className="w-full rounded-lg" />
                ) : (
                  children
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
