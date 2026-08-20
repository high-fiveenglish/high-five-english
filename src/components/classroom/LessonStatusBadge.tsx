import type { LessonStatus } from "../../lib/scheduling/types";

export const LESSON_STATUS_LABELS: Record<LessonStatus, string> = {
  scheduled: "예정",
  completed: "출석",
  absent: "결석",
  rescheduled: "연기",
  teacher_absent: "강사결석",
  academy_closed: "휴강",
  admin_cancelled: "관리자취소",
};

const LESSON_STATUS_CLASSES: Record<LessonStatus, string> = {
  scheduled: "bg-brand-50 text-brand-700",
  completed: "bg-emerald-50 text-emerald-700",
  absent: "bg-red-50 text-red-600",
  rescheduled: "bg-accent-50 text-accent-600",
  teacher_absent: "bg-purple-50 text-purple-600",
  academy_closed: "bg-slate-100 text-slate-500",
  admin_cancelled: "bg-slate-100 text-slate-500",
};

export function LessonStatusBadge({ status }: { status: LessonStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-bold ${LESSON_STATUS_CLASSES[status]}`}
    >
      {LESSON_STATUS_LABELS[status]}
    </span>
  );
}
