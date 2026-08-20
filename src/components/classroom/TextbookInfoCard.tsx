import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Download, ExternalLink } from "lucide-react";
import type { ClassroomTextbook } from "../../data/classroomMock";

export function TextbookInfoCard({ textbook }: { textbook: ClassroomTextbook }) {
  const { t } = useTranslation("classroom");
  const [notice, setNotice] = useState<string | null>(null);

  const showNotice = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(null), 2500);
  };

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

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => showNotice(t("textbook_card.view_online_notice"))}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-600 transition hover:border-brand-300"
        >
          <ExternalLink size={13} /> {t("textbook_card.view_online")}
        </button>
        <button
          onClick={() => showNotice(t("textbook_card.download_notice"))}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-50 py-2 text-xs font-bold text-brand-700 transition hover:bg-brand-100"
        >
          <Download size={13} /> {t("textbook_card.download")}
        </button>
      </div>

      {notice && (
        <p className="mt-2.5 text-center text-[11px] font-medium text-accent-600">{notice}</p>
      )}
    </div>
  );
}
