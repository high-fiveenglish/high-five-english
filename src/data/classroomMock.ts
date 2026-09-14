// Seeded demo data for the "내 강의실" feature and the role/permission system. There is
// no real backend yet, so this stands in for a database — every enrollment below is
// built using the actual scheduling engine (not hand-typed statuses) so the demo
// genuinely exercises the same logic that will run for real once a backend exists. See
// src/services/*.ts for the mutable in-memory stores this seeds, and
// src/lib/scheduling/ for the engine itself.
import i18n from "../i18n/config";
import { INSTRUCTORS } from "./instructors";
import type { MeetingPlatformId } from "./meetingPlatforms";
import type { CEFRLevel } from "./textbookCatalog";
import {
  extendSchedule,
  generateInitialSchedule,
  markAttendance,
  recomputeEnrollmentEndDate,
} from "../lib/scheduling/engine";
import { addDays } from "../lib/scheduling/dateUtils";
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
  /** The name shown on the student's behalf wherever displaying their legal Korean
   * name isn't appropriate (e.g. a public review) — see findStudentEnglishName. If
   * unset, findStudentEnglishName falls back to romanizing `name`. */
  englishName?: string;
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
  { id: "demo-student", name: "김민준", englishName: "Minjun Kim" },
  { id: "student-2", name: "이서연", englishName: "Seoyeon Lee" },
  { id: "student-3", name: "박도윤", englishName: "Doyoon Park" },
  { id: "student-4", name: "최지우", englishName: "Jiwoo Choi" },
  { id: "student-5", name: "정하은", englishName: "Haeun Jung" },
  { id: "student-6", name: "강태오", englishName: "Taeo Kang" },
];

// Demo loyalty-point balances, keyed by studentId — earned in the real product via
// referral (5,000pt to the referring friend once the referred student registers) and
// writing a review (1,000pt per review), per the "수강등록" 적립금 policy. No earning
// automation exists yet in this mock; these are just starting balances so the
// EnrollmentRegisterPage's "잔여 적립금" display has something real to show.
export const STUDENT_POINTS_SEED: Record<string, number> = {
  "demo-student": 3000,
  "student-2": 1000,
  "student-3": 0,
  "student-4": 5000,
  "student-5": 0,
  "student-6": 1000,
};

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
  /** Optional per-weekday time overrides, for an "admin-registered" demo enrollment
   * with a genuinely mixed schedule — see Enrollment.weeklyTimes. */
  weeklyTimes?: Enrollment["weeklyTimes"];
  totalLessons: number;
  meetingPlatform: MeetingPlatformId;
  route: string;
  currentLevel: CEFRLevel;
}

// Seeded page-progress trail for already-happened lessons only — a future/still-scheduled
// lesson genuinely has no progress yet, so it's left unset (see withProgress below).
const PROGRESS_LOG = [
  `${DEMO_TEXTBOOK.title} · Unit 4 p.32`,
  `${DEMO_TEXTBOOK.title} · Unit 4 p.38`,
  `${DEMO_TEXTBOOK.title} · Unit 5 p.6`,
  `${DEMO_TEXTBOOK.title} · Unit 5 p.14`,
  `${DEMO_TEXTBOOK.title} · Unit 5 p.22`,
  `${DEMO_TEXTBOOK.title} · Unit 5 p.29`,
];

function withProgress(lessons: Lesson[]): Lesson[] {
  const sorted = [...lessons].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  let i = 0;
  return sorted.map((lesson) => {
    // Only an actually-attended lesson advances progress — an absence, a hold, or a
    // still-scheduled lesson has nothing to record (matches submitLessonOutcome).
    if (lesson.status !== "completed") return lesson;
    return { ...lesson, progress: PROGRESS_LOG[i++ % PROGRESS_LOG.length] };
  });
}

