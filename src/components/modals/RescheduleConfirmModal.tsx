import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import type { Lesson } from "../../lib/scheduling/types";
import { requestReschedule } from "../../services/classroomService";
import { useAuth } from "../../context/AuthContext";

function formatDate(iso: string, weekdayLabels: string[]) {
  const [y, m, d] = iso.split("-");
  const weekday = weekdayLabels[new Date(iso + "T00:00:00Z").getUTCDay()];
  return `${y}.${Number(m)}.${Number(d)} (${weekday})`;
}

export function RescheduleConfirmModal({
  lesson,
  onClose,
  onRescheduled,
}: {
  lesson: Lesson | null;
  onClose: () => void;
  onRescheduled: (newDate: string) => void;
}) {
  const { actor, isRealAccount, studentApiToken } = useAuth();
  const { t } = useTranslation("classroom");
  const weekdayLabels = t("weekdays_short", { returnObjects: true }) as string[];
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleClose = () => {
    setSubmitting(false);
    setError(null);
    setSubmitted(false);
    setResult(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (!lesson || !actor) return;
    setSubmitting(true);
    setError(null);
    const res = await requestReschedule(actor, lesson.id, "", studentApiToken);
    setSubmitting(false);
    if (!res.ok) {
      setError(t(`service_errors.${res.error.code}`, { ns: "common", defaultValue: t("service_errors.unknown", { ns: "common" }) }));
      return;
    }
    setSubmitted(true);
    // 실제 계정은 admin에 "대체할 새 수업"이라는 개념이 없어(원래 수업이 LEAVE 처리되고
    // 수강 종료일만 연장됨) newDate가 원래 날짜 그대로다 — 그 값을 "새 수업일"인 것처럼
    // 보여주면 틀린 정보라, 실제 계정일 때는 날짜 없이 완료 사실만 보여준다.
    if (!isRealAccount) setResult(res.value.newDate);
    onRescheduled(res.value.newDate);
  };

  return (
    <Modal open={!!lesson} onClose={handleClose} title={t("reschedule_modal.title")}>
      {lesson && !submitted && (
        <div>
          <p className="text-[15px] leading-relaxed text-brand-950">
            <span className="font-bold">{formatDate(lesson.scheduledDate, weekdayLabels)} {lesson.scheduledTime}</span>{" "}
            {t("reschedule_modal.confirm_question")}
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
            {t("reschedule_modal.description")}
          </p>

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
              {t("reschedule_modal.cancel")}
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="flex-1 rounded-lg bg-accent-500 py-2.5 text-sm font-bold text-white transition hover:bg-accent-600 disabled:opacity-60"
            >
              {submitting ? t("reschedule_modal.submitting") : t("reschedule_modal.confirm")}
            </button>
          </div>
        </div>
      )}

      {submitted && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="text-brand-600" size={40} />
          <p className="text-sm text-slate-600">
            {t("reschedule_modal.success_title")}
            {result && (
              <>
                <br />
                {t("reschedule_modal.new_date_label")}: <span className="font-bold text-brand-950">{formatDate(result, weekdayLabels)}</span>
              </>
            )}
          </p>
          <button
            onClick={handleClose}
            className="mt-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {t("reschedule_modal.confirm_ok")}
          </button>
        </div>
      )}
    </Modal>
  );
}
