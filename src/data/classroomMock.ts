// Seeded demo data for the "내 강의실" feature and the role/permission system. There is
// no real backend yet, so this stands in for a database — every enrollment below is
// built using the actual scheduling engine (not hand-typed statuses) so the demo
// genuinely exercises the same logic that will run for real once a backend exists. See
// src/services/*.ts for the mutable in-memory stores this seeds, and
// src/lib/scheduling/ for the engine itself.
import i18n from "../i18n/config";
import { INSTRUCTORS } from "./instructors";
import type { MeetingPlatformId } from "./meetingPlatforms";
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

// --- shared display data reused across every enrollment (course/textbook/level-test
// content isn't the focus of this feature, so one shared record keeps the seed simple) ---
const DEMO_COURSE_ID = "course-1";

// productName/courseName are catalog content (like a textbook title), not a per-user
// record, so they're translated via locales/{lang}/courses.json — getDemoCourse() reads
// the currently active language at call time rather than baking in Korean once at
// module load. Callers (classroomService/adminService/teacherService) call this instead
// of importing a static object.
export function getDemoCourse(): ClassroomCourse {
  return {
    id: DEMO_COURSE_ID,
    productName: i18n.t(`${DEMO_COURSE_ID}.productName`, {
      ns: "courses",
      defaultValue: "1:1 화상영어 정규수업",
    }),
    courseName: i18n.t(`${DEMO_COURSE_ID}.courseName`, {
      ns: "courses",
      defaultValue: "본격 회화 · 디베이트",
    }),
  };
}

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

// --- the 3 teachers that actually teach in this demo (out of the 4 in the marketing
// INSTRUCTORS catalog) — these are the ones with a matching Teacher account in accounts.ts ---
const TEACHER_JAMES = INSTRUCTORS.find((i) => i.id === "james")!;
const TEACHER_SARAH = INSTRUCTORS.find((i) => i.id === "sarah")!;
const TEACHER_EMILY = INSTRUCTORS.find((i) => i.id === "emily")!;

export const STUDENTS: ClassroomStudent[] = [
  { id: "demo-student", name: "김민준" },
  { id: "student-2", name: "이서연" },
  { id: "student-3", name: "박도윤" },
  { id: "student-4", name: "최지우" },
  { id: "student-5", name: "정하은" },
  { id: "student-6", name: "강태오" },
];

export const CLOSURES: ClosureDate[] = [
  { id: "closure-1", date: "2026-07-24", type: "academy_closed", label: "학원 창립기념일 휴무" },
  { id: "closure-2", date: "2026-10-09", type: "public_holiday", label: "한글날" },
];

export const TEACHER_UNAVAILABILITY: TeacherUnavailability[] = [
  { id: "tu-1", teacherId: TEACHER_JAMES.id, date: "2026-08-03", reason: "개인 사정" },
  { id: "tu-2", teacherId: TEACHER_SARAH.id, date: "2026-07-15", reason: "개인 사정" },
  { id: "tu-3", teacherId: TEACHER_EMILY.id, date: "2026-08-10", reason: "학회 참석" },
];

// --- each teacher's own fixed video-meeting links, registered once and reused across
// every student they teach (see src/services/teacherService.ts). Emily hasn't registered
// anything yet, which deliberately demonstrates the "링크 준비 중" fallback state until a
// teacher registers one — the Teacher Dashboard build (Phase 4) lets her do that live. ---
export const INITIAL_TEACHER_MEETING_LINKS: Record<string, Partial<Record<MeetingPlatformId, string>>> = {
  [TEACHER_JAMES.id]: { zoom: "https://zoom.us/j/james-fixed-room" },
  [TEACHER_SARAH.id]: { voov: "https://voovmeeting.com/j/sarah-fixed-room" },
  [TEACHER_EMILY.id]: {},
};

let idCounter = 0;
const idGen = () => `demo-${++idCounter}`;

interface EnrollmentBlueprint {
  enrollmentId: string;
  studentId: string;
  teacherId: string;
  startDate: string;
  weeklyDays: Enrollment["weeklyDays"];
  classTime: string;
  totalLessons: number;
  meetingPlatform: MeetingPlatformId;
}