const BLUEPRINTS: EnrollmentBlueprint[] = [
  {
    enrollmentId: "enrollment-1",
    studentId: "demo-student",
    teacherId: TEACHER_JAMES.id,
    startDate: "2026-09-01",
    weeklyDays: [1, 2, 3, 4, 5],
    classTime: "19:00",
    totalLessons: 60,
    meetingPlatform: "zoom",
    route: "main",
    currentLevel: "b1",
  },
  // A finished past enrollment and a not-yet-started future one for the SAME student —
  // demo-student is deliberately given all three timeline states (ended/in-progress/
  // upcoming; see classroomService.classifyEnrollmentTimeline) so the classroom page's
  // "수업선택" history dropdown has real past/current/upcoming records to switch between.
  {
    enrollmentId: "enrollment-1-past",
    studentId: "demo-student",
    teacherId: TEACHER_SARAH.id,
    startDate: "2026-03-02",
    weeklyDays: [2, 4],
    classTime: "18:00",
    totalLessons: 16,
    meetingPlatform: "voov",
    route: "main",
    currentLevel: "a2",
  },
  {
    enrollmentId: "enrollment-1-future",
    studentId: "demo-student",
    teacherId: TEACHER_EMILY.id,
    startDate: "2027-01-04",
    weeklyDays: [1, 3, 5],
    classTime: "20:00",
    totalLessons: 24,
    meetingPlatform: "teams",
    route: "main",
    currentLevel: "b1",
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
    route: "mnmenglish",
    currentLevel: "a2",
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
    route: "main",
    currentLevel: "b2",
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
    route: "synergyenglish",
    currentLevel: "pre-a1",
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
    route: "main",
    currentLevel: "b2plus",
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
    route: "mnmenglish",
    currentLevel: "a1",
  },
  // Demonstrates an admin-registered enrollment with a genuinely mixed weekly
  // schedule (see Enrollment.weeklyTimes / engine.resolveClassTime): Mon/Fri use the
  // shared `classTime` (20:00), Wednesday overrides to 20:30. Deliberately booked
  // against James, whose other two enrollments above never touch Mon/Wed/Fri at these
  // times, so this seeds cleanly with zero real conflicts.
  {
    enrollmentId: "enrollment-6-mixed",
    studentId: "student-6",
    teacherId: TEACHER_JAMES.id,
    startDate: "2026-09-07",
    weeklyDays: [1, 3, 5],
    classTime: "20:00",
    weeklyTimes: { 3: "20:30" },
    totalLessons: 12,
    meetingPlatform: "zoom",
    route: "main",
    currentLevel: "b1",
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
    weeklyTimes: bp.weeklyTimes,
    status: "active",
    meetingPlatform: bp.meetingPlatform,
    route: bp.route,
    currentLevel: bp.currentLevel,
  };
}

// 9 reschedules total, spread across lesson dates well after the evaluated block below
// (2026-09-14 through 2026-09-24) so none of them touch the 9/1-9/7 lessons that must
// stay completed-with-evaluation. Alternates student/teacher-initiated for variety.
const RESCHEDULE_TARGET_DATES = [
  "2026-09-14",
  "2026-09-15",
  "2026-09-16",
  "2026-09-17",
  "2026-09-18",
  "2026-09-21",
  "2026-09-22",
  "2026-09-23",
  "2026-09-24",
];

// The 5 weekday lessons from 9/1 through 9/7 — each gets a completed, fully-written
// evaluation per the "9월7일까지는 평가서가 모두 작성" requirement.
const EVALUATED_DATES = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07"];

const EVALUATION_CONTENT = [
  {
    lessonSummary: "Unit 5 'Making Conversation' 대화 패턴을 활용해 자기소개 롤플레이를 진행했습니다.",
    strengths: "처음 만나는 상황을 가정한 질문에도 머뭇거리지 않고 답변했습니다.",
    improvements: "현재시제와 현재진행형을 혼동하는 경우가 있어 다음 수업에서 짚어줄 예정입니다.",
    teacherComment: "9월 첫 수업인데도 긴장하지 않고 잘 참여해줬어요!",
    pronunciation: { score: 4, comment: "모음 발음이 또렷함" },
    grammar: { score: 3, comment: "현재시제/현재진행형 혼용" },
    vocabulary: { score: 4, comment: "일상 표현을 적절히 사용" },
    speaking: { score: 4, comment: "망설임 없이 문장을 완성함" },
  },
  {
    lessonSummary: "지난 수업에서 배운 표현을 복습하고, 취미에 대해 이야기 나누는 활동을 했습니다.",
    strengths: "배운 표현을 새로운 문맥에 바로 응용하려는 시도가 인상적이었습니다.",
    improvements: "복수형 명사 사용에서 실수가 반복되어 추가 연습이 필요합니다.",
    teacherComment: "취미 얘기할 때 눈빛이 반짝였어요. 다음에도 이 주제로 더 얘기해봐요!",
    pronunciation: { score: 4, comment: "억양이 자연스러워짐" },
    grammar: { score: 3, comment: "복수형 명사 실수 반복" },
    vocabulary: { score: 4, comment: "취미 관련 어휘를 잘 활용함" },
    speaking: { score: 4, comment: "문장 길이가 조금씩 늘어남" },
  },
  {
    lessonSummary: "질문-답변 패턴을 활용해 하루 일과를 설명하는 연습을 진행했습니다.",
    strengths: "순서를 나타내는 연결어(first, then, after that)를 자연스럽게 사용했습니다.",
    improvements: "과거시제 동사 활용에서 반복적인 실수가 있어 집중 교정이 필요합니다.",
    teacherComment: "오늘 자유발화 비중이 확실히 늘었어요!",
    pronunciation: { score: 4, comment: "th 발음이 안정적으로 자리잡음" },
    grammar: { score: 3, comment: "과거시제 동사 변형에서 실수 반복" },
    vocabulary: { score: 4, comment: "일상 표현 어휘량이 꾸준히 늘고 있음" },
    speaking: { score: 4, comment: "머뭇거림 없이 문장을 끝까지 완성함" },
  },
  {
    lessonSummary: "Unit 5 핵심 표현을 활용한 짧은 역할극으로 실전 회화 연습을 진행했습니다.",
    strengths: "질문에 바로 응답하려는 적극적인 태도가 좋았습니다.",
    improvements: "문장을 조금 더 길게 확장해서 말하는 연습이 필요합니다.",
    teacherComment: "오늘도 적극적으로 참여해줘서 좋았어요. 이 페이스 유지해봐요!",
    pronunciation: { score: 4, comment: "전반적으로 또렷한 발음" },
    grammar: { score: 3, comment: "현재완료 표현에서 종종 실수" },
    vocabulary: { score: 4, comment: "주제 관련 어휘를 적절히 사용" },
    speaking: { score: 3, comment: "문장 길이를 조금 더 늘려볼 것" },
  },
  {
    lessonSummary: "한 주를 마무리하며 지난 한 주간 배운 표현을 정리하고 자유 발화 시간을 가졌습니다.",
    strengths: "일주일간 배운 표현을 스스로 정리해서 문장을 만들어낸 점이 좋았습니다.",
    improvements: "발화 속도가 다소 느린 편이라 자유 발화 비중을 늘리는 것을 추천합니다.",
    teacherComment: "한 주 동안 정말 많이 늘었어요. 다음 주도 이 흐름대로 가봅시다!",
    pronunciation: { score: 4, comment: "문장 강세가 안정적임" },
    grammar: { score: 4, comment: "이번 주 배운 문법을 잘 적용함" },
    vocabulary: { score: 4, comment: "복습한 표현을 능동적으로 사용" },
    speaking: { score: 3, comment: "발화 속도를 조금 더 높이면 좋음" },
  },
] as const;

