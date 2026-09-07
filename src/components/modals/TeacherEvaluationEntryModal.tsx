import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import type { MyLessonRow } from "../../services/teacherService";
import { submitLessonOutcome, updateEnrollmentLevel } from "../../services/teacherService";
import { useAuth } from "../../context/AuthContext";
import { LEVEL_LABELS, LEVEL_ORDER, type CEFRLevel } from "../../data/textbookCatalog";

// Quick "Evaluation" entry — attendance, textbook progress, the teacher's free-form
// comments, and the student's current level. Openable any time (no date/status
// restriction) and pre-fills from the lesson's current recorded outcome so re-editing an
// already-evaluated lesson starts from what's already there.
export function TeacherEvaluationEntryModal({
  lesson,
  onClose,
  onSubmitted,
}: {
  lesson: MyLessonRow | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { actor } = useAuth();
  const { t } = useTranslation("teacher");
  const [status, setStatus] = useState<"completed" | "absent">("completed");
  const [progress, setProgress] = useState("");
  const [teacherComment, setTeacherComment] = useState("");
  const [level, setLevel] = useState<CEFRLevel>("a1");
  const [levelSaving, setLevelSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!lesson) return;
    setStatus(lesson.status === "absent" ? "absent" : "completed");
    setProgress(lesson.progress ?? "");
    setTeacherComment(lesson.teacherComment ?? "");
    setLevel(lesson.currentLevel);
    setError(null);
    setDone(false);
  }, [lesson]);

  const handleClose = () => {
    setSubmitting(false);
    setError(null);
    setDone(false);
    onClose();
  };

  const handleLevelChange = async (next: CEFRLevel) => {
    if (!lesson || !actor) return;
    const prev = level;
    setLevel(next);
    setLevelSaving(true);
    const res = await updateEnrollmentLevel(actor, lesson.enrollmentId, next);
    setLevelSaving(false);
    if (!res.ok) {
      setLevel(prev);
      setError(t(`service_errors.${res.error.code}`, { ns: "common", defaultValue: t("service_errors.unknown", { ns: "common" }) }));
    }
  };

  const handleSubmit = async () => {
    if (!lesson || !actor) return;
    setSubmitting(true);
    setError(null);
    const res = await submitLessonOutcome(actor, lesson.id, {
      status,
      progress: status === "completed" ? progress : undefined,
      teacherComment: teacherComment,
    });
    setSubmitting(false);
    if (!res.ok) {
      setError(t(`service_errors.${res.error.code}`, { ns: "common", defaultValue: t("service_errors.unknown", { ns: "common" }) }));
      return;
    }
    setDone(true);
    onSubmitted();
  };

  return (
    <Modal open={!!lesson} onClose={handleClose} title={t("eval_entry_modal.title")}>
      {lesson && !done && (
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[15px] font-bold text-brand-950">
              {lesson.scheduledDate} {lesson.scheduledTime} · {lesson.studentName}
            </p>
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-semibold text-slate-500">{t("eval_entry_modal.level_label")}</label>
              <select
                value={level}
                disabled={levelSaving}
                onChange={(e) => handleLevelChange(e.target.value as CEFRLevel)}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-brand-700 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:opacity-60"
              >
                {LEVEL_ORDER.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {LEVEL_LABELS[lvl]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setStatus("completed")}
              className={`flex-1 rounded-lg border py-2.5 text-sm font-bold transition ${
                status === "completed" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500"
              }`}
            >
              {t("eval_entry_modal.attended")}
            </button>
            <button
              onClick={() => setStatus("absent")}
              className={`flex-1 rounded-lg border py-2.5 text-sm font-bold transition ${
                status === "absent" ? "border-red-500 bg-red-50 text-red-600" : "border-slate-200 text-slate-500"
              }`}
            >
              {t("eval_entry_modal.absent")}
            </button>
          </div>

          {status === "completed" && (
            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-600">{t("eval_entry_modal.progress_label")}</label>
              <input
                type="text"
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
                placeholder={t("eval_entry_modal.progress_placeholder")}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          )}

          <div className="mt-4">
            <label className="block text-xs font-semibold text-slate-600">{t("eval_entry_modal.comment_label")}</label>
            <textarea
              value={teacherComment}
              onChange={(e) => setTeacherComment(e.target.value)}
              placeholder={t("eval_entry_modal.comment_placeholder")}
              rows={14}
              className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm leading-relaxed outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <p className="mt-1 text-right text-[11px] text-slate-400">{teacherComment.length}{t("eval_entry_modal.comment_char_suffix")}</p>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3">
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-500" />
              <p className="text-[13px] text-red-600">{error}</p>
            </div>
          )}

          <div className="mt-6 flex gap-2">
            <button
              onClick={handleClose}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600"
            >
              {t("eval_entry_modal.cancel")}
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {submitting ? t("eval_entry_modal.submitting") : t("eval_entry_modal.save")}
            </button>
          </div>
        </div>
      )}

      {done && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="text-brand-600" size={40} />
          <p className="text-sm text-slate-600">{t("eval_entry_modal.success_title")}</p>
          <button
            onClick={handleClose}
            className="mt-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {t("eval_entry_modal.confirm_ok")}
          </button>
        </div>
      )}
    </Modal>
  );
}
