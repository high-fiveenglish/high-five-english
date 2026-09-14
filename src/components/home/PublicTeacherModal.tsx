import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play } from "lucide-react";
import { Modal } from "../ui/Modal";
import type { PublicTeacher } from "../../services/instructorService";
import { flagForNationality } from "../../lib/nationalityFlag";

// 홈페이지 강사소개 섹션 전용 상세 모달 — 실제 강사 계정(PublicTeacher) 기반이라
// career[]/specialties[]/levels[]/teachingStyle/availableDays 같은 필드가 없다.
// 학생용 강의실 페이지가 쓰는 InstructorModal(mock 강사 프로필 전용, data/instructors.ts
// 기반)과는 데이터 모양이 달라 분리했다 — 하나로 합치면 서로 무관한 두 기능이 얽힌다.
export function PublicTeacherModal({
  instructor,
  onClose,
}: {
  instructor: PublicTeacher | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("home");
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

  const flag = instructor ? flagForNationality(instructor.nationality) : null;

  return (
    <Modal open={!!instructor} onClose={handleClose} title={t("instructors.modal.title")} maxWidth="max-w-lg">
      {instructor && (
        <div>
          <div className="flex items-center gap-4">
            {instructor.photoUrl ? (
              <img src={instructor.photoUrl} alt="" className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-2xl font-extrabold text-white">
                {instructor.name[0]}
              </div>
            )}
            <div>
              <p className="text-lg font-extrabold text-brand-950">
                {instructor.name}
                {instructor.nickname && (
                  <span className="text-sm font-medium text-slate-400"> ({instructor.nickname})</span>
                )}
              </p>
              {instructor.nationality && (
                <p className="text-sm text-slate-500">
                  {flag && `${flag} `}
                  {instructor.nationality}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {instructor.grade === "SENIOR" && (
                  <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-600">
                    {t("instructors.grade_senior")}
                  </span>
                )}
                {instructor.tesol && (
                  <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-600">
                    {t("instructors.tesol_badge")}
                  </span>
                )}
              </div>
            </div>
          </div>

          {instructor.audioUrl && (
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
                src={instructor.audioUrl}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
              >
                {t("instructors.modal.audio_unsupported")}
              </audio>
            </div>
          )}

          {instructor.bio && <p className="mt-5 text-sm leading-relaxed text-slate-600">{instructor.bio}</p>}

          {instructor.experience && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-bold text-slate-500">{t("instructors.modal.career_label")}</p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{instructor.experience}</p>
            </div>
          )}

          {instructor.workingHours && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-bold text-slate-500">{t("instructors.modal.working_hours_label")}</p>
              <p className="text-sm leading-relaxed text-slate-600">{instructor.workingHours}</p>
            </div>
          )}

          {instructor.videoYoutubeCode && (
            <div className="mt-5 aspect-video overflow-hidden rounded-xl">
              <iframe
                className="h-full w-full"
                src={`https://www.youtube.com/embed/${instructor.videoYoutubeCode}`}
                title={instructor.name}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
