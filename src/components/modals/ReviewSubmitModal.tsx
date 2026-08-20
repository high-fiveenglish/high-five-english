import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import { useAuth } from "../../context/AuthContext";
import { submitReview } from "../../services/reviewService";

export function ReviewSubmitModal({
  open,
  teacherName,
  onClose,
}: {
  open: boolean;
  /** The student's own active-enrollment teacher, resolved by ClassroomPage — shown
   * read-only so the student can see who they're reviewing but can't type a different
   * name in (the actual authored teacherId is always resolved server-side too). */
  teacherName: string;
  onClose: () => void;
}) {
  const { actor } = useAuth();
  const { t } = useTranslation("classroom");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleClose = () => {
    setContent("");
    setError(null);
    setSuccess(false);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !actor) {
      setError(t("review_modal.validation_error"));
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await submitReview(actor, { content });
    setSubmitting(false);
    if (!result.ok) {
      setError(t(`service_errors.${result.error.code}`, { ns: "common", defaultValue: t("service_errors.unknown", { ns: "common" }) }));
      return;
    }
    setSuccess(true);
  };

  return (
    <Modal open={open} onClose={handleClose} title={t("review_modal.title")}>
      {success ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="text-brand-600" size={40} />
          <p className="text-sm text-slate-600">{t("review_modal.success")}</p>
          <button
            onClick={handleClose}
            className="mt-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {t("review_modal.confirm_ok")}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <p className="text-sm leading-relaxed text-slate-500">{t("review_modal.intro")}</p>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              {t("review_modal.teacher_label")}
            </label>
            <input
              type="text"
              value={teacherName}
              disabled
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">
              {t("review_modal.content_label")}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder={t("review_modal.content_placeholder")}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          {error && <p className="text-[13px] text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 w-full rounded-lg bg-accent-500 py-3 text-sm font-semibold text-white transition hover:bg-accent-600 disabled:opacity-60"
          >
            {submitting ? t("review_modal.submitting") : t("review_modal.submit")}
          </button>
        </form>
      )}
    </Modal>
  );
}
