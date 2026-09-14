import { useTranslation } from "react-i18next";
import { BookOpen } from "lucide-react";
import type { ClassroomTextbook } from "../../data/classroomMock";

export function TextbookInfoCard({ textbook }: { textbook: ClassroomTextbook }) {
  const { t } = useTranslation("classroom");

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)]">
      <h3 className="text-sm font-bold text-brand-950">{t("textbook_card.title")}</h3>

      <div className="mt-4 flex items-center gap-4">
        <div
          className={`flex h-16 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm ${textbook.gradient}`}
        >
          <BookOpen size={20} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-brand-950">{textbook.title}</p>
          <p className="text-xs text-slate-400">{textbook.publisher}</p>
          <p className="mt-1 text-xs font-semibold text-brand-600">
            {textbook.currentUnit} · {textbook.currentChapter}
          </p>
        </div>
      </div>
    </div>
  );
}
