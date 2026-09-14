import { useTranslation } from "react-i18next";
import type { LessonStatus } from "../../lib/scheduling/types";

// teacher_absent/academy_closed/admin_cancelled 셋 다 학생에게는 "관리자연기"로 같은
// 라벨로 보이므로(classroom.json의 lesson_status 참고), 색도 같은 계열로 통일한다 —
// 같은 글자인데 색이 제각각이면 오히려 더 헷갈린다.
const LESSON_STATUS_CLASSES: Record<LessonStatus, string> = {
  scheduled: "bg-brand-50 text-brand-700",
  completed: "bg-emerald-50 text-emerald-700",
  absent: "bg-red-50 text-red-600",
  rescheduled: "bg-accent-50 text-accent-600",
  teacher_absent: "bg-purple-50 text-purple-600",
  academy_closed: "bg-purple-50 text-purple-600",
  admin_cancelled: "bg-purple-50 text-purple-600",
};

/** 캘린더 칸 안의 작은 텍스트 태그용 — 큰 배지와 같은 색 계열을 그대로 쓴다. */
export const LESSON_STATUS_TAG_CLASSES = LESSON_STATUS_CLASSES;

/** reason: 전체수업휴강(academy_closed)에만 실려오는 사유(예: "추석 연휴") — 있으면
 * "관리자연기"라는 뭉뚱그린 라벨 대신 그 사유를 그대로 보여준다. 학생이 왜 수업이
 * 없는지 라벨만 보고 바로 알 수 있게 하기 위함(자세한 사유가 필요하면 별도 텍스트를
 * 또 찾아봐야 했던 문제). 다른 상태(teacher_absent/admin_cancelled 등)는 reason이
 * 없으므로 항상 기존 일반 라벨 그대로 나온다. */
export function LessonStatusBadge({ status, reason }: { status: LessonStatus; reason?: string }) {
  const { t } = useTranslation("classroom");
  const label = status === "academy_closed" && reason ? reason : t(`lesson_status.${status}`);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-bold ${LESSON_STATUS_CLASSES[status]}`}
    >
      {label}
    </span>
  );
}