/** The flagship demo enrollment for demo-student: 60 lessons, 5x/week (Mon-Fri) starting
 * 2026-09-01, with 9 total reschedules and every lesson through 2026-09-07 completed
 * with a written evaluation — matches the specific scenario requested for verification.
 * Lessons after that (up to "today") are picked up generically by applyRealismPass, so
 * the most recent one demonstrates the "평가서 작성 중" (evaluation still pending) state. */
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

  // --- 9 reschedules, alternating student/teacher-initiated ---
  RESCHEDULE_TARGET_DATES.forEach((date, i) => {
    const target = byDate(date);
    if (!target) return;
    const studentInitiated = i % 2 === 0;
    const result = extendSchedule({
      enrollment,
      allEnrollmentLessons: lessons,
      allTeacherLessons: lessons,
      targetLesson: target,
      cause: studentInitiated ? "rescheduled" : "teacher_absent",
      initiatedBy: studentInitiated ? "student" : "teacher",
      reason: studentInitiated ? "개인 사정으로 참석 어려움" : "강사 개인 사정으로 휴강",
      closures: CLOSURES,
      unavailability: TEACHER_UNAVAILABILITY,
      // Student reschedules need >=4h lead time before class; simulate a few days'
      // notice either way using a timestamp well before the target lesson.
      nowMs: Date.parse(`${addDays(date, studentInitiated ? -5 : -1)}T08:00:00+09:00`),
      idGen,
    });
    if (result.ok) {
      replace(result.value.updatedOriginalLesson);
      lessons = [...lessons, result.value.newLesson];
      enrollment = result.value.updatedEnrollment;
      rescheduleRequests.push(result.value.rescheduleRequest);
    }
  });

  // --- every lesson from 9/1 through 9/7: completed with a fully-written evaluation ---
  EVALUATED_DATES.forEach((date, i) => {
    const lesson = byDate(date);
    if (!lesson) return;
    const { updatedLesson } = markAttendance(lesson, "completed");
    updatedLesson.evaluationStatus = "completed";
    replace(updatedLesson);
    enrollment = { ...enrollment, remainingLessons: enrollment.remainingLessons - 1 };
    const content = EVALUATION_CONTENT[i % EVALUATION_CONTENT.length];
    evaluations.push({
      id: idGen(),
      lessonId: updatedLesson.id,
      studentId: bp.studentId,
      teacherId: bp.teacherId,
      ...content,
      source: "teacher",
    });
  });

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

  return { enrollment, lessons: withProgress(lessons), evaluations, rescheduleRequests };
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

  return { enrollment, lessons: withProgress(lessons), evaluations, rescheduleRequests };
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
