import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { RouteGuard } from "../components/auth/RouteGuard";
import { LocalizedLink } from "../components/i18n/LocalizedLink";
import { EnrollmentSummaryCard } from "../components/classroom/EnrollmentSummaryCard";
import { TextbookInfoCard } from "../components/classroom/TextbookInfoCard";
import { RescheduleAllowanceCard } from "../components/classroom/RescheduleAllowanceCard";
import { LessonCalendar } from "../components/classroom/LessonCalendar";
import { LessonScheduleTable } from "../components/classroom/LessonScheduleTable";
import { InstructorModal } from "../components/home/InstructorModal";
import { RescheduleConfirmModal } from "../components/modals/RescheduleConfirmModal";
import { EvaluationDetailModal } from "../components/modals/EvaluationDetailModal";
import { EnrollmentHistoryTable } from "../components/classroom/EnrollmentHistoryTable";
import { ReceiptModal } from "../components/classroom/ReceiptModal";
import { AttendanceCertificateModal } from "../components/classroom/AttendanceCertificateModal";
import { LevelTestApplyTab } from "../components/classroom/LevelTestApplyTab";
import { LevelTestResultTab } from "../components/classroom/LevelTestResultTab";
import { useAuth } from "../context/AuthContext";
import {
  classifyEnrollmentTimeline,
  getMyClassroom,
  listMyEnrollmentHistory,
  type EnrollmentHistoryRow,
  type MyClassroomSnapshot,
} from "../services/classroomService";
import {
  fetchMyLevelTests,
  type LevelTestEligibility,
  type MyLevelTestRow,
} from "../services/levelTestService";
import { todayIso } from "../lib/scheduling/dateUtils";
import { getMeetingPlatform } from "../data/meetingPlatforms";
import type { Enrollment, Lesson } from "../lib/scheduling/types";

/** Today if it falls inside the enrollment's own date range, else the nearer edge of
 * that range — so switching to a past/upcoming enrollment lands the calendar and
 * schedule table on a date that actually has classes instead of an empty "today". */
function defaultDateFor(enrollment: Enrollment): string {
  const today = todayIso();
  if (today < enrollment.startDate) return enrollment.startDate;
  if (today > enrollment.endDate) return enrollment.endDate;
  return today;
}

const TABS = ["classroom", "level_test_apply", "level_test_result", "enroll", "history"] as const;
type TabKey = (typeof TABS)[number];

