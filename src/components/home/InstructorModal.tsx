import { useTranslation } from "react-i18next";
import { Modal } from "../ui/Modal";
import type { Instructor } from "../../data/instructors";
import { useLanguage } from "../../context/LanguageContext";

export function InstructorModal({
  instructor,
  onClose,
}: {
  instructor: Instructor | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("home");
  const { lang } = useLanguage();

  return (
    <Modal
      open={!!instructor}
      onClose={onClose}
      title={t("instructors.modal.title")}
      maxWidth="max-w-lg"
    >
      {instructor && (
        <div>
          <div className="flex items-center gap-4">
            <div
              className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-2xl font-extrabold text-white ${instructor.gradient}`}
            >
              {(lang === "ko" ? instructor.name : instructor.nameEn)[0]}
            </div>
            <div>
              <p className="text-lg font-extrabold text-brand-950">
                {lang === "ko" ? (
                  <>
                    {instructor.name}{" "}
                    <span className="text-sm font-medium text-slate-400">
                      ({instructor.nameEn})
                    </span>
                  </>
                ) : (
                  instructor.nameEn
                )}
              </p>
              <p className="text-sm text-slate-500">
                {instructor.flag} {instructor.country}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(
                  t(`instructors.bios.${instructor.id}.tags`, { returnObjects: true }) as string[]
                ).map((tg) => (
                  <span
                    key={tg}
                    className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-600"
                  >
                    {tg}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            <p className="mb-2 text-xs font-bold text-slate-500">{t("instructors.modal.audio_label")}</p>
            <audio controls className="w-full" src={instructor.audioSrc}>
              {t("instructors.modal.audio_unsupported")}
            </audio>
            <p className="mt-1.5 text-[11px] text-slate-400">
              {t("instructors.modal.audio_disclaimer")}
            </p>
          </div>

          <p className="mt-5 text-sm leading-relaxed text-slate-600">
            {t(`instructors.bios.${instructor.id}.detail`)}
          </p>

          <div className="mt-5">
            <p className="mb-2 text-xs font-bold text-slate-500">{t("instructors.modal.career_label")}</p>
            <ul className="space-y-1.5">
              {(
                t(`instructors.bios.${instructor.id}.career`, { returnObjects: true }) as string[]
              ).map((c) => (
                <li
                  key={c}
                  className="flex items-start gap-2 text-sm text-slate-600"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}
