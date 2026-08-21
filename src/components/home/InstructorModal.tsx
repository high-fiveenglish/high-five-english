import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play } from "lucide-react";
import { Modal } from "../ui/Modal";
import type { Instructor } from "../../data/instructors";
import { useLanguage } from "../../context/LanguageContext";
import { LEVEL_LABELS } from "../../data/textbookCatalog";

export function InstructorModal({
  instructor,
  onClose,
}: {
  instructor: Instructor | null;
  onClose: () => void;
}) {
  const { t } = useTranslation(["home", "classroom"]);
  const { lang } = useLanguage();
  const weekdayLabels = t("weekdays_short", { ns: "classroom", returnObjects: true }) as string[];
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const handleClose = () => {
    audioRef.current?.pause();
    setPlaying(false);
    onClose();
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      void audio.play();
    }
  };

  return (
    <Modal
      open={!!instructor}
      onClose={handleClose}
      title={t("instructors.modal.title")}
      maxWidth="max-w-lg"
    >
      {instructor && (
        <div>
          <div className="flex items-center gap-4">
            {instructor.photoUrl ? (
              <img
                src={instructor.photoUrl}
                alt=""
                className="h-20 w-20 shrink-0 rounded-2xl object-cover"
              />
            ) : (
              <div
                className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-2xl font-extrabold text-white ${instructor.gradient}`}
              >
                {(lang === "ko" ? instructor.name : instructor.nameEn)[0]}
              </div>
            )}
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
                {instructor.classFeatures.map((tg) => (
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

          {instructor.audioSrc && (
            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={playing ? t("instructors.modal.pause_label") : t("instructors.modal.play_label")}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700"
                >
                  {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
                </button>
                <p className="text-xs font-bold text-slate-500">{t("instructors.modal.audio_label")}</p>
              </div>
              <audio
                ref={audioRef}
                className="mt-3 w-full"
                controls
                src={instructor.audioSrc}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
              >
                {t("instructors.modal.audio_unsupported")}
              </audio>
            </div>
          )}

          <p className="mt-5 text-sm leading-relaxed text-slate-600">{instructor.bio}</p>

          {instructor.teachingStyle && (
            <p className="mt-3 rounded-xl bg-accent-50/60 px-3.5 py-2.5 text-[13px] font-medium leading-relaxed text-accent-700">
              {instructor.teachingStyle}
            </p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-4">
            <div>
              <p className="mb-1.5 text-xs font-bold text-slate-500">{t("instructors.modal.hours_label")}</p>
              <p className="text-sm text-slate-600">{instructor.availableHours || "—"}</p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-bold text-slate-500">{t("instructors.modal.days_label")}</p>
              <p className="text-sm text-slate-600">
                {instructor.availableDays.length > 0
                  ? instructor.availableDays.map((d) => weekdayLabels[d]).join(", ")
                  : "—"}
              </p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-bold text-slate-500">{t("instructors.modal.specialties_label")}</p>
              <p className="text-sm text-slate-600">{instructor.specialties.join(", ") || "—"}</p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-bold text-slate-500">{t("instructors.modal.levels_label")}</p>
              <p className="text-sm text-slate-600">
                {instructor.levels.map((l) => LEVEL_LABELS[l]).join(", ") || "—"}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-xs font-bold text-slate-500">{t("instructors.modal.career_label")}</p>
            <ul className="space-y-1.5">
              {instructor.career.map((c) => (
                <li key={c} className="flex items-start gap-2 text-sm text-slate-600">
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
