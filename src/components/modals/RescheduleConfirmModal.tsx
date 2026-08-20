import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import type { Lesson } from "../../lib/scheduling/types";
import { requestReschedule } from "../../services/classroomService";
import { useAuth } from "../../context/AuthContext";

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(iso + "T00:00:00Z").getUTCDay()];
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
  const { actor } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const handleClose = () => {
    setSubmitting(false);
    setError(null);
    setResult(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (!lesson || !actor) return;
    setSubmitting(true);
    setError(null);
    const res = await requestReschedule(actor, lesson.id, "");
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setResult(res.value.newDate);
    onRescheduled(res.value.newDate);
  };

  return (
    <Modal open={!!lesson} onClose={handleClose} title="수업 연기">
      {lesson && !result && (
        <div>
          <p className="text-[15px] leading-relaxed text-brand-950">
            <span className="font-bold">{formatDate(lesson.scheduledDate)} {lesson.scheduledTime}</span>{" "}
            수업을 연기하시겠습니까?
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
            연기하면 수업 횟수는 차감되지 않고, 요일 패턴에 맞는 다음 가능한 날짜로 자동 배정됩니다.
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
              취소
            </button>
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="flex-1 rounded-lg bg-accent-500 py-2.5 text-sm font-bold text-white transition hover:bg-accent-600 disabled:opacity-60"
            >
              {submitting ? "처리 중..." : "연기하기"}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="text-brand-600" size={40} />
          <p className="text-sm text-slate-600">
            수업이 연기되었습니다.
            <br />
            새 수업일: <span className="font-bold text-brand-950">{formatDate(result)}</span>
          </p>
          <button
            onClick={handleClose}
            className="mt-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            확인
          </button>
        </div>
      )}
    </Modal>
  );
}
