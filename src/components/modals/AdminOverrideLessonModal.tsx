import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import {
  listSchedulableLessons,
  overrideLessonDate,
  type AdminLessonRow,
} from "../../services/adminService";
import { useAuth } from "../../context/AuthContext";

export function AdminOverrideLessonModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [lessons, setLessons] = useState<AdminLessonRow[]>([]);
  const [lessonId, setLessonId] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [force, setForce] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { actor } = useAuth();

  useEffect(() => {
    if (!open || !actor) return;
    listSchedulableLessons(actor).then((res) => {
      if (!res.ok) return;
      setLessons(res.value);
      setLessonId(res.value[0]?.id ?? "");
    });
  }, [open, actor]);

  const reset = () => {
    setNewDate("");
    setNewTime("");
    setForce(false);
    setReason("");
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonId || !newDate || !reason.trim() || !actor) {
      setError("수업, 새 날짜, 변경 사유는 필수입니다.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await overrideLessonDate(actor, lessonId, newDate, newTime || undefined, force);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setSuccess(true);
    onSaved();
  };

  return (
    <Modal open={open} onClose={handleClose} title="수업 일정 수동 변경">
      {success ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 className="text-brand-600" size={40} />
          <p className="text-sm text-slate-600">일정이 변경되었습니다.</p>
          <button
            onClick={handleClose}
            className="mt-2 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            확인
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-3">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-500" />
            <p className="text-[12px] leading-relaxed text-amber-700">
              이 기능은 정규 연기 절차를 건너뛰는 데이터 교정 도구입니다. 신중히 사용해주세요.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">대상 수업</label>
            <select
              value={lessonId}
              onChange={(e) => setLessonId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              {lessons.length === 0 && <option value="">변경 가능한 예정 수업이 없습니다</option>}
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.studentName} · {l.courseName} · {l.scheduledDate} {l.scheduledTime}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">새 날짜</label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-600">
                새 시간 (선택)
              </label>
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-600">변경 사유 (필수)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="예: 학생 요청으로 날짜 재조정"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-500">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-brand-600"
            />
            요일 패턴·휴무일 검사 무시하고 강제 적용 (force)
          </label>

          {error && <p className="text-[13px] text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting || lessons.length === 0}
            className="mt-2 w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {submitting ? "처리 중..." : "일정 변경 적용"}
          </button>
        </form>
      )}
    </Modal>
  );
}
