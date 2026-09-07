import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Megaphone } from "lucide-react";
import { Container } from "../ui/Container";
import { SectionHeading } from "../ui/SectionHeading";
import { listPublishedHomeNotices } from "../../services/homeNoticeService";
import type { HomeNotice } from "../../lib/community/types";

function formatDate(iso: string) {
  return iso.slice(0, 10);
}

export function HomeNoticesSection() {
  const { t } = useTranslation("home");
  const [notices, setNotices] = useState<HomeNotice[]>([]);

  useEffect(() => {
    listPublishedHomeNotices().then(setNotices);
  }, []);

  if (notices.length === 0) return null;

  return (
    <section id="notices" className="bg-slate-50/60 py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow={t("notices.eyebrow")}
          title={t("notices.title")}
          description={t("notices.description")}
        />

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {notices.map((n) => (
            <div
              key={n.id}
              className="flex flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)] transition hover:-translate-y-1 hover:shadow-[0_16px_34px_rgba(20,44,88,0.12)]"
            >
              <Megaphone size={22} className="text-brand-200" />
              <p className="mt-3 text-sm font-bold text-brand-950">{n.title}</p>
              <p className="mt-2 flex-1 whitespace-pre-line text-[13.5px] leading-relaxed text-slate-600">
                {n.content}
              </p>
              <p className="mt-5 border-t border-slate-50 pt-4 text-[11px] font-medium text-slate-400">
                {formatDate(n.createdAt)}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
