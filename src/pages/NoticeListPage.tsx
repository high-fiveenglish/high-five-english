import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Megaphone } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { SeoHead } from "../components/seo/SeoHead";
import { listPublicNotices } from "../services/noticeService";
import type { Notice } from "../lib/community/types";

function formatDate(iso: string) {
  return iso.slice(0, 10);
}

function NoticeRow({ notice }: { notice: Notice }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6 sm:py-5"
      >
        <div>
          <span className="text-[15px] font-bold text-brand-950">{notice.title}</span>
          <span className="ml-3 font-mono text-xs text-slate-400">{formatDate(notice.createdAt)}</span>
        </div>
        <ChevronDown
          size={18}
          className={`shrink-0 text-slate-400 transition ${open ? "rotate-180 text-brand-600" : ""}`}
        />
      </button>
      {open && (
        <div className="whitespace-pre-line px-5 pb-5 text-[14px] leading-relaxed text-slate-500 sm:px-6">
          {notice.content}
        </div>
      )}
    </div>
  );
}

export function NoticeListPage() {
  const { t } = useTranslation("notices");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listPublicNotices().then((rows) => {
      setNotices(rows);
      setLoading(false);
    });
  }, []);

  return (
    <section className="bg-slate-50/60 py-14 sm:py-20">
      <SeoHead titleKey="meta.title" descriptionKey="meta.description" ns="notices" path="/notice" />
      <Container className="max-w-3xl">
        <SectionHeading eyebrow={t("eyebrow")} title={t("title")} align="left" />

        <div className="mt-8 space-y-3">
          {loading && <p className="text-sm text-slate-400">{t("loading")}</p>}
          {!loading && notices.length === 0 && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white py-16 text-center">
              <Megaphone size={28} className="text-slate-300" />
              <p className="text-sm text-slate-400">{t("empty")}</p>
            </div>
          )}
          {notices.map((n) => (
            <NoticeRow key={n.id} notice={n} />
          ))}
        </div>
      </Container>
    </section>
  );
}
