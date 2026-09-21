// Student-facing mock service layer. Every function takes the requesting `actor` and
// checks it via src/lib/auth/permissions.ts BEFORE touching data — this is what stands
// in for "checked at the API level" until a real backend exists (see store.ts).
import {
  getDemoCourse,
  DEMO_LEVEL_TEST_RESULT,
  DEMO_TEXTBOOK,
  STUDENTS,
  type ClassroomCourse,
  type ClassroomTextbook,
  type LevelTestResult,
} from "../data/classroomMock";
import { INSTRUCTORS, type Instructor } from "../data/instructors";
import { MEETING_PLATFORMS, type MeetingPlatformId } from "../data/meetingPlatforms";
import { computeBlockedDates, extendSchedule } from "../lib/scheduling/engine";
import { todayIso } from "../lib/scheduling/dateUtils";
import { romanizeKoreanName } from "../lib/textUtils/romanizeKorean";
import { PRICING_SEED, getPrice } from "../data/pricing";
import type {
  CauseStatus,
  ClosureDate,
  DailyEvaluation,
  Enrollment,
  Lesson,
  RescheduleRequest,
  TeacherUnavailability,
  WeekDay,
} from "../lib/scheduling/types";
import type { EnrollmentDurationId, LessonFrequencyId } from "../lib/community/types";
import type { Actor, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { requireOwnStudent, requireRole, requireStudentOrOwningTeacherOrPermission } from "../lib/auth/permissions";
import { store, type TeacherMeetingLinks } from "./store";
import {
  fetchRealClassroom,
  fetchRealEnrollmentHistory,
  requestRealReschedule,
  requestRealHoldRelease,
  type RealClassroomSnapshot,
  type RealEnrollmentHistoryRow,
  type RealEnrollmentStatus,
  type RealLesson,
} from "./classroomBridgeService";
import type { EnrollmentStatus } from "../lib/scheduling/types";

let idCounter = 1000;
const idGen = () => `svc-${++idCounter}`;

// admin의 실제 EnrollmentStatus → 이 사이트 mock Enrollment.status로 변환한다.
// PAID/APPLIED는 실 계정이 이 화면을 볼 시점엔 이미 정상 수강 중인 셈이라 "active"로
// 합친다 — mock 상태값에는 그 구분이 아예 없다(접수 단계는 수강신청 리드일 뿐 아직
// "내 강의실"에 뜨는 수강 건이 아니므로).
function mapRealEnrollmentStatus(status: RealEnrollmentStatus): EnrollmentStatus {
  switch (status) {
    case "COMPLETED":
      return "completed";
    case "HOLDING":
      return "paused";
    default:
      return "active";
  }
}

export interface MeetingPlatformRow {
  id: MeetingPlatformId;
  name: string;
  shortName: string;
  brandColor: string;
  officialSiteUrl: string;
  downloadLinks: { pc: string; android: string; ios: string };
  enabled: boolean;
}

/** Public catalog read — deliberately NOT actor-gated, since the /install page shows
 * these cards to visitors who aren't logged in at all. */
export async function listMeetingPlatforms(): Promise<MeetingPlatformRow[]> {
  return MEETING_PLATFORMS.map((p) => ({ ...p, enabled: store.platformEnabled[p.id] }));
}

/** Public read of the class-entry button's timing window — not sensitive, only writes
 * (adminService.updateEntryWindowSettings) are permission-gated. */
export async function getEntryWindowSettings() {
  return store.entryWindow;
}

export interface MyClassroomSnapshot {
  enrollment: Enrollment;
  course: ClassroomCourse;
  teacher: Instructor;
  textbook: ClassroomTextbook;
  levelTestResult: LevelTestResult;
  lessons: Lesson[];
  /** This enrollment's teacher's own registered zoom/voov/teams links (see
   * lib/meeting/resolveJoinUrl for how a lesson's actual join URL is derived from this). */
  teacherMeetingLinks: TeacherMeetingLinks;
  /** All academy-wide closures, for the student calendar. */
  closures: ClosureDate[];
  /** Only this enrollment's teacher's unavailable dates (not other teachers'). */
  teacherUnavailability: TeacherUnavailability[];
  /** Every reschedule (student- or school-initiated) recorded against this enrollment —
   * see lib/scheduling/rescheduleAllowance for how these feed the allowance display. */
  rescheduleRequests: RescheduleRequest[];
  /** Every enrollment this student has ever had (past/current/upcoming), newest
   * startDate first — powers the "수업선택" history dropdown on the classroom page. */
  allEnrollments: Enrollment[];
}

/** Where an enrollment sits relative to today, purely by date range — independent of its
 * own `status` field (which tracks admin/system state like completed/expired/paused).
 * "완료된"/"진행중인"/"진행 예정인" 수강 내역 in the classroom page's history dropdown are
 * this classification, not Enrollment.status. */
export type EnrollmentTimeline = "upcoming" | "in_progress" | "ended";

export function classifyEnrollmentTimeline(enrollment: Enrollment, today = todayIso()): EnrollmentTimeline {
  if (enrollment.startDate > today) return "upcoming";
  if (enrollment.endDate < today) return "ended";
  return "in_progress";
}

function sortByStartDateDesc(enrollments: Enrollment[]): Enrollment[] {
  return [...enrollments].sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/** The enrollment shown by default when the student hasn't picked one from the history
 * dropdown yet: whichever is currently in progress, or — if none is (e.g. between two
 * enrollments) — the most recently started one. */
function findDefaultEnrollment(enrollments: Enrollment[]): Enrollment | undefined {
  const inProgress = enrollments.find((e) => classifyEnrollmentTimeline(e) === "in_progress");
  return inProgress ?? sortByStartDateDesc(enrollments)[0];
}

// admin-<studentId> 형태의 linkedId에서 뒤쪽 숫자만 뽑아낸다 — 실제 계정에 결정론적으로
// (매번 같은) mock Instructor를 하나 골라 붙여줄 때 쓴다(교사 프로필 사진/소개 같은
// 장식용 콘텐츠는 아직 admin에 없어 mock으로 대신한다 — 이름만 실제 강사 이름으로 덮어씀).
function numericIdFromLinkedId(linkedId: string): number {
  const match = /(\d+)$/.exec(linkedId);
  return match ? Number(match[1]) : 0;
}

function pickInstructorFor(linkedId: string, realTeacherName: string | null): Instructor {
  const base = INSTRUCTORS[numericIdFromLinkedId(linkedId) % INSTRUCTORS.length];
  return realTeacherName ? { ...base, name: realTeacherName, nameEn: realTeacherName } : base;
}

// 실제 수업 목록만으로 "주 며칠, 몇 시" 패턴을 역산한다 — admin의 Enrollment에는
// 요일별 개별 시각 재설정이 있을 수 있어 한 필드로 안 떨어지므로, 가장 흔한 요일
// 집합/시각을 그대로 쓴다(수업 카드의 "매주 ○○ 19:00" 표시용, 스케줄링 엔진 계산에는
// 안 쓰인다 — 실제 계정은 이미 확정된 lessons를 그대로 보여주기만 하기 때문).
function deriveWeeklyPattern(lessons: RealLesson[]): { weeklyDays: WeekDay[]; classTime: string } {
  const dayCounts = new Map<number, number>();
  const timeCounts = new Map<string, number>();
  for (const l of lessons) {
    const day = new Date(`${l.scheduledDate}T00:00:00Z`).getUTCDay();
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    timeCounts.set(l.scheduledTime, (timeCounts.get(l.scheduledTime) ?? 0) + 1);
  }
  const weeklyDays = [...dayCounts.keys()].sort((a, b) => a - b) as WeekDay[];
  let classTime = "19:00";
  let best = 0;
  for (const [time, count] of timeCounts) {
    if (count > best) {
      best = count;
      classTime = time;
    }
  }
  return { weeklyDays: weeklyDays.length > 0 ? weeklyDays : [1, 3, 5], classTime };
}

function mapRealLesson(lesson: RealLesson, enrollmentId: string): Lesson {
  return {
    id: String(lesson.id),
    enrollmentId,
    scheduledDate: lesson.scheduledDate,
    scheduledTime: lesson.scheduledTime,
    status: lesson.status,
    evaluationStatus: lesson.evaluationStatus,
    reason: lesson.reason,
  };
}

function mapRealClosure(closure: { id: number; date: string; reason: string }): ClosureDate {
  return { id: `real-closure-${closure.id}`, date: closure.date, type: "academy_closed", label: closure.reason };
}

// RescheduleAllowanceCard는 RescheduleRequest.initiatedBy만 읽으므로(rescheduleAllowance.ts
// 참고), 실제 계정은 새 레코드를 따로 두지 않고 "연기/휴강 상태인 수업"으로부터 그 자리에서
// 만들어 쓴다 — admin에는 이 개념이 LeaveRequest(학생연기 vs 관리자연기)로만 있고, Vite의
// "원래 수업을 대체할 새 수업" 개념(newLessonId/newDate)은 없으므로 원래 수업 자신을
// 그대로 가리킨다(실제로 언제로 밀렸는지는 이 화면 범위 밖 — 다음 실제 수업 목록에서 보임).
function synthesizeRescheduleRequests(enrollmentId: string, studentId: string, lessons: RealLesson[]): RescheduleRequest[] {
  return lessons
    .filter((l): l is RealLesson & { status: CauseStatus } =>
      l.status === "rescheduled" || l.status === "teacher_absent" || l.status === "academy_closed" || l.status === "admin_cancelled",
    )
    .map((l) => ({
      id: `real-rr-${l.id}`,
      lessonId: String(l.id),
      enrollmentId,
      studentId,
      requestedAt: `${l.scheduledDate}T00:00:00Z`,
      reason: l.reason ?? "",
      originalDate: l.scheduledDate,
      newLessonId: String(l.id),
      newDate: l.scheduledDate,
      initiatedBy: l.status === "rescheduled" ? "student" : "admin",
      cause: l.status,
      endDateBefore: "",
      endDateAfter: "",
      status: "applied" as const,
    }));
}

async function getMyClassroomFromRealBackend(
  actor: Actor,
  apiToken: string,
  enrollmentIdParam?: string,
): Promise<ServiceResult<MyClassroomSnapshot>> {
  const enrollmentId = enrollmentIdParam ? Number(enrollmentIdParam) : undefined;
  const real = await fetchRealClassroom(apiToken, enrollmentId);
  if (!real.ok) {
    return errResult(real.error.code === "SESSION_EXPIRED" ? "UNAUTHENTICATED" : "NOT_FOUND", real.error.message);
  }
  const snap: RealClassroomSnapshot = real.value;
  const enrollmentIdStr = String(snap.enrollment.id);
  const { weeklyDays, classTime } = deriveWeeklyPattern(snap.lessons);
  const teacher = pickInstructorFor(actor.linkedId!, snap.enrollment.teacherName);

  const enrollment: Enrollment = {
    id: enrollmentIdStr,
    studentId: actor.linkedId!,
    courseId: "course-1",
    teacherId: teacher.id,
    textbookId: "book-1",
    route: "main",
    startDate: snap.enrollment.startDate,
    endDate: snap.enrollment.endDate,
    totalLessons: snap.enrollment.totalLessons,
    remainingLessons: snap.enrollment.remainingLessons,
    lessonDurationMin: snap.enrollment.classDurationMin,
    weeklyDays,
    classTime,
    status: mapRealEnrollmentStatus(snap.enrollment.status),
    meetingPlatform: snap.enrollment.meetingPlatform,
    currentLevel: "b1",
  };

  return okResult({
    enrollment,
    course: getDemoCourse(),
    teacher,
    textbook: DEMO_TEXTBOOK,
    levelTestResult: DEMO_LEVEL_TEST_RESULT,
    lessons: snap.lessons.map((l) => mapRealLesson(l, enrollmentIdStr)),
    teacherMeetingLinks: snap.enrollment.teacherMeetingLinks,
    closures: snap.closures.map(mapRealClosure),
    teacherUnavailability: [],
    rescheduleRequests: synthesizeRescheduleRequests(enrollmentIdStr, actor.linkedId!, snap.lessons),
    allEnrollments: [enrollment],
  });
}

export async function getMyClassroom(
  actor: Actor,
  enrollmentId?: string,
  apiToken?: string | null,
): Promise<ServiceResult<MyClassroomSnapshot>> {
  const guard = requireRole(actor, ["student"]);
  if (!guard.ok) return guard;

  if (apiToken) {
    return getMyClassroomFromRealBackend(actor, apiToken, enrollmentId);
  }

  const studentId = actor.linkedId!;
  const myEnrollments = store.enrollments.filter((e) => e.studentId === studentId);
  const enrollment = enrollmentId
    ? myEnrollments.find((e) => e.id === enrollmentId)
    : findDefaultEnrollment(myEnrollments);
  if (!enrollment) return errResult("NOT_FOUND", "수강 정보를 찾을 수 없습니다.");

  const teacher = INSTRUCTORS.find((i) => i.id === enrollment.teacherId);
  if (!teacher) return errResult("NOT_FOUND", "담당 강사 정보를 찾을 수 없습니다.");

  const lessons = store.lessons
    .filter((l) => l.enrollmentId === enrollment.id)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

  return okResult({
    enrollment,
    course: getDemoCourse(),
    teacher,
    textbook: DEMO_TEXTBOOK,
    levelTestResult: DEMO_LEVEL_TEST_RESULT,
    lessons,
    teacherMeetingLinks: store.teacherMeetingLinks[enrollment.teacherId] ?? {},
    closures: store.closures,
    teacherUnavailability: store.teacherUnavailability.filter((u) => u.teacherId === enrollment.teacherId),
    rescheduleRequests: store.rescheduleRequests.filter((r) => r.enrollmentId === enrollment.id),
    allEnrollments: sortByStartDateDesc(myEnrollments),
  });
}

// 0=Sun..6=Sat weeklyDays.length -> nearest priced weekly frequency (see data/pricing.ts).
function frequencyIdFor(weeklyCount: number): LessonFrequencyId {
  if (weeklyCount <= 2) return "freq2";
  if (weeklyCount <= 3) return "freq3";
  return "freq5";
}

// Enrollment has no separate "plan length" field, so — same approach as
// lib/scheduling/rescheduleAllowance's contractedMonths — the purchased plan length is
// inferred from totalLessons at a nominal 4 lessons/week/month, then bucketed to the
// nearest priced package (1/3/6 months, see data/pricing.ts).
function durationIdFor(enrollment: Enrollment): EnrollmentDurationId {
  const months = Math.max(1, Math.round(enrollment.totalLessons / (enrollment.weeklyDays.length * 4)));
  if (months <= 1) return "1m";
  if (months <= 3) return "3m";
  return "6m";
}

const DURATION_MONTHS: Record<EnrollmentDurationId, 1 | 3 | 6> = { "1m": 1, "3m": 3, "6m": 6 };

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor((total % (24 * 60)) / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export interface EnrollmentHistoryStats {
  totalLessons: number;
  takenLessons: number;
  remainingLessons: number;
  attended: number;
  absent: number;
  /** Student-initiated reschedules (superseded originals with status "rescheduled"). */
  rescheduled: number;
  /** School-caused closures (teacher_absent + academy_closed). */
  teacherAbsent: number;
  adminCancelled: number;
  /** attended / (attended + absent) as a whole-number percent — 100 if none conducted yet. */
  attendanceRatePercent: number;
}

export interface EnrollmentHistoryRow {
  enrollment: Enrollment;
  teacher: Instructor;
  course: ClassroomCourse;
  timeline: EnrollmentTimeline;
  /** e.g. "본격 회화 · 디베이트 · 주5회 25분수업 3개월" — this mock has no separate
   * per-enrollment curriculum-track field, so the label is built from the fields that
   * genuinely exist on Enrollment instead of a fabricated one. */
  displayName: string;
  /** 1/3/6 — the priced plan length this enrollment was bucketed into (see
   * durationIdFor); shown on the receipt as "수강기간". */
  durationMonths: 1 | 3 | 6;
  classEndTime: string;
  stats: EnrollmentHistoryStats;
  /** KRW estimate from the pricing catalog, inferred from lesson length/frequency/plan
   * length — for the printable receipt only; no real payment record backs this mock. */
  estimatedPriceKRW?: number;
}

// 실제(admin DB 연동) 계정용 "수강내역" — getMyClassroomFromRealBackend와 같은 이유로
// mock store가 아니라 admin의 실제 데이터를 쓴다. 이전에는 apiToken이 있어도 이 함수가
// 무조건 mock store만 읽어서, 실제 계정은 "내 강의실"엔 수업이 보이는데 "수강내역"은
// 항상 비어 있었다(linkedId가 mock store의 어떤 studentId와도 안 맞기 때문).
function buildHistoryRowFromReal(
  actor: Actor,
  row: RealEnrollmentHistoryRow,
  course: ClassroomCourse,
): EnrollmentHistoryRow {
  const enrollmentIdStr = String(row.enrollment.id);
  const { weeklyDays, classTime } = deriveWeeklyPattern(row.lessons);
  const teacher = pickInstructorFor(actor.linkedId!, row.enrollment.teacherName);

  const enrollment: Enrollment = {
    id: enrollmentIdStr,
    studentId: actor.linkedId!,
    courseId: "course-1",
    teacherId: teacher.id,
    textbookId: "book-1",
    route: "main",
    startDate: row.enrollment.startDate,
    endDate: row.enrollment.endDate,
    totalLessons: row.enrollment.totalLessons,
    remainingLessons: row.enrollment.remainingLessons,
    lessonDurationMin: row.enrollment.classDurationMin,
    weeklyDays,
    classTime,
    status: mapRealEnrollmentStatus(row.enrollment.status),
    meetingPlatform: row.enrollment.meetingPlatform,
    currentLevel: "b1",
  };

  const attended = row.lessons.filter((l) => l.status === "completed").length;
  const absent = row.lessons.filter((l) => l.status === "absent").length;
  const rescheduled = row.lessons.filter((l) => l.status === "rescheduled").length;
  const teacherAbsent = row.lessons.filter((l) => l.status === "teacher_absent" || l.status === "academy_closed").length;
  const adminCancelled = row.lessons.filter((l) => l.status === "admin_cancelled").length;
  const conducted = attended + absent;

  const durationId = durationIdFor(enrollment);
  const frequencyId = frequencyIdFor(enrollment.weeklyDays.length);
  const monthsLabel = DURATION_MONTHS[durationId];

  return {
    enrollment,
    teacher,
    course,
    timeline: classifyEnrollmentTimeline(enrollment),
    displayName: `${course.courseName} · 주${enrollment.weeklyDays.length}회 ${enrollment.lessonDurationMin}분수업 ${monthsLabel}개월`,
    durationMonths: monthsLabel,
    classEndTime: addMinutesToTime(enrollment.classTime, enrollment.lessonDurationMin),
    stats: {
      totalLessons: enrollment.totalLessons,
      takenLessons: enrollment.totalLessons - enrollment.remainingLessons,
      remainingLessons: enrollment.remainingLessons,
      attended,
      absent,
      rescheduled,
      teacherAbsent,
      adminCancelled,
      attendanceRatePercent: conducted > 0 ? Math.round((attended / conducted) * 100) : 100,
    },
    estimatedPriceKRW: getPrice(PRICING_SEED, durationId, frequencyId, enrollment.lessonDurationMin as 25 | 50, "KRW"),
  };
}

async function listMyEnrollmentHistoryFromRealBackend(
  actor: Actor,
  apiToken: string,
): Promise<ServiceResult<EnrollmentHistoryRow[]>> {
  const real = await fetchRealEnrollmentHistory(apiToken);
  if (!real.ok) {
    return errResult(real.error.code === "SESSION_EXPIRED" ? "UNAUTHENTICATED" : "NOT_FOUND", real.error.message);
  }
  const course = getDemoCourse();
  return okResult(real.value.map((row) => buildHistoryRowFromReal(actor, row, course)));
}

/** Every enrollment this student has ever had, each enriched with attendance stats and a
 * price estimate — powers the classroom page's "수강내역" (enrollment history) list and
 * its printable 영수증/출석증 documents. */
export async function listMyEnrollmentHistory(
  actor: Actor,
  apiToken?: string | null,
): Promise<ServiceResult<EnrollmentHistoryRow[]>> {
  const guard = requireRole(actor, ["student"]);
  if (!guard.ok) return guard;

  if (apiToken) {
    return listMyEnrollmentHistoryFromRealBackend(actor, apiToken);
  }

  const studentId = actor.linkedId!;
  const myEnrollments = sortByStartDateDesc(store.enrollments.filter((e) => e.studentId === studentId));
  const course = getDemoCourse();

  const rows: EnrollmentHistoryRow[] = [];
  for (const enrollment of myEnrollments) {
    const teacher = INSTRUCTORS.find((i) => i.id === enrollment.teacherId);
    if (!teacher) continue;

    const lessons = store.lessons.filter((l) => l.enrollmentId === enrollment.id);
    const attended = lessons.filter((l) => l.status === "completed").length;
    const absent = lessons.filter((l) => l.status === "absent").length;
    const rescheduled = lessons.filter((l) => l.status === "rescheduled").length;
    const teacherAbsent = lessons.filter((l) => l.status === "teacher_absent" || l.status === "academy_closed").length;
    const adminCancelled = lessons.filter((l) => l.status === "admin_cancelled").length;
    const conducted = attended + absent;

    const durationId = durationIdFor(enrollment);
    const frequencyId = frequencyIdFor(enrollment.weeklyDays.length);
    const monthsLabel = DURATION_MONTHS[durationId];

    rows.push({
      enrollment,
      teacher,
      course,
      timeline: classifyEnrollmentTimeline(enrollment),
      displayName: `${course.courseName} · 주${enrollment.weeklyDays.length}회 ${enrollment.lessonDurationMin}분수업 ${monthsLabel}개월`,
      durationMonths: monthsLabel,
      classEndTime: addMinutesToTime(enrollment.classTime, enrollment.lessonDurationMin),
      stats: {
        totalLessons: enrollment.totalLessons,
        takenLessons: enrollment.totalLessons - enrollment.remainingLessons,
        remainingLessons: enrollment.remainingLessons,
        attended,
        absent,
        rescheduled,
        teacherAbsent,
        adminCancelled,
        attendanceRatePercent: conducted > 0 ? Math.round((attended / conducted) * 100) : 100,
      },
      estimatedPriceKRW: getPrice(
        PRICING_SEED,
        durationId,
        frequencyId,
        enrollment.lessonDurationMin as 25 | 50,
        "KRW",
      ),
    });
  }

  return okResult(rows);
}

export async function getEvaluation(actor: Actor, lessonId: string): Promise<ServiceResult<DailyEvaluation | null>> {
  const lesson = store.lessons.find((l) => l.id === lessonId);
  if (!lesson) return errResult("NOT_FOUND", "수업을 찾을 수 없습니다.");
  const enrollment = store.enrollments.find((e) => e.id === lesson.enrollmentId);
  if (!enrollment) return errResult("NOT_FOUND", "수강 정보를 찾을 수 없습니다.");

  const guard = requireStudentOrOwningTeacherOrPermission(
    actor,
    enrollment.studentId,
    enrollment.teacherId,
    "evaluations",
  );
  if (!guard.ok) return guard;

  return okResult(store.evaluations.find((e) => e.lessonId === lessonId) ?? null);
}

export async function requestReschedule(
  actor: Actor,
  lessonId: string,
  reason: string,
  apiToken?: string | null,
): Promise<ServiceResult<RescheduleRequest>> {
  if (apiToken) {
    const real = await requestRealReschedule(apiToken, Number(lessonId), reason);
    if (!real.ok) {
      return errResult(real.error.code === "SESSION_EXPIRED" ? "UNAUTHENTICATED" : "NOT_FOUND", real.error.message);
    }
    const snap = real.value;
    const updated = snap.lessons.find((l) => l.id === Number(lessonId));
    if (!updated) return errResult("NOT_FOUND", "수업을 찾을 수 없습니다.");
    // admin에는 "원래 수업을 대체하는 새 수업" 개념이 없어(LEAVE 처리 + 수강 종료일
    // 연장뿐), newLessonId/newDate는 원래 수업 자신을 그대로 가리킨다 — 호출부
    // (RescheduleConfirmModal)는 실제 계정일 때 이 값으로 "새 수업일"을 보여주지 않는다.
    return okResult({
      id: `real-rr-${updated.id}`,
      lessonId: String(updated.id),
      enrollmentId: String(snap.enrollment.id),
      studentId: actor.linkedId!,
      requestedAt: new Date().toISOString(),
      reason,
      originalDate: updated.scheduledDate,
      newLessonId: String(updated.id),
      newDate: updated.scheduledDate,
      initiatedBy: "student",
      cause: "rescheduled",
      endDateBefore: "",
      endDateAfter: snap.enrollment.endDate,
      status: "applied",
    });
  }

  const lesson = store.lessons.find((l) => l.id === lessonId);
  if (!lesson) return errResult("NOT_FOUND", "수업을 찾을 수 없습니다.");
  const enrollment = store.enrollments.find((e) => e.id === lesson.enrollmentId);
  if (!enrollment) return errResult("NOT_FOUND", "수강 정보를 찾을 수 없습니다.");

  const guard = requireOwnStudent(actor, enrollment.studentId);
  if (!guard.ok) return guard;

  const allTeacherLessons = enrollmentsLessonsForTeacher(enrollment.teacherId);
  const result = extendSchedule({
    enrollment,
    allEnrollmentLessons: store.lessons,
    allTeacherLessons,
    targetLesson: lesson,
    cause: "rescheduled",
    initiatedBy: "student",
    reason,
    closures: store.closures,
    unavailability: store.teacherUnavailability,
    nowMs: Date.now(),
    idGen,
  });
  if (!result.ok) return result;

  store.lessons = [
    ...store.lessons.map((l) =>
      l.id === result.value.updatedOriginalLesson.id ? result.value.updatedOriginalLesson : l,
    ),
    result.value.newLesson,
  ];
  store.enrollments = store.enrollments.map((e) =>
    e.id === result.value.updatedEnrollment.id ? result.value.updatedEnrollment : e,
  );
  store.rescheduleRequests = [...store.rescheduleRequests, result.value.rescheduleRequest];

  return okResult(result.value.rescheduleRequest);
}

/** "홀드 해제 요청" — 승인 대기 없이 요청 즉시 적용된다(학생 셀프 연기 신청과 같은
 * 정책). 실 계정만 의미가 있다 — mock 계정은 Enrollment.status가 애초에 "paused"가
 * 될 일이 없으므로(관리자 mock 패널에 홀드 개념이 없다) 호출될 일이 없지만, 방어적으로
 * status만 "active"로 되돌려준다. */
export async function requestHoldRelease(
  actor: Actor,
  enrollmentId: string,
  apiToken?: string | null,
): Promise<ServiceResult<void>> {
  if (apiToken) {
    const real = await requestRealHoldRelease(apiToken, Number(enrollmentId));
    if (!real.ok) {
      return errResult(real.error.code === "SESSION_EXPIRED" ? "UNAUTHENTICATED" : "NOT_FOUND", real.error.message);
    }
    return okResult(undefined);
  }

  const enrollment = store.enrollments.find((e) => e.id === enrollmentId);
  if (!enrollment) return errResult("NOT_FOUND", "수강 정보를 찾을 수 없습니다.");
  const guard = requireOwnStudent(actor, enrollment.studentId);
  if (!guard.ok) return guard;

  store.enrollments = store.enrollments.map((e) => (e.id === enrollmentId ? { ...e, status: "active" } : e));
  return okResult(undefined);
}

export function enrollmentsLessonsForTeacher(teacherId: string): Lesson[] {
  const enrollmentIds = new Set(
    store.enrollments.filter((e) => e.teacherId === teacherId).map((e) => e.id),
  );
  return store.lessons.filter((l) => enrollmentIds.has(l.enrollmentId));
}

// Re-exported so other service modules (teacherService/adminService) can build blocked-date
// sets the same way the scheduling engine already does, without duplicating the merge logic.
export function blockedDatesFor(teacherId: string): Set<string> {
  return computeBlockedDates(store.closures, store.teacherUnavailability, teacherId);
}

export function findStudentName(studentId: string): string {
  return STUDENTS.find((s) => s.id === studentId)?.name ?? studentId;
}

export function findStudentEnglishName(studentId: string): string {
  const student = STUDENTS.find((s) => s.id === studentId);
  if (!student) return studentId;
  return student.englishName ?? romanizeKoreanName(student.name);
}