const BLUEPRINTS: EnrollmentBlueprint[] = [
  {
    enrollmentId: "enrollment-1",
    studentId: "demo-student",
    teacherId: TEACHER_JAMES.id,
    startDate: "2026-07-06",
    weeklyDays: [1, 3, 5],
    classTime: "19:00",
    totalLessons: 24,
    meetingPlatform: "zoom",
  },
  {
    enrollmentId: "enrollment-2",
    studentId: "student-2",
    teacherId: TEACHER_JAMES.id,
    startDate: "2026-07-13",
    weeklyDays: [2, 4],
    classTime: "20:00",
    totalLessons: 16,
    meetingPlatform: "zoom",
  },
  {
    enrollmentId: "enrollment-3",
    studentId: "student-3",
    teacherId: TEACHER_SARAH.id,
    startDate: "2026-07-06",
    weeklyDays: [1, 3],
    classTime: "17:00",
    totalLessons: 16,
    meetingPlatform: "voov",
  },
  {
    enrollmentId: "enrollment-4",
    studentId: "student-4",
    teacherId: TEACHER_SARAH.id,
    startDate: "2026-07-20",
    weeklyDays: [2, 4, 6],
    classTime: "18:00",
    totalLessons: 20,
    meetingPlatform: "voov",
  },
  {
    enrollmentId: "enrollment-5",
    studentId: "student-5",
    teacherId: TEACHER_EMILY.id,
    startDate: "2026-07-06",
    weeklyDays: [1, 4],
    classTime: "21:00",
    totalLessons: 16,
    meetingPlatform: "teams",
  },
  {
    enrollmentId: "enrollment-6",
    studentId: "student-6",
    teacherId: TEACHER_EMILY.id,
    startDate: "2026-07-13",
    weeklyDays: [3, 5],
    classTime: "09:00",
    totalLessons: 16,
    meetingPlatform: "teams",
  },
];

function draftFor(bp: EnrollmentBlueprint): Enrollment {
  return {
    id: bp.enrollmentId,
    studentId: bp.studentId,
    courseId: DEMO_COURSE_ID,
    teacherId: bp.teacherId,
    textbookId: DEMO_TEXTBOOK.id,
    startDate: bp.startDate,
    endDate: bp.startDate,
    totalLessons: bp.totalLessons,
    remainingLessons: bp.totalLessons,
    lessonDurationMin: 25,
    weeklyDays: bp.weeklyDays,
    classTime: bp.classTime,
    status: "active",
    meetingPlatform: bp.meetingPlatform,
  };
}

/** The flagship demo enrollment — kept exactly as it has been throughout development
 * (one student-initiated reschedule, one teacher-caused cancellation, a finished
 * evaluation, a pending evaluation, an absence, two pre-registered per-lesson join
 * links) so every screen that was already verified against this data keeps working
 * identically. */
function buildFlagshipSeed(bp: EnrollmentBlueprint): {
  enrollment: Enrollment;
  lessons: Lesson[];
  evaluations: DailyEvaluation[];
  rescheduleRequests: RescheduleRequest[];
} {
  const draft = draftFor(bp);
  const initial = generateInitialSchedule({
    enrollment: draft,
    closures: CLOSURES,
    unavailability: TEACHER_UNAVAILABILITY,
    allTeacherLessons: [],
    idGen,
  });
  if (!initial.ok) throw new Error(initial.error.message);

  let lessons = initial.value;
  let enrollment: Enrollment = { ...draft, endDate: recomputeEnrollmentEndDate(lessons, draft.id) };
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
      studentId: bp.studentId,
      teacherId: bp.teacherId,
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

  applyRealismPass();
  attachDemoJoinLinks(2);

  function applyRealismPass() {
    const todayIso = new Date().toISOString().slice(0, 10);
    for (const lesson of lessons) {
      if (lesson.status === "scheduled" && lesson.scheduledDate < todayIso) {
        const { updatedLesson } = markAttendance(lesson, "completed");
        replace(updatedLesson);
        enrollment = { ...enrollment, remainingLessons: enrollment.remainingLessons - 1 };
      }
    }
  }

  // Pre-registers a per-lesson override URL on the next N upcoming lessons — this is the
  // "admin registered a URL for this one class" path, which must keep taking priority
  // over the teacher's own fixed link (see teacherService.resolveJoinUrl).
  function attachDemoJoinLinks(count: number) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const upcomingScheduled = lessons
      .filter((l) => l.status === "scheduled" && l.scheduledDate >= todayIso)
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
    const demoUrls = ["https://zoom.us/j/1234567890", "https://zoom.us/j/1234567891"];
    upcomingScheduled.slice(0, count).forEach((lesson, i) => {
      replace({ ...lesson, meetingUrl: demoUrls[i] });
    });
  }

  return { enrollment, lessons, evaluations, rescheduleRequests };
}

