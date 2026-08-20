import { Calendar, Clock, Repeat, User, Sparkles } from "lucide-react";
import type { Enrollment } from "../../lib/scheduling/types";
import type { ClassroomCourse, LevelTestResult } from "../../data/classroomMock";
import type { Instructor } from "../../data/instructors";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

const ENROLLMENT_STATUS_LABELS: Record<Enrollment["status"], string> = {
  active: "수강중",
  completed: "수강완료",
  expired: "만료",
  paused: "일시중지",
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-bold text-brand-950">{value}</dd>
    </div>
  );
}

export function EnrollmentSummaryCard({
  enrollment,
  course,
  teacher,
  levelTestResult,
  onOpenTeacher,
}: {
  enrollment: Enrollment;
  course: ClassroomCourse;
  teacher: Instructor;
  levelTestResult: LevelTestResult;
  onOpenTeacher: () => void;
}) {
  const weeklyDaysLabel = enrollment.weeklyDays
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_LABELS[d])
    .join(", ");

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)] sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-accent-500">{course.productName}</p>
          <h2 className="mt-1 text-lg font-extrabold text-brand-950">{course.courseName}</h2>
        </div>
        <span className="rounded-full bg-brand-600/10 px-3 py-1.5 text-xs font-bold text-brand-700">
          {ENROLLMENT_STATUS_LABELS[enrollment.status]}
        </span>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
        <Field label="수강 기간" value={`${enrollment.startDate} ~ ${enrollment.endDate}`} />
        <Field label="수업 횟수" value={`총 ${enrollment.totalLessons}회 · 잔여 ${enrollment.remainingLessons}회`} />
        <Field label="수업 시간" value={`${enrollment.lessonDurationMin}분`} />
        <Field label="수업 요일 및 시간" value={`매주 ${weeklyDaysLabel} ${enrollment.classTime}`} />
        <Field label="레벨테스트 결과" value={levelTestResult.level} />
        <Field label="현재 수강 상태" value={ENROLLMENT_STATUS_LABELS[enrollment.status]} />
      </dl>

      <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{levelTestResult.summary}</p>

      <button
        onClick={onOpenTeacher}
        className="mt-6 flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4 text-left transition hover:border-brand-200 hover:bg-brand-50/40"
      >
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-base font-extrabold text-white ${teacher.gradient}`}
        >
          {teacher.name[0]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-400">담당 강사</p>
          <p className="truncate text-sm font-bold text-brand-950">
            {teacher.flag} {teacher.name} ({teacher.nameEn})
          </p>
        </div>
        <User size={16} className="shrink-0 text-slate-400" />
      </button>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-brand-50/60 p-3">
          <Calendar size={16} className="mx-auto text-brand-600" />
          <p className="mt-1 text-[11px] font-medium text-slate-500">주 {enrollment.weeklyDays.length}회</p>
        </div>
        <div className="rounded-xl bg-brand-50/60 p-3">
          <Clock size={16} className="mx-auto text-brand-600" />
          <p className="mt-1 text-[11px] font-medium text-slate-500">{enrollment.classTime}</p>
        </div>
        <div className="rounded-xl bg-brand-50/60 p-3">
          <Repeat size={16} className="mx-auto text-brand-600" />
          <p className="mt-1 text-[11px] font-medium text-slate-500">
            {enrollment.remainingLessons}회 남음
          </p>
        </div>
      </div>

      {enrollment.remainingLessons <= 3 && enrollment.status === "active" && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-accent-50 px-4 py-3">
          <Sparkles size={14} className="shrink-0 text-accent-500" />
          <p className="text-[12.5px] font-medium text-accent-700">
            잔여 수업이 얼마 남지 않았습니다. 다음 과정 상담이 필요하시면 1:1 상담을 신청해주세요.
          </p>
        </div>
      )}
    </div>
  );
}
