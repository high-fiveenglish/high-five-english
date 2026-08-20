// Single seeded demo enrollment for the "내 강의실" feature. There is no real backend
// yet, so this stands in for a database — built using the actual scheduling engine
// (not hand-typed statuses) so the demo genuinely exercises the same logic that will
// run for real once a backend exists. See src/services/classroomService.ts for the
// mutable in-memory store this seeds, and src/lib/scheduling/ for the engine itself.
import { INSTRUCTORS } from "./instructors";
import {
  extendSchedule,
  generateInitialSchedule,
  markAttendance,
  recomputeEnrollmentEndDate,
} from "../lib/scheduling/engine";
import type {
  ClosureDate,
  DailyEvaluation,
  Enrollment,
  Lesson,
  RescheduleRequest,
  TeacherUnavailability,
} from "../lib/scheduling/types";

export type ClassroomCourse = {
  id: string;
  productName: string;
  courseName: string;
};

export type ClassroomTextbook = {
  id: string;
  title: string;
  publisher: string;
  gradient: string;
  currentUnit: string;
  currentChapter: string;
};

export type ClassroomStudent = {
  id: string;
  name: string;
};

export type LevelTestResult = {
  level: string;
  summary: string;
  testedAt: string;
};

export const DEMO_STUDENT: ClassroomStudent = { id: "demo-student", name: "김민준" };

export const DEMO_COURSE: ClassroomCourse = {
  id: "course-1",
  productName: "1:1 화상영어 정규수업",
  courseName: "본격 회화 · 디베이트",
};

export const DEMO_TEACHER = INSTRUCTORS.find((i) => i.id === "james")!;

export const DEMO_TEXTBOOK: ClassroomTextbook = {
  id: "book-1",
  title: "Touchstone 1",
  publisher: "Cambridge University Press",
  gradient: "from-brand-600 to-brand-900",
  currentUnit: "Unit 5",
  currentChapter: "Making Conversation",
};

export const DEMO_LEVEL_TEST_RESULT: LevelTestResult = {
  level: "B1 (중급 초입)",
  summary: "문장 구성은 안정적이나 발화 속도가 다소 느린 편. 자유 발화 비중을 늘리는 것을 추천.",
  testedAt: "2026-07-02",
};

export const CLOSURES: ClosureDate[] = [
  { id: "closure-1", date: "2026-07-24", type: "academy_closed", label: "학원 창립기념일 휴무" },
  { id: "closure-2", date: "2026-10-09", type: "public_holiday", label: "한글날" },
];

export const TEACHER_UNAVAILABILITY: TeacherUnavailability[] = [
  { id: "tu-1", teacherId: DEMO_TEACHER.id, date: "2026-08-03", reason: "개인 사정" },
];

let idCounter = 0;
const idGen = () => `demo-${++idCounter}`;

const enrollmentDraft: Enrollment = {
  id: "enrollment-1",
  studentId: DEMO_STUDENT.id,
  courseId: DEMO_COURSE.id,
  teacherId: DEMO_TEACHER.id,
  textbookId: DEMO_TEXTBOOK.id,
  startDate: "2026-07-06",
  endDate: "2026-07-06",
  totalLessons: 24,
  remainingLessons: 24,
  lessonDurationMin: 25,
  weeklyDays: [1, 3, 5],
  classTime: "19:00",
  status: "active",
};

