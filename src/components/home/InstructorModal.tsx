import { Modal } from "../ui/Modal";
import type { Instructor } from "../../data/instructors";

export function InstructorModal({
  instructor,
  onClose,
}: {
  instructor: Instructor | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={!!instructor}
      onClose={onClose}
      title="강사 소개"
      maxWidth="max-w-lg"
    >
      {instructor && (
        <div>
          <div className="flex items-center gap-4">
            <div
              className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-2xl font-extrabold text-white ${instructor.gradient}`}
            >
              {instructor.name[0]}
            </div>
            <div>
              <p className="text-lg font-extrabold text-brand-950">
                {instructor.name}{" "}
                <span className="text-sm font-medium text-slate-400">
                  ({instructor.nameEn})
                </span>
              </p>
              <p className="text-sm text-slate-500">
                {instructor.flag} {instructor.country}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {instructor.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-600"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            <p className="mb-2 text-xs font-bold text-slate-500">🔊 음성 소개 듣기</p>
            <audio controls className="w-full" src={instructor.audioSrc}>
              브라우저가 오디오 재생을 지원하지 않습니다.
            </audio>
            <p className="mt-1.5 text-[11px] text-slate-400">
              * 데모용 샘플 음성입니다. 실제 강사 음성 소개로 교체될 예정입니다.
            </p>
          </div>

          <p className="mt-5 text-sm leading-relaxed text-slate-600">
            {instructor.detail}
          </p>

          <div className="mt-5">
            <p className="mb-2 text-xs font-bold text-slate-500">이력 및 자격</p>
            <ul className="space-y-1.5">
              {instructor.career.map((c) => (
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