function ClassroomContent({ onOpenLevelTest }: { onOpenLevelTest: () => void }) {
  const { actor, studentApiToken, isRealAccount } = useAuth();
  const { t } = useTranslation("classroom");
  const [snapshot, setSnapshot] = useState<MyClassroomSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<Lesson | null>(null);
  const [evaluationTarget, setEvaluationTarget] = useState<Lesson | null>(null);
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<string | undefined>(undefined);
  // Shared with LessonCalendar so the schedule table below only shows the selected
  // day's classes instead of the student's entire lesson history — defaults to today
  // on login, matching the calendar's own default.
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [activeTab, setActiveTab] = useState<TabKey>("classroom");
  const [historyRows, setHistoryRows] = useState<EnrollmentHistoryRow[]>([]);
  const [receiptRow, setReceiptRow] = useState<EnrollmentHistoryRow | null>(null);
  const [certificateRow, setCertificateRow] = useState<EnrollmentHistoryRow | null>(null);
  const [levelTestLoading, setLevelTestLoading] = useState(true);
  const [levelTestEligibility, setLevelTestEligibility] = useState<LevelTestEligibility | null>(null);
  const [levelTestRows, setLevelTestRows] = useState<MyLevelTestRow[]>([]);

  const load = (enrollmentId?: string) => {
    if (!actor) return;
    setLoading(true);
    getMyClassroom(actor, enrollmentId, studentApiToken).then((res) => {
      setLoading(false);
      if (res.ok) {
        setSnapshot(res.value);
        setSelectedEnrollmentId(res.value.enrollment.id);
        setSelectedDate(defaultDateFor(res.value.enrollment));
      } else {
        setLoadError(t(`service_errors.${res.error.code}`, { ns: "common", defaultValue: t("service_errors.unknown", { ns: "common" }) }));
      }
    });
    listMyEnrollmentHistory(actor, studentApiToken).then((res) => {
      if (res.ok) setHistoryRows(res.value);
    });

    if (studentApiToken) {
      setLevelTestLoading(true);
      fetchMyLevelTests(studentApiToken).then((res) => {
        setLevelTestLoading(false);
        if (res.ok) {
          setLevelTestEligibility(res.value.eligibility);
          setLevelTestRows(res.value.tests);
        }
      });
    } else {
      setLevelTestLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor]);

  if (!snapshot && !loadError) {
    return (
      <Container className="flex min-h-[50vh] items-center justify-center py-24">
        <p className="text-sm text-slate-400">{t("page.loading")}</p>
      </Container>
    );
  }
  if (loadError || !snapshot) {
    return (
      <Container className="flex min-h-[50vh] items-center justify-center py-24">
        <p className="text-sm text-slate-400">{loadError ?? t("page.not_found")}</p>
      </Container>
    );
  }

  const {
    enrollment,
    course,
    teacher,
    textbook,
    levelTestResult,
    lessons,
    teacherMeetingLinks,
    closures,
    teacherUnavailability,
    rescheduleRequests,
    allEnrollments,
  } = snapshot;

  const enrollmentOptionLabel = (e: Enrollment) => {
    const platform = getMeetingPlatform(e.meetingPlatform);
    const timeline = classifyEnrollmentTimeline(e);
    return `${e.startDate} ~ ${e.endDate} ${t("summary_card.weekly_count", { count: e.weeklyDays.length })} ${t(
      "page.enrollment_option_prefix",
    )} ${platform.shortName}${t("page.enrollment_option_suffix")} (${t(`page.timeline.${timeline}`)})`;
  };

  return (
    <section className="bg-brand-50/40 py-12 sm:py-16">
      <Container className="max-w-5xl">
        <SectionHeading eyebrow={t("page.eyebrow")} title={t("page.title")} align="left" />
        {loading && <p className="mt-1 text-xs text-slate-400">{t("page.refreshing")}</p>}

        <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200">
          {TABS.map((tab) =>
            tab === "enroll" ? (
              <LocalizedLink
                key={tab}
                to="/enroll"
                className="-mb-px border-b-2 border-transparent px-4 py-2.5 text-sm font-bold text-slate-400 transition hover:text-slate-600"
              >
                {t(`page.tab_${tab}`)}
              </LocalizedLink>
            ) : (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  if ((tab === "level_test_apply" || tab === "level_test_result") && studentApiToken) {
                    setLevelTestLoading(true);
                    fetchMyLevelTests(studentApiToken).then((res) => {
                      setLevelTestLoading(false);
                      if (res.ok) {
                        setLevelTestEligibility(res.value.eligibility);
                        setLevelTestRows(res.value.tests);
                      }
                    });
                  }
                }}
                className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-bold transition ${
                  activeTab === tab
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                {t(`page.tab_${tab}`)}
              </button>
            ),
          )}
        </div>

        {activeTab === "history" && (
          <div className="mt-6">
            <EnrollmentHistoryTable rows={historyRows} onOpenReceipt={setReceiptRow} onOpenCertificate={setCertificateRow} />
          </div>
        )}

        {activeTab === "level_test_apply" && (
          <LevelTestApplyTab
            hasRealAccount={isRealAccount}
            loading={levelTestLoading}
            eligibility={levelTestEligibility}
            onOpenLevelTest={onOpenLevelTest}
            onViewResults={() => setActiveTab("level_test_result")}
          />
        )}

        {activeTab === "level_test_result" && (
          <LevelTestResultTab hasRealAccount={isRealAccount} loading={levelTestLoading} tests={levelTestRows} />
        )}

        {activeTab === "classroom" && (
        <>
        {allEnrollments.length > 1 && (
          <div className="mt-6">
            <label className="mb-1.5 block text-xs font-bold text-slate-500">{t("page.enrollment_select_label")}</label>
            <select
              value={enrollment.id}
              onChange={(e) => load(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-brand-950 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              {allEnrollments.map((e) => (
                <option key={e.id} value={e.id}>
                  {enrollmentOptionLabel(e)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <EnrollmentSummaryCard
            enrollment={enrollment}
            course={course}
            teacher={teacher}
            levelTestResult={levelTestResult}
            lessons={lessons}
            teacherMeetingLinks={teacherMeetingLinks}
            onOpenTeacher={() => setTeacherModalOpen(true)}
          />
          <div className="flex flex-col gap-5">
            <TextbookInfoCard textbook={textbook} />
            <RescheduleAllowanceCard enrollment={enrollment} rescheduleRequests={rescheduleRequests} />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Link
            to="/reviews"
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-brand-700 transition hover:border-brand-300 hover:bg-brand-50"
          >
            {t("page.review_board_cta")}
          </Link>
        </div>

        <div className="mt-6">
          <LessonCalendar
            key={enrollment.id}
            lessons={lessons}
            closures={closures}
            teacherUnavailability={teacherUnavailability}
            teacherName={teacher.name}
            courseName={course.courseName}
            teacherMeetingLinks={teacherMeetingLinks}
            meetingPlatform={enrollment.meetingPlatform}
            onOpenEvaluation={setEvaluationTarget}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </div>

        <div className="mt-10">
          <h3 className="mb-4 text-sm font-bold text-brand-950">{t("page.schedule_table_title")}</h3>
          <LessonScheduleTable
            lessons={lessons.filter((l) => l.scheduledDate === selectedDate)}
            teacherName={teacher.name}
            courseName={course.courseName}
            teacherMeetingLinks={teacherMeetingLinks}
            meetingPlatform={enrollment.meetingPlatform}
            onOpenEvaluation={setEvaluationTarget}
            onRequestReschedule={setRescheduleTarget}
          />
        </div>
        </>
        )}
      </Container>

      <InstructorModal
        instructor={teacherModalOpen ? teacher : null}
        onClose={() => setTeacherModalOpen(false)}
      />
      <RescheduleConfirmModal
        lesson={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onRescheduled={() => load(selectedEnrollmentId)}
      />
      <EvaluationDetailModal lesson={evaluationTarget} onClose={() => setEvaluationTarget(null)} />
      <ReceiptModal row={receiptRow} onClose={() => setReceiptRow(null)} />
      <AttendanceCertificateModal row={certificateRow} onClose={() => setCertificateRow(null)} />
    </section>
  );
}

export function ClassroomPage({
  onOpenLogin,
  onOpenLevelTest,
}: {
  onOpenLogin: () => void;
  onOpenLevelTest: () => void;
}) {
  return (
    <RouteGuard allow={["student"]} onOpenLogin={onOpenLogin}>
      <ClassroomContent onOpenLevelTest={onOpenLevelTest} />
    </RouteGuard>
  );
}
