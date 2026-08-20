import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Star } from "lucide-react";
import { Modal } from "../ui/Modal";
import type { Lesson, DailyEvaluation, SkillRating } from "../../lib/scheduling/types";
import { getEvaluation } from "../../services/classroomService";
import { useAuth } from "../../context/AuthContext";

function SkillRow({ label, rating }: { label: string; rating: SkillRating }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500">{label}</span>
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              size={12}
              className={i < rating.score ? "fill-accent-400 text-accent-400" : "fill-slate-200 text-slate-200"}
            />
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-600">{rating.comment}</p>
    </div>
  );
}

export function EvaluationDetailModal({
  lesson,
  onClose,
}: {
  lesson: Lesson | null;
  onClose: () => void;
}) {
  const { actor } = useAuth();
  const { t } = useTranslation("classroom");
  const [evaluation, setEvaluation] = useState<DailyEvaluation | null>(null);

  useEffect(() => {
    if (!lesson || !actor) return;
    let cancelled = false;
    getEvaluation(actor, lesson.id).then((res) => {
      if (!cancelled && res.ok) setEvaluation(res.value);
    });
    return () => {
      cancelled = true;
    };
  }, [lesson, actor]);

  return (
    <Modal open={!!lesson} onClose={onClose} title={t("evaluation_modal.title")} maxWidth="max-w-lg">
      {lesson && !evaluation && (
        <p className="py-8 text-center text-sm text-slate-400">{t("evaluation_modal.loading")}</p>
      )}
      {evaluation && (
        <div>
          <p className="text-xs text-slate-400">{lesson?.scheduledDate}</p>
          <p className="mt-4 text-xs font-bold text-slate-500">{t("evaluation_modal.lesson_content")}</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-slate-600">{evaluation.lessonSummary}</p>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-xl bg-emerald-50 p-3.5">
              <p className="text-xs font-bold text-emerald-700">{t("evaluation_modal.strengths")}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-emerald-800">{evaluation.strengths}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3.5">
              <p className="text-xs font-bold text-amber-700">{t("evaluation_modal.improvements")}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-amber-800">{evaluation.improvements}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <SkillRow label={t("evaluation_modal.pronunciation")} rating={evaluation.pronunciation} />
            <SkillRow label={t("evaluation_modal.grammar")} rating={evaluation.grammar} />
            <SkillRow label={t("evaluation_modal.vocabulary")} rating={evaluation.vocabulary} />
            <SkillRow label={t("evaluation_modal.speaking")} rating={evaluation.speaking} />
          </div>

          <div className="mt-4 rounded-xl bg-brand-50/60 p-4">
            <p className="text-xs font-bold text-brand-700">{t("evaluation_modal.teacher_comment")}</p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-brand-900">{evaluation.teacherComment}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
