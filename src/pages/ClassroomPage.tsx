import { useEffect, useState } from "react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { RouteGuard } from "../components/auth/RouteGuard";
import { EnrollmentSummaryCard } from "../components/classroom/EnrollmentSummaryCard";
import { TextbookInfoCard } from "../components/classroom/TextbookInfoCard";
import { LessonCalendar } from "../components/classroom/LessonCalendar";
import { LessonScheduleTable } from "../components/classroom/LessonScheduleTable";
import { InstructorModal } from "../components/home/InstructorModal";
import { RescheduleConfirmModal } from "../components/modals/RescheduleConfirmModal";
import { EvaluationDetailModal } from "../components/modals/EvaluationDetailModal";
import { useAuth } from "../context/AuthContext";
import { getMyClassroom, type MyClassroomSnapshot } from "../services/classroomService";
import type { Lesson } from "../lib/scheduling/types";

function ClassroomContent() {
  const { actor } = useAuth();
  const [snapshot, setSnapshot] = useState<MyClassroomSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<Lesson | null>(null);
  const [evaluationTarget, setEvaluationTarget] = useState<Lesson | null>(null);

  const load = () => {
    if (!actor) return;
    setLoading(true);
    getMyClassroom(actor).then((res) => {
      setLoading(false);
      if (res.ok) {
        setSnapshot(res.value);
      } else {
        setLoadError(res.error.message);
      }
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor]);

  if (loading || (!snapshot && !loadError)) {
    return (
      <Container className="flex min-h-[50vh] items-center justify-center py-24">
        <p className="text-sm text-slate-400">불러오는 중입니다...</p>
      </Container>
    );
  }
  if (loadError || !snapshot) {
    return (
      <Container className="flex min-h-[50vh] items-center justify-center py-24">
        <p className="text-sm text-slate-400">{loadError ?? "수강 정보를 찾을 수 없습니다."}</p>
      </Container>
    );
  }

  const { enrollment, course, teacher, textbook, levelTestResult, lessons, teacherMeetingLinks, closures, teacherUnavailability } =
    snapshot;

  return (
    <section className="bg-brand-50/40 py-12 sm:py-16">
      <Container className="max-w-5xl">
        <SectionHeading eyebrow="마이페이지" title="내 강의실" align="left" />

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
          <TextbookInfoCard textbook={textbook} />
        </div>

        <div className="mt-6">
          <LessonCalendar
            lessons={lessons}
            closures={closures}
            teacherUnavailability={teacherUnavailability}
            teacherName={teacher.name}
            courseName={course.courseName}
            teacherMeetingLinks={teacherMeetingLinks}
            meetingPlatform={enrollment.meetingPlatform}
            onOpenEvaluation={setEvaluationTarget}
          />
        </div>

        <div className="mt-10">
          <h3 className="mb-4 text-sm font-bold text-brand-950">수강 스케줄표</h3>
          <LessonScheduleTable
            lessons={lessons}
            teacherName={teacher.name}
            courseName={course.courseName}
            teacherMeetingLinks={teacherMeetingLinks}
            meetingPlatform={enrollment.meetingPlatform}
            onOpenEvaluation={setEvaluationTarget}
            onRequestReschedule={setRescheduleTarget}
          />
        </div>
      </Container>

      <InstructorModal
        instructor={teacherModalOpen ? teacher : null}
        onClose={() => setTeacherModalOpen(false)}
      />
      <RescheduleConfirmModal
        lesson={rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        onRescheduled={() => load()}
      />
      <EvaluationDetailModal lesson={evaluationTarget} onClose={() => setEvaluationTarget(null)} />
    </section>
  );
}

export function ClassroomPage({ onOpenLogin }: { onOpenLogin: () => void }) {
  return (
    <RouteGuard allow={["student"]} onOpenLogin={onOpenLogin}>
      <ClassroomContent />
    </RouteGuard>
  );
}
