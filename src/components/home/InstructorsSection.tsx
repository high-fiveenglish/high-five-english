import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Volume2 } from "lucide-react";
import { Container } from "../ui/Container";
import { SectionHeading } from "../ui/SectionHeading";
import type { Instructor } from "../../data/instructors";
import { listPublicInstructors } from "../../services/instructorService";
import { useLanguage } from "../../context/LanguageContext";
import { InstructorModal } from "./InstructorModal";

export function InstructorsSection() {
  const { t } = useTranslation("home");
  const { lang } = useLanguage();
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [selected, setSelected] = useState<Instructor | null>(null);

  useEffect(() => {
    listPublicInstructors().then(setInstructors);
  }, []);

  return (
    <section id="instructors" className="scroll-mt-28 bg-white py-20 sm:py-24">
      <Container>
        <SectionHeading
          eyebrow={t("instructors.eyebrow")}
          title={t("instructors.title")}
          description={t("instructors.description")}
        />

        <div className="mt-12 grid grid-cols-2 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {instructors.map((ins) => (
            <button
              key={ins.id}
              onClick={() => setSelected(ins)}
              className="group text-left"
            >
              <div
                className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br shadow-[0_10px_30px_rgba(20,44,88,0.12)] transition duration-300 group-hover:-translate-y-1.5 group-hover:shadow-[0_18px_38px_rgba(20,44,88,0.2)] ${ins.gradient}`}
              >
                {ins.photoUrl ? (
                  <img src={ins.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-5xl font-extrabold text-white/90">
                    {(lang === "ko" ? ins.name : ins.nameEn)[0]}
                  </span>
                )}
                <span className="absolute right-3 top-3 rounded-full bg-white/90 px-2 py-1 text-[11px] font-bold text-brand-700">
                  {ins.flag}
                </span>
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-brand-950/40 py-2.5 opacity-0 backdrop-blur-sm transition group-hover:opacity-100">
                  <Volume2 size={14} className="text-white" />
                  <span className="text-xs font-semibold text-white">
                    {t("instructors.listen_hover")}
                  </span>
                </div>
              </div>
              <p className="mt-3 text-[15px] font-bold text-brand-950">
                {lang === "ko" ? (
                  <>
                    {ins.name}{" "}
                    <span className="text-xs font-medium text-slate-400">{ins.nameEn}</span>
                  </>
                ) : (
                  ins.nameEn
                )}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-400">
                {ins.classFeatures.join(" · ")}
              </p>
            </button>
          ))}
        </div>
      </Container>

      <InstructorModal instructor={selected} onClose={() => setSelected(null)} />
    </section>
  );
}