function buildSeed(): {
  enrollment: Enrollment;
  lessons: Lesson[];
  evaluations: DailyEvaluation[];
  rescheduleRequests: RescheduleRequest[];
} {
  const initial = generateInitialSchedule({
    enrollment: enrollmentDraft,
    closures: CLOSURES,
    unavailability: TEACHER_UNAVAILABILITY,
    allTeacherLessons: [],
    idGen,
  });
  if (!initial.ok) throw new Error(initial.error.message);

  let lessons = initial.value;
  let enrollment: Enrollment = {
    ...enrollmentDraft,
    endDate: recomputeEnrollmentEndDate(lessons, enrollmentDraft.id),
  };
  const evaluations: DailyEvaluation[] = [];
  const rescheduleRequests: RescheduleRequest[] = [];

  const byDate = (date: string) => lessons.find((l) => l.scheduledDate === date);
  const replace = (lesson: Lesson) =>
    (lessons = lessons.map((l) => (l.id === lesson.id ? lesson : l)));

  // --- one student-initiated reschedule (seeds a "rescheduled" row + audit record) ---
  const swappedLesson = byDate("2026-07-15");
  if (swappedLesson) {
    const result = extendSchedule({
      enrollment,
      allEnrollmentLessons: lessons,
      allTeacherLessons: lessons,
      targetLesson: swappedLesson,
      cause: "rescheduled",
      initiatedBy: "student",
      reason: "가족 행사로 참석 어려움",
      closures: CLOSURES,
      unavailability: TEACHER_UNAVAILABILITY,
      nowMs: Date.parse("2026-07-10T08:00:00+09:00"),
      idGen,
    });
    if (result.ok) {
      replace(result.value.updatedOriginalLesson);
      lessons = [...lessons, result.value.newLesson];
      enrollment = result.value.updatedEnrollment;
      rescheduleRequests.push(result.value.rescheduleRequest);
    }
  }

  // --- one teacher-caused cancellation (auto-extends, does not consume a lesson) ---
  const teacherOutLesson = byDate("2026-07-27");
  if (teacherOutLesson) {
    const result = extendSchedule({
      enrollment,
      allEnrollmentLessons: lessons,
      allTeacherLessons: lessons,
      targetLesson: teacherOutLesson,
      cause: "teacher_absent",
      initiatedBy: "teacher",
      reason: "강사 개인 사정으로 휴강",
      closures: CLOSURES,
      unavailability: TEACHER_UNAVAILABILITY,
      nowMs: Date.parse("2026-07-26T08:00:00+09:00"),
      idGen,
    });
    if (result.ok) {
      replace(result.value.updatedOriginalLesson);
      lessons = [...lessons, result.value.newLesson];
      enrollment = result.value.updatedEnrollment;
      rescheduleRequests.push(result.value.rescheduleRequest);
    }
  }

  // --- a completed lesson with a finished evaluation ---
  const evaluatedLesson = byDate("2026-08-19");
  if (evaluatedLesson) {
    const { updatedLesson } = markAttendance(evaluatedLesson, "completed");
    updatedLesson.evaluationStatus = "completed";
    replace(updatedLesson);
    enrollment = { ...enrollment, remainingLessons: enrollment.remainingLessons - 1 };
    evaluations.push({
      id: idGen(),
      lessonId: updatedLesson.id,
      studentId: DEMO_STUDENT.id,
      teacherId: DEMO_TEACHER.id,
      lessonSummary: "Unit 5 'Making Conversation' 대화 패턴을 활용해 실제 상황극을 진행했습니다.",
      strengths: "새로운 표현을 배우면 바로 자기 문장으로 응용해 말하려는 시도가 좋았습니다.",
      improvements: "과거시제 동사 활용에서 반복적인 실수가 있어 다음 수업에서 집중 교정이 필요합니다.",
      teacherComment: "오늘 자유발화 비중이 확실히 늘었어요! 다음 시간엔 좀 더 긴 문장에 도전해봐요.",
      pronunciation: { score: 4, comment: "th 발음이 안정적으로 자리잡음" },
      grammar: { score: 3, comment: "과거시제 동사 변형에서 실수 반복" },
      vocabulary: { score: 4, comment: "일상 표현 어휘량이 꾸준히 늘고 있음" },
      speaking: { score: 4, comment: "머뭇거림 없이 문장을 끝까지 완성함" },
      source: "teacher",
    });
  }

  // --- a completed lesson whose evaluation is still being written ---
  const pendingEvalLesson = byDate("2026-08-12");
  if (pendingEvalLesson) {
    const { updatedLesson } = markAttendance(pendingEvalLesson, "completed");
    replace(updatedLesson);
    enrollment = { ...enrollment, remainingLessons: enrollment.remainingLessons - 1 };
  }

  // --- an absence (forfeits the lesson, no schedule extension) ---
  const absentLesson = byDate("2026-08-17");
  if (absentLesson) {
    const { updatedLesson } = markAttendance(absentLesson, "absent");
    replace(updatedLesson);
    enrollment = { ...enrollment, remainingLessons: enrollment.remainingLessons - 1 };
  }

  // --- realism pass: any other lesson still "scheduled" but dated before today has,
  // in reality, already happened — mark it attended. Its evaluation stays
  // "not_started" (a realistic backlog), distinct from the two cases crafted above.
  const todayIso = new Date().toISOString().slice(0, 10);
  for (const lesson of lessons) {
    if (lesson.status === "scheduled" && lesson.scheduledDate < todayIso) {
      const { updatedLesson } = markAttendance(lesson, "completed");
      replace(updatedLesson);
      enrollment = { ...enrollment, remainingLessons: enrollment.remainingLessons - 1 };
    }
  }

  return { enrollment, lessons, evaluations, rescheduleRequests };
}

export const CLASSROOM_SEED = buildSeed();