/** Every other enrollment: a real generated schedule plus a realism pass (past scheduled
 * lessons marked completed) — enough variety to exercise multi-student/multi-teacher
 * screens without hand-crafting a full mutation history for each one. Deliberately does
 * NOT attach any per-lesson meetingUrl, so these students' "수업 입장" buttons resolve
 * purely from their teacher's registered link (teacherMeetingLinks) — the main new
 * behavior this update adds. */
function buildStandardSeed(bp: EnrollmentBlueprint): {
  enrollment: Enrollment;
  lessons: Lesson[];
  evaluations: DailyEvaluation[];
  rescheduleRequests: RescheduleRequest[];
} {
  const draft = draftFor(bp);
  const initial = generateInitialSchedule({
    enrollment: draft,
    closures: CLOSURES,
    unavailability: TEACHER_UNAVAILABILITY,
    allTeacherLessons: [],
    idGen,
  });
  if (!initial.ok) throw new Error(initial.error.message);

  let lessons = initial.value;
  let enrollment: Enrollment = { ...draft, endDate: recomputeEnrollmentEndDate(lessons, draft.id) };
  const evaluations: DailyEvaluation[] = [];
  const rescheduleRequests: RescheduleRequest[] = [];
  const replace = (lesson: Lesson) =>
    (lessons = lessons.map((l) => (l.id === lesson.id ? lesson : l)));

  const todayIso = new Date().toISOString().slice(0, 10);
  let markedOneCompleted = false;
  for (const lesson of lessons) {
    if (lesson.status === "scheduled" && lesson.scheduledDate < todayIso) {
      const { updatedLesson } = markAttendance(lesson, "completed");
      replace(updatedLesson);
      enrollment = { ...enrollment, remainingLessons: enrollment.remainingLessons - 1 };
      // Give the first past lesson of each enrollment a finished evaluation so every
      // teacher/student pairing has at least one real evaluation to view.
      if (!markedOneCompleted) {
        markedOneCompleted = true;
        updatedLesson.evaluationStatus = "completed";
        replace(updatedLesson);
        evaluations.push({
          id: idGen(),
          lessonId: updatedLesson.id,
          studentId: bp.studentId,
          teacherId: bp.teacherId,
          lessonSummary: `${DEMO_TEXTBOOK.currentUnit} 핵심 표현을 활용한 롤플레이 대화를 진행했습니다.`,
          strengths: "질문에 머뭇거리지 않고 바로 응답하려는 태도가 좋았습니다.",
          improvements: "문장을 조금 더 길게 확장해서 말하는 연습이 필요합니다.",
          teacherComment: "오늘도 적극적으로 참여해줘서 좋았어요. 다음 시간에도 이 페이스 유지해봐요!",
          pronunciation: { score: 4, comment: "전반적으로 또렷한 발음" },
          grammar: { score: 3, comment: "현재완료 표현에서 종종 실수" },
          vocabulary: { score: 4, comment: "주제 관련 어휘를 적절히 사용" },
          speaking: { score: 3, comment: "문장 길이를 조금 더 늘려볼 것" },
          source: "teacher",
        });
      }
    }
  }

  return { enrollment, lessons, evaluations, rescheduleRequests };
}

function buildSeed(): {
  enrollments: Enrollment[];
  lessons: Lesson[];
  evaluations: DailyEvaluation[];
  rescheduleRequests: RescheduleRequest[];
} {
  const enrollments: Enrollment[] = [];
  const lessons: Lesson[] = [];
  const evaluations: DailyEvaluation[] = [];
  const rescheduleRequests: RescheduleRequest[] = [];

  for (const bp of BLUEPRINTS) {
    const built = bp.enrollmentId === "enrollment-1" ? buildFlagshipSeed(bp) : buildStandardSeed(bp);
    enrollments.push(built.enrollment);
    lessons.push(...built.lessons);
    evaluations.push(...built.evaluations);
    rescheduleRequests.push(...built.rescheduleRequests);
  }

  return { enrollments, lessons, evaluations, rescheduleRequests };
}

export const CLASSROOM_SEED = buildSeed();
