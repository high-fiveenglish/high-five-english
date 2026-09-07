import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import type { MyLessonRow } from "../../services/teacherService";
import { holdLesson } from "../../services/teacherService";
import { useAuth } from "../../context/AuthContext";

export function TeacherHoldModal({
  lesson,
  onClose,
  onHeld,
}: {
  lesson: MyLessonRow | null;
  onClose: () => void;
  onHeld: (newDate: string) => void;
}) {
  const { actor } = useAuth();
  const { t } = useTranslation("teacher");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const handleClose = () => {
    setReason("");
    setSubmitting(false);
    setError(null);
    setResult(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (!lesson || !actor || !reason.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await holdLesson(actor, lesson.id, reason.trim());
    setSubmitting(false);
    if (!res.ok) {
      setError(t(`service_errors.${res.error.code}`, { ns: "common", defaultValue: t("service_errors.unknown", { ns: "common" }) }));
      return;
    }
    setResult(res.value.newDate);
    onHeld(res.value.newDate);
  };

  return (
    <Modal open={!!lesson} onClose={handleClose} title={t("hold_modal.title")}>
      {lesson && !result && (
        <div>
          <p className="text-[15px] leading-relaxed text-brand-950">
            <span className="font-bold">
              {lesson.scheduledDate} {lesson.scheduledTime} · {lesson.studentName}
            </span>{" "}
            {t("hold_modal.confirm_question")}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{t("hold_modal.description")}</p>

          <label className="mt-4 block text-xs font-semibold text-slate-600">{t("hold_modal.reason_label")}</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("hold_modal.reason_placeholder")}
            rows={3}
            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />

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
              {t("hold_modal.cancel")}
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting || !reason.trim()}
              className="flex-1 rounded-lg bg-accent-500 py-2.5 text-sm font-bold text-white transition hover:bg-accent-600 disabled:opacity-60"
            >
              {submitting ? t("hold_modal.submitting") : t("hold_modal.confirm")}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="text-brand-600" size={40} />
          <p className="text-sm text-slate-600">
            {t("hold_modal.success_title")}
            <br />
            {t("hold_modal.new_date_label")}: <span className="font-bold text-brand-950">{result}</span>
          </p>
          <button
            onClick={handleClose}
            className="mt-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {t("hold_modal.confirm_ok")}
          </button>
        </div>
      )}
    </Modal>
  );
}
