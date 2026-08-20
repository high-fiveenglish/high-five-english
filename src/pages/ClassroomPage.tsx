import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { Container } from "../components/ui/Container";
import { SectionHeading } from "../components/ui/SectionHeading";
import { EnrollmentSummaryCard } from "../components/classroom/EnrollmentSummaryCard";
import { TextbookInfoCard } from "../components/classroom/TextbookInfoCard";
import { LessonScheduleTable } from "../components/classroom/LessonScheduleTable";
import { InstructorModal } from "../components/home/InstructorModal";
import { RescheduleConfirmModal } from "../components/modals/RescheduleConfirmModal";
import { EvaluationDetailModal } from "../components/modals/EvaluationDetailModal";
import { useAuth } from "../context/AuthContext";
import { getMyClassroom, type MyClassroomSnapshot } from "../services/classroomService";
import type { Lesson } from "../lib/scheduling/types";

function LoginPrompt({ onOpenLogin }: { onOpenLogin: () => void }) {
  return (
    <Container className="flex min-h-[50vh] flex-col items-center justify-center py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
        <LogIn size={28} />
      </div>
      <h1 className="mt-6 text-2xl font-bold text-brand-950">로그인이 필요한 페이지입니다</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500">
        내 강의실에서 수업 요약, 스케줄, 강사·교재 정보와 일일평가서를 확인하려면 먼저 로그인해주세요.
      </p>
      <button
        onClick={onOpenLogin}
        className="mt-8 rounded-xl bg-brand-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-700"
      >
        로그인하기
      </button>
    </Container>
  );
}

export function ClassroomPage({ onOpenLogin }: { onOpenLogin: () => void }) {
  const { isLoggedIn, userId } = useAuth();
  const [snapshot, setSnapshot] = useState<MyClassroomSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [teacherModalOpen, setTeacherModalOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<Lesson | null>(null);
  const [evaluationTarget, setEvaluationTarget] = useState<Lesson | null>(null);

  const load = () => {
    if (!userId) return;
    setLoading(true);
    getMyClassroom(userId).then((data) => {
      setSnapshot(data);
      setLoading(false);
    });
  };

  useEffect(() => {
    if (isLoggedIn && userId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, userId]);

  if (!isLoggedIn) return <LoginPrompt onOpenLogin={onOpenLogin} />;
  if (loading || !snapshot) {
    return (
      <Container className="flex min-h-[50vh] items-center justify-center py-24">
        <p className="text-sm text-slate-400">불러오는 중입니다...</p>
      </Container>
    );
  }

  const { enrollment, course, teacher, textbook, levelTestResult, lessons } = snapshot;

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
            onOpenTeacher={() => setTeacherModalOpen(true)}
          />
          <TextbookInfoCard textbook={textbook} />
        </div>

        <div className="mt-10">
          <h3 className="mb-4 text-sm font-bold text-brand-950">수강 스케줄표</h3>
          <LessonScheduleTable
            lessons={lessons}
            teacherName={teacher.name}
            courseName={course.courseName}
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
