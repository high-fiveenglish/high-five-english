import { useTranslation } from "react-i18next";
import { Calendar, Clock, Repeat, User, Sparkles, Video } from "lucide-react";
import type { Enrollment, Lesson } from "../../lib/scheduling/types";
import type { ClassroomCourse, LevelTestResult } from "../../data/classroomMock";
import type { Instructor } from "../../data/instructors";
import { getMeetingPlatform } from "../../data/meetingPlatforms";
import { resolveClassTime } from "../../lib/scheduling/engine";
import type { TeacherMeetingLinks } from "../../services/store";
import { EnterClassButton } from "./EnterClassButton";
import { LocalizedLink } from "../i18n/LocalizedLink";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-bold text-brand-950">{value}</dd>
    </div>
  );
}

function findNextScheduledLesson(lessons: Lesson[]): Lesson | null {
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcoming = lessons
    .filter((l) => l.status === "scheduled" && l.scheduledDate >= todayIso)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  return upcoming[0] ?? null;
}

export function EnrollmentSummaryCard({
  enrollment,
  course,
  teacher,
  levelTestResult,
  lessons,
  teacherMeetingLinks,
  onOpenTeacher,
}: {
  enrollment: Enrollment;
  course: ClassroomCourse;
  teacher: Instructor;
  levelTestResult: LevelTestResult;
  lessons: Lesson[];
  teacherMeetingLinks: TeacherMeetingLinks;
  onOpenTeacher: () => void;
}) {
  const { t } = useTranslation("classroom");
  const weekdayLabels = t("weekdays_short", { returnObjects: true }) as string[];
  const sortedWeeklyDays = enrollment.weeklyDays.slice().sort((a, b) => a - b);
  const weeklyDaysLabel = sortedWeeklyDays.map((d) => weekdayLabels[d]).join(", ");
  const hasMixedTimes = Object.keys(enrollment.weeklyTimes ?? {}).length > 0;
  const perDayTimesLabel = sortedWeeklyDays.map((d) => `${weekdayLabels[d]} ${resolveClassTime(enrollment, d)}`).join(", ");
  const scheduleValue = hasMixedTimes
    ? perDayTimesLabel
    : t("summary_card.class_schedule_value", { days: weeklyDaysLabel, time: enrollment.classTime });
  const platform = getMeetingPlatform(enrollment.meetingPlatform);
  const nextLesson = findNextScheduledLesson(lessons);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_8px_24px_rgba(20,44,88,0.06)] sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-accent-500">{course.productName}</p>
          <h2 className="mt-1 text-lg font-extrabold text-brand-950">{course.courseName}</h2>
        </div>
        <span className="rounded-full bg-brand-600/10 px-3 py-1.5 text-xs font-bold text-brand-700">
          {t(`enrollment_status.${enrollment.status}`)}
        </span>
      </div>

      {nextLesson && (
        <div className="mt-5">
          <EnterClassButton lesson={nextLesson} platform={enrollment.meetingPlatform} teacherMeetingLinks={teacherMeetingLinks} />
        </div>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
        <Field label={t("summary_card.enrollment_period")} value={`${enrollment.startDate} ~ ${enrollment.endDate}`} />
        <Field
          label={t("summary_card.lesson_count")}
          value={t("summary_card.lesson_count_value", { total: enrollment.totalLessons, remaining: enrollment.remainingLessons })}
        />
        <Field label={t("summary_card.lesson_duration")} value={t("summary_card.lesson_duration_value", { min: enrollment.lessonDurationMin })} />
        <Field label={t("summary_card.class_schedule")} value={scheduleValue} />
        <Field label={t("summary_card.level_test_result")} value={levelTestResult.level} />
        <Field label={t("summary_card.current_status")} value={t(`enrollment_status.${enrollment.status}`)} />
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
          <p className="text-xs text-slate-400">{t("summary_card.teacher_label")}</p>
          <p className="truncate text-sm font-bold text-brand-950">
            {teacher.flag} {teacher.name} ({teacher.nameEn})
          </p>
        </div>
        <User size={16} className="shrink-0 text-slate-400" />
      </button>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-4">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold text-white"
            style={{ backgroundColor: platform.brandColor }}
          >
            <Video size={15} />
          </div>
          <p className="text-sm text-slate-500">
            {t("summary_card.meeting_platform_label")}{" "}
            <span className="font-bold text-brand-950">{platform.shortName}</span>
          </p>
        </div>
        <LocalizedLink
          to="/install"
          state={{ scrollTo: platform.id }}
          className="rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-brand-700"
        >
          {t("summary_card.install_guide_cta")}
        </LocalizedLink>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-brand-50/60 p-3">
          <Calendar size={16} className="mx-auto text-brand-600" />
          <p className="mt-1 text-[11px] font-medium text-slate-500">{t("summary_card.weekly_count", { count: enrollment.weeklyDays.length })}</p>
        </div>
        <div className="rounded-xl bg-brand-50/60 p-3">
          <Clock size={16} className="mx-auto text-brand-600" />
          <p className="mt-1 text-[11px] font-medium text-slate-500">
            {hasMixedTimes ? perDayTimesLabel : enrollment.classTime}
          </p>
        </div>
        <div className="rounded-xl bg-brand-50/60 p-3">
          <Repeat size={16} className="mx-auto text-brand-600" />
          <p className="mt-1 text-[11px] font-medium text-slate-500">
            {t("summary_card.remaining_count", { count: enrollment.remainingLessons })}
          </p>
        </div>
      </div>

      {enrollment.remainingLessons <= 3 && enrollment.status === "active" && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-accent-50 px-4 py-3">
          <Sparkles size={14} className="shrink-0 text-accent-500" />
          <p className="text-[12.5px] font-medium text-accent-700">
            {t("summary_card.low_remaining_notice")}
          </p>
        </div>
      )}
    </div>
  );
}
