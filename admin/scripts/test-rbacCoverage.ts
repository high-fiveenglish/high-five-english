// 접근 통제 "목록 고정" 테스트 — 새 페이지 / 서버 액션 / API 라우트가 권한 검사 없이 들어오는 것을 막는다.
//
// 대상(자동 탐색, 표에 없으면 실패):
//   · app 아래 모든 page.tsx  — (admin) 페이지는 PAGES 표, 강사/학생 포털 페이지는 requireTeacher/requireStudent, 그 외는 OTHER_PAGES(로그인)
//   · src 아래 "use server" 가 들어간 모든 파일 — (admin)은 ACTIONS 표, 포털은 requireTeacher/requireStudent, lib는 LIB_ACTIONS 표, 로그인 액션은 LOGIN_ACTIONS
//   · app/api 아래 모든 route.ts — API 표에서 종류(관리자 토큰 / 관리자 쿠키 / 학생 토큰 / 공개 / 로그인 / 토큰 검증 / 웹훅)를 반드시 선언
// 검사 내용: 표에 적힌 권한 호출이 있는지(+ 본사 전용 · 협력사 소속 검사)뿐 아니라, 그 검사가 **보호 대상 데이터 조회/변경보다 먼저**
// 실행되는지(검사 앞에 prisma/tx 접근이나 다른 await 가 없는지)도 소스 순서로 확인한다.
// 동작(실제로 막히는가)은 test-rbacAccess.integration.ts 가 PostgreSQL에서 검증한다. 이 테스트는 DB가 필요 없다.
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(__dirname, "../src");
const APP = path.join(SRC, "app");
const ADMIN = path.join(APP, "(admin)");

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const readRaw = (p: string) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const read = (p: string) => strip(readRaw(p));
const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const rel = (base: string, f: string) => path.relative(base, f).split(path.sep).join("/");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ───────────────────────── 순서 검사 도구 ─────────────────────────
// 보호 대상 데이터에 닿는 코드: prisma./tx. 직접 접근, 또는 데이터를 읽고 쓰는 도우미 호출.
const DATA_ACCESS = /\b(prisma|tx|db)\.\w+|\brunTx\(|\$transaction\(|\$queryRaw|\$executeRaw/;
// 변경(쓰기) 호출
const MUTATION = /\.(update|updateMany|delete|deleteMany|create|createMany|upsert)\(|\$transaction\(|\brunTx\(|\bapply\w+\(|\brelease\w+\(/;
// 검사 앞에 와도 되는 await: 요청 인자와 인증(로그인 확인) 호출뿐
const ALLOWED_PRE_AWAIT = /^(params|searchParams|requireBackofficeActor|requireTeacher|requireStudent|requirePageActor|actorFromAdminApiToken|request\.json|request\.formData)$/;

function firstIndex(s: string, re: RegExp, from = 0): number {
  const m = re.exec(s.slice(from));
  return m ? from + m.index : -1;
}
/** guardIdx 앞에 데이터 접근이나 허용되지 않은 await 가 있으면 그 내용을, 없으면 null. */
function preGuardProblem(body: string, guardIdx: number): string | null {
  const pre = body.slice(0, guardIdx);
  const data = DATA_ACCESS.exec(pre);
  if (data) return `검사 앞에 데이터 접근 '${data[0]}'`;
  const re = /\bawait\s+([A-Za-z_][\w.]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pre))) {
    if (!ALLOWED_PRE_AWAIT.test(m[1])) return `검사 앞에 await ${m[1]}`;
  }
  return null;
}
function orderOk(name: string, body: string, guardRe: RegExp, what: string) {
  const idx = firstIndex(body, guardRe);
  if (idx < 0) {
    check(`${name}: ${what} 호출이 있어야 함`, false);
    return -1;
  }
  const problem = preGuardProblem(body, idx);
  check(`${name}: ${what}가 데이터 접근보다 먼저`, problem === null, problem ?? "");
  return idx;
}
/** 함수 본문(주석 제거된 소스에서 시작 위치부터 다음 export 직전까지). */
function bodiesOf(src: string, re: RegExp): Map<string, string> {
  const out = new Map<string, string>();
  const g = new RegExp(re.source, "g");
  const starts: { name: string; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = g.exec(src))) starts.push({ name: m[1], at: m.index });
  starts.forEach((s, i) => out.set(s.name, src.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : undefined)));
  return out;
}
const actionBodies = (src: string) => bodiesOf(src, /export async function (\w+)\b/);
const defaultBody = (src: string): string => {
  const m = /export default (?:async )?function \w+/.exec(src);
  return m ? src.slice(m.index) : "";
};
const isUseServer = (raw: string) => /^(\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*["']use server["']/.test(raw);

// ───────────────────────── 1. (admin) 페이지 ─────────────────────────
type PagePolicy =
  | { perm: string; denyAgent?: true; scope?: "student" | "levelTest" | "enrollment" }
  | { admin: true }
  | { custom: RegExp[]; guard: RegExp; note: string };

const P = (perm: string, extra: { denyAgent?: true; scope?: "student" | "levelTest" | "enrollment" } = {}): PagePolicy => ({ perm, ...extra });
const HQ = { denyAgent: true } as const;

const PAGES: Record<string, PagePolicy> = {
  "page.tsx": { custom: [/actor\.role === "AGENT"/, /teacher_stats\.view/], guard: /requireBackofficeActor\(\)/, note: "홈 — 로그인한 모두에게 열림, 역할별로 다른 통계(협력사는 자기 협력사만)" },
  "accounts/page.tsx": { admin: true },
  "accounts/new/page.tsx": { admin: true },
  "audit-log/page.tsx": { admin: true },
  "permissions/page.tsx": { admin: true },
  "session-plan/page.tsx": { admin: true },
  "my-profile/page.tsx": { custom: [/actor\.role !== "AGENT"/], guard: /requireBackofficeActor\(\)/, note: "본인 정보 수정(협력사 전용), 대상은 항상 로그인한 본인" },
  "settlements/page.tsx": { custom: [/requirePermission\(actor, "enrollments\.view"\)/, /scopeAgentId/], guard: /requirePermission\(actor, "enrollments\.view"\)/, note: "수강 결제 현황 — 협력사는 자기 협력사만" },
  "student-holds/page.tsx": { custom: [/requirePermission\(actor, "enrollments\.view"\)/, /scopeAgentId/], guard: /requirePermission\(actor, "enrollments\.view"\)/, note: "학생 홀드 — 협력사는 자기 협력사만" },
  "leave-requests/page.tsx": {
    custom: [/requirePagePermission\(actor, tab === "academy" \? "academy_closures\.view" : "leave_requests\.view"\)/, /const tab: TabKey = isAgent \? "academy"/],
    guard: /requirePagePermission\(actor, tab === "academy"/,
    note: "탭별 권한: 전체수업휴강=academy_closures.view, 학생/관리자 휴강=leave_requests.view. 협력사는 전체수업휴강 탭으로 고정",
  },
  // 본사 전용(협력사 메뉴에 없는 화면)
  "teachers/page.tsx": P("teachers.view", HQ),
  "teachers/new/page.tsx": P("teachers.create", HQ),
  "teachers/[id]/page.tsx": P("teachers.view", HQ),
  "agencies/page.tsx": P("agencies.view", HQ),
  "agencies/[id]/page.tsx": P("agencies.view", HQ),
  "bulletins/page.tsx": P("bulletins.view", HQ),
  "bulletins/new/page.tsx": P("bulletins.create", HQ),
  "bulletins/[id]/page.tsx": P("bulletins.view", HQ),
  "consult-channels/page.tsx": P("consult_channels.view", HQ),
  "deleted-sessions/page.tsx": P("schedules.view", HQ),
  "overlapping-sessions/page.tsx": P("schedules.view", HQ),
  "evaluations/page.tsx": P("evaluations.view", HQ),
  "evaluations/[id]/page.tsx": P("evaluations.view", HQ),
  "home-notices/page.tsx": P("home_notices.view", HQ),
  "home-notices/new/page.tsx": P("home_notices.create", HQ),
  "home-notices/[id]/page.tsx": P("home_notices.view", HQ),
  "monthly-evaluations/page.tsx": P("monthly_evaluations.view", HQ),
  "monthly-evaluations/[enrollmentId]/[cycleNumber]/page.tsx": P("monthly_evaluations.view", HQ),
  "reservations/page.tsx": P("reservations.view", HQ),
  "reservations/new/page.tsx": P("reservations.create", HQ),
  "reviews/page.tsx": P("reviews.view", HQ),
  "schedule/new/page.tsx": P("schedules.create", HQ),
  // 협력사에도 열려 있는 화면 — 권한 키 + 협력사 범위
  "students/page.tsx": P("students.view"),
  "students/new/page.tsx": P("students.create"),
  "students/[id]/page.tsx": P("students.view", { scope: "student" }),
  "students/[id]/sessions/page.tsx": P("schedules.view", { scope: "student" }),
  "students/[id]/enrollment/page.tsx": P("enrollments.create", { scope: "student" }),
  "students/[id]/level-test/page.tsx": P("level_tests.create", { scope: "student" }),
  "enrollments/page.tsx": P("enrollments.view"),
  "enrollments/new/page.tsx": P("enrollments.create"),
  "enrollments/[id]/edit/page.tsx": P("enrollments.update", { scope: "enrollment" }),
  "level-tests/page.tsx": P("level_tests.view"),
  "level-tests/new/page.tsx": P("level_tests.create"),
  "level-tests/[id]/page.tsx": P("level_tests.view", { scope: "levelTest" }),
  "level-tests/[id]/result/page.tsx": P("level_tests.view", { scope: "levelTest" }),
  "schedule/page.tsx": P("schedules.view"),
  "pricing/page.tsx": P("pricing.view"),
  // PR #15(연기·유급휴가)에서 추가된 화면
  "teacher-paid-leaves/page.tsx": P("leave_requests.view", HQ),
};

const adminPages = walk(ADMIN).filter((f) => f.endsWith("page.tsx"));
for (const f of adminPages) {
  const key = rel(ADMIN, f);
  const policy = PAGES[key];
  if (!policy) {
    check(`page ${key}: 정책 표에 있어야 함`, false, "새 페이지는 test-rbacCoverage.ts의 PAGES 표에 권한 정책을 적고 그 검사를 구현해야 합니다");
    continue;
  }
  const body = defaultBody(read(f));
  const label = `page ${key}`;
  check(`${label}: 기본 export 함수를 찾음`, body.length > 0);
  if ("admin" in policy) {
    orderOk(label, body, /actor\.role !== "ADMIN"\) notFound\(\)|requirePageAdmin\(/, "ADMIN 전용 검사");
  } else if ("custom" in policy) {
    check(`${label}: ${policy.note}`, policy.custom.every((re) => re.test(body)), "정해진 검사 코드를 찾지 못했습니다");
    orderOk(label, body, policy.guard, "인증/권한 검사");
  } else {
    const m = new RegExp(`requirePageActor\\("${esc(policy.perm)}"(, \\{ denyAgent: true \\})?\\)`).exec(body);
    check(`${label}: requirePageActor("${policy.perm}") 호출`, !!m);
    if (m) {
      check(`${label}: denyAgent ${policy.denyAgent ? "필요" : "없어야 함"}`, !!m[1] === !!policy.denyAgent);
      const problem = preGuardProblem(body, body.indexOf(m[0]));
      check(`${label}: 권한 검사가 데이터 접근보다 먼저`, problem === null, problem ?? "");
    }
    if (policy.scope) {
      const sm = new RegExp(`requirePageInScope\\(actor, "${policy.scope}"`).exec(body);
      check(`${label}: 협력사 소속 검사(${policy.scope})`, !!sm);
      if (sm) {
        const firstData = firstIndex(body, DATA_ACCESS);
        check(`${label}: 소속 검사가 데이터 조회보다 먼저`, firstData < 0 || sm.index < firstData, `첫 데이터 접근 위치가 소속 검사보다 앞`);
      }
    }
  }
}
for (const key of Object.keys(PAGES)) check(`PAGES 표의 ${key}가 실제로 존재`, fs.existsSync(path.join(ADMIN, key)));

// ───────────────────────── 2. 그 밖의 페이지(포털 · 로그인) ─────────────────────────
const OTHER_PAGES = new Set(["login/page.tsx", "student/login/page.tsx", "teacher/login/page.tsx"]); // 로그인 화면 — 인증 전
for (const f of walk(APP).filter((x) => x.endsWith("page.tsx") && !x.startsWith(ADMIN))) {
  const key = rel(APP, f);
  if (OTHER_PAGES.has(key)) continue;
  const portal = key.startsWith("teacher/") ? "teacher" : key.startsWith("student/") ? "student" : null;
  if (!portal) {
    check(`page ${key}: 분류되어 있어야 함`, false, "(admin)·강사 포털·학생 포털·OTHER_PAGES 어디에도 속하지 않는 새 페이지");
    continue;
  }
  const guard = portal === "teacher" ? /requireTeacher\(\)/ : /requireStudent\(\)/;
  orderOk(`portal page ${key}`, defaultBody(read(f)), guard, portal === "teacher" ? "requireTeacher()" : "requireStudent()");
}

// ───────────────────────── 3. 서버 액션 ─────────────────────────
type ActionPolicy = {
  perm?: string; // requirePermission(actor, "<perm>")
  anyPerm?: string[]; // hasPermission(actor, "<a>") 중 하나 + ForbiddenError
  hq?: true; // requireHeadquarters(actor) — 본사 전용
  scope?: string; // requireInScope(prisma, actor, "<kind>", ...)
  inline?: RegExp; // 소속 검사를 그 함수 안에서 직접 구현한 기존 코드(변경보다 먼저여야 함)
  also?: RegExp[];
  alsoUnordered?: true; // 검사를 트랜잭션 안의 도메인 함수에 위임하는 경우 — 순서는 위임 대상 파일을 따로 검사한다
  note?: string;
};
const A = (perm: string, o: Omit<ActionPolicy, "perm"> = {}): ActionPolicy => ({ perm, ...o });
const H = { hq: true } as const;
const SELF: ActionPolicy = { note: "세션 종료/본인 계정 — 대상이 항상 로그인한 본인" };
const ADMIN_ROLE: ActionPolicy = { also: [/requireAdminRole\(\)/], note: "ADMIN 전용" };

const ACTIONS: Record<string, Record<string, ActionPolicy>> = {
  "accounts/actions.ts": { createAccount: ADMIN_ROLE, updateAccountRole: ADMIN_ROLE, updateAccountStatus: ADMIN_ROLE },
  "actions.ts": { logout: SELF },
  "agencies/actions.ts": { updateAgentBranding: A("agencies.update", H), updateAgentConsultChannel: A("agencies.update", H) },
  "bulletins/actions.ts": { createBulletin: A("bulletins.create", H), updateBulletin: A("bulletins.update", H), deleteBulletin: A("bulletins.delete", H) },
  "consult-channels/actions.ts": { updateConsultChannel: A("consult_channels.update", H) },
  "enrollments/actions.ts": {
    updateEnrollmentRequestStatus: A("enrollment_requests.update", H),
    findAvailableTeachersForSchedule: A("enrollments.view"),
    // PR #15: 연기 횟수 조정은 본사 전용(협력사 계정은 오류 반환)
    adjustEnrollmentLeaveQuota: A("enrollments.update", { also: [/actor\.role === "AGENT"\) return \{ error/], note: "협력사 계정 거부" }),
    createEnrollment: A("enrollments.create", { inline: /student\.agentId !== actor\.agentId/ }),
    updateEnrollment: A("enrollments.update", { inline: /existing\.agentId !== actor\.agentId/ }),
    updateEnrollmentStatus: A("enrollments.update", { inline: /existing\.agentId !== actor\.agentId/ }),
    updateEnrollmentPrice: A("enrollments.update", { inline: /assertOwnsEnrollment\(actor/ }),
    deleteEnrollment: A("enrollments.delete", { scope: "enrollment" }),
  },
  "evaluations/actions.ts": { saveEvaluationAdmin: A("evaluations.update", H) },
  "home-notices/actions.ts": { createHomeNotice: A("home_notices.create", H), updateHomeNotice: A("home_notices.update", H), deleteHomeNotice: A("home_notices.delete", H) },
  "leave-requests/actions.ts": {
    createLeaveRequestAdmin: A("leave_requests.update", { scope: "session" }),
    approveLeaveRequest: A("leave_requests.update", { scope: "leaveRequest" }),
    rejectLeaveRequest: A("leave_requests.update", { scope: "leaveRequest" }),
    revertLeaveRequest: A("leave_requests.revert", { scope: "leaveRequest" }),
    createAcademyClosure: A("academy_closures.create", { inline: /agentId/ }),
    // PR #15: 소속 검사가 lib/academyClosureFlow.ts(트랜잭션 안, 잠금·변경 전)로 옮겨졌다 — 아래 별도 검사 참고
    revertAcademyClosure: A("academy_closures.revert", { also: [/agentScopeId: actor\.role === "AGENT" \? actor\.agentId : null/], alsoUnordered: true, note: "협력사 범위를 도메인 함수에 전달" }),
  },
  "level-tests/actions.ts": {
    createLevelTest: { also: [/createLevelTestCore\(/], note: "권한·소속 검사는 createLevelTestCore(level_tests.create + 학생 소속)" },
    updateLevelTest: A("level_tests.update", { scope: "levelTest" }),
    confirmLevelTestSchedule: A("level_tests.update", { scope: "levelTest" }),
    revertLevelTestConfirmation: A("level_tests.update", { scope: "levelTest" }),
    setLevelTestOutcome: A("level_tests.update", { scope: "levelTest" }),
    reopenLevelTestConfirmation: A("level_tests.update", { scope: "levelTest" }),
    deleteLevelTest: A("level_tests.delete", { scope: "levelTest" }),
  },
  "monthly-evaluations/actions.ts": { saveMonthlyEvaluation: A("monthly_evaluations.update", H), deleteMonthlyEvaluation: A("monthly_evaluations.delete", H) },
  "my-profile/actions.ts": { updateOwnProfile: A("own_profile.update", { note: "대상은 항상 로그인한 본인" }) },
  "permissions/actions.ts": { togglePermission: { also: [/actor\.role !== "ADMIN"/], note: "ADMIN 전용" } },
  "pricing/actions.ts": {
    updatePricingCell: A("pricing.update", { inline: /row\.duration\.agentId !== actor\.agentId/ }),
    ensureAgentPricing: A("pricing.update", { inline: /agentId !== actor\.agentId/ }),
  },
  "reservations/actions.ts": { createReservation: A("reservations.create", H), cancelReservation: A("reservations.update", H) },
  "reviews/actions.ts": { updateReviewViews: A("reviews.delete", H), deleteReviewPost: A("reviews.delete", H) },
  "schedule/actions.ts": {
    createClassSession: A("schedules.create", { scope: "enrollment" }),
    updateClassSessionStatus: A("schedules.update", { scope: "session" }),
    deleteClassSession: A("schedules.delete", { scope: "session" }),
    restoreClassSession: A("schedules.update", { scope: "session" }),
  },
  "students/actions.ts": {
    createStudent: A("students.create", { inline: /agentId/ }),
    updateStudent: A("students.update", { inline: /assertOwnsStudent\(actor/ }),
    deleteStudent: A("students.delete", { inline: /assertOwnsStudent\(actor/ }),
    restoreStudent: A("students.delete", { scope: "student" }),
    addConsultationNote: A("students.update", { inline: /assertOwnsStudent\(actor/ }),
    updateConsultationNote: A("students.update", { inline: /assertOwnsStudent\(actor/ }),
    deleteConsultationNote: A("students.update", { inline: /assertOwnsStudent\(actor/ }),
    impersonateStudent: A("students.impersonate", { scope: "student" }),
    endImpersonation: SELF,
  },
  "students/[id]/level-test/actions.ts": { createLevelTestForStudent: { also: [/createLevelTestCore\(/], note: "권한·소속 검사는 createLevelTestCore" } },
  "students/[id]/sessions/actions.ts": {
    // PR #15에서 추가된 액션 — 학생 소속은 assertStudentInScope(오류 반환)로 확인
    resetEvaluation: A("schedules.update", { inline: /assertStudentInScope\(actor, studentId\)/ }),
    adjustStudentLeaveQuota: A("enrollments.update", { inline: /assertStudentInScope\(actor, studentId\)/ }),
    getAvailableTeachersForSlot: A("schedules.create"),
    addSupplementSession: A("schedules.create", { scope: "student" }),
    applyStudentLeave: A("leave_requests.update", { scope: "student" }),
    applyAdminLeave: A("leave_requests.update", { scope: "student" }),
    cancelSession: A("schedules.update", { scope: "student" }),
    revertCancelSession: A("schedules.update", { scope: "student" }),
  },
  "teachers/actions.ts": {
    createTeacher: A("teachers.create", H),
    updateTeacher: A("teachers.update", H),
    deleteTeacher: A("teachers.delete", H),
    impersonateTeacher: A("teachers.impersonate", H),
    endTeacherImpersonation: SELF,
    bulkHardDeleteTeachers: A("teachers.delete", H),
    updateTeacherAccountStatus: A("teachers.update", H),
  },
  "teachers/mediaUploadActions.ts": { getTeacherMediaUploadUrl: A("teachers.update", H) },
  // PR #15: 정규 강사 유급휴가 — 모든 액션이 actorForPaidLeave()(leave_requests.update + 본사 전용)를 먼저 부른다
  "teacher-paid-leaves/actions.ts": {
    createPaidLeave: { also: [/actorForPaidLeave\(\)/], note: "actorForPaidLeave" },
    approvePaidLeaveAction: { also: [/actorForPaidLeave\(\)/], note: "actorForPaidLeave" },
    rejectPaidLeaveAction: { also: [/actorForPaidLeave\(\)/], note: "actorForPaidLeave" },
    revokePaidLeaveAction: { also: [/actorForPaidLeave\(\)/], note: "actorForPaidLeave" },
  },
};

// src/lib 아래 "use server" — 클라이언트가 직접 호출할 수 있는 서버 액션이다
const LIB_ACTIONS: Record<string, Record<string, ActionPolicy>> = {
  "lib/levelTestCreate.ts": { createLevelTestCore: A("level_tests.create", { scope: "student" }) },
  "lib/teacherAvailability.ts": {
    getAvailableTeachersForLevelTestSlot: { anyPerm: ["level_tests.create", "level_tests.update"], note: "일정을 잡는(등록/확정) 권한이 있어야 강사 근무가능시간을 조회" },
  },
};
const LOGIN_ACTIONS = new Set(["app/login/actions.ts", "app/student/login/actions.ts", "app/teacher/login/actions.ts"]); // 인증 전 호출

function checkAction(label: string, body: string, policy: ActionPolicy) {
  const idxs: number[] = [];
  if (policy.perm) idxs.push(orderOk(label, body, new RegExp(`requirePermission\\(actor, "${esc(policy.perm)}"\\)`), `requirePermission("${policy.perm}")`));
  if (policy.anyPerm) {
    for (const k of policy.anyPerm) check(`${label}: hasPermission("${k}")`, new RegExp(`hasPermission\\(actor, "${esc(k)}"\\)`).test(body));
    check(`${label}: 권한이 없으면 ForbiddenError`, /throw new ForbiddenError\(\)/.test(body));
    idxs.push(orderOk(label, body, new RegExp(`hasPermission\\(actor, "${esc(policy.anyPerm[0])}"\\)`), "권한 검사"));
  }
  check(`${label}: 본사 전용 검사 ${policy.hq ? "필요" : "없음"}`, /requireHeadquarters\(actor\)/.test(body) === !!policy.hq);
  if (policy.hq) idxs.push(orderOk(label, body, /requireHeadquarters\(actor\)/, "requireHeadquarters"));
  if (policy.scope) {
    const re = new RegExp(`requireInScope\\(prisma, actor, "${policy.scope}"`);
    check(`${label}: 협력사 소속 검사(${policy.scope})`, re.test(body));
    const si = firstIndex(body, re);
    const firstData = firstIndex(body, DATA_ACCESS);
    check(`${label}: 소속 검사가 데이터 조회/변경보다 먼저`, si >= 0 && (firstData < 0 || si < firstData));
  }
  if (policy.inline) {
    const ii = firstIndex(body, policy.inline);
    check(`${label}: 협력사 소속 검사(기존 코드)`, ii >= 0);
    const mi = firstIndex(body, MUTATION);
    check(`${label}: 소속 검사가 변경보다 먼저`, ii >= 0 && (mi < 0 || ii < mi));
  }
  for (const re of policy.also ?? []) {
    check(`${label}: ${policy.note ?? re}`, re.test(body));
    const ai = firstIndex(body, re);
    const firstData = firstIndex(body, DATA_ACCESS);
    if (!policy.alsoUnordered) check(`${label}: 검사/위임이 데이터 접근보다 먼저`, ai >= 0 && (firstData < 0 || ai < firstData));
  }
  if (!policy.perm && !policy.anyPerm && !policy.also && !policy.note) check(`${label}: 검사 정의가 비어 있음`, false);
  void idxs;
}

const allServerFiles = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f) && /use server/.test(fs.readFileSync(f, "utf8")));
for (const f of allServerFiles) {
  const raw = readRaw(f);
  const keyFromSrc = rel(SRC, f);
  check(`server action 파일 ${keyFromSrc}: "use server"가 파일 맨 앞에 있어야 함(함수 안쪽 인라인 서버 액션은 이 테스트가 볼 수 없다)`, isUseServer(raw));
  const bodies = actionBodies(strip(raw));
  if (f.startsWith(ADMIN)) {
    const key = rel(ADMIN, f);
    const table = ACTIONS[key];
    if (!table) {
      check(`actions ${key}: 정책 표에 있어야 함`, false, "새 서버 액션 파일은 test-rbacCoverage.ts의 ACTIONS 표에 정책을 적어야 합니다");
      continue;
    }
    for (const [name, body] of bodies) {
      const policy = table[name];
      if (!policy) check(`actions ${key}#${name}: 정책 표에 있어야 함`, false);
      else checkAction(`actions ${key}#${name}`, body, policy);
    }
    for (const name of Object.keys(table)) check(`ACTIONS 표의 ${key}#${name}가 실제로 존재`, bodies.has(name));
  } else if (keyFromSrc.startsWith("lib/")) {
    const table = LIB_ACTIONS[keyFromSrc];
    if (!table) {
      check(`lib 서버 액션 ${keyFromSrc}: 정책 표에 있어야 함`, false, "src/lib 아래 새 \"use server\" 파일은 LIB_ACTIONS 표에 정책을 적어야 합니다(클라이언트가 직접 호출할 수 있음)");
      continue;
    }
    for (const [name, body] of bodies) {
      const policy = table[name];
      if (!policy) check(`lib ${keyFromSrc}#${name}: 정책 표에 있어야 함`, false);
      else checkAction(`lib ${keyFromSrc}#${name}`, body, policy);
    }
    for (const name of Object.keys(table)) check(`LIB_ACTIONS 표의 ${keyFromSrc}#${name}가 실제로 존재`, bodies.has(name));
  } else if (LOGIN_ACTIONS.has(keyFromSrc)) {
    continue;
  } else {
    const portal = keyFromSrc.startsWith("app/teacher/") ? "teacher" : keyFromSrc.startsWith("app/student/") ? "student" : null;
    if (!portal) {
      check(`server action ${keyFromSrc}: 분류되어 있어야 함`, false, "(admin)·lib·강사/학생 포털·LOGIN_ACTIONS 어디에도 속하지 않음");
      continue;
    }
    // 로그인 확인을 파일 안의 도우미(authenticatedTeacher)로 묶은 곳도 있다 — 도우미가 requireTeacher()를 먼저 부르는지도 확인한다
    const helper = portal === "teacher" && /async function authenticatedTeacher\(\)\s*\{\s*const teacher = await requireTeacher\(\)/.test(strip(raw));
    const guard = portal === "teacher" ? (helper ? /authenticatedTeacher\(\)/ : /requireTeacher\(\)/) : /requireStudent\(\)/;
    for (const [name, body] of bodies) orderOk(`portal action ${keyFromSrc}#${name}`, body, guard, portal === "teacher" ? "requireTeacher()" : "requireStudent()");
  }
}
for (const key of Object.keys(ACTIONS)) check(`ACTIONS 표의 파일 ${key}가 실제로 존재`, fs.existsSync(path.join(ADMIN, key)));
for (const key of Object.keys(LIB_ACTIONS)) check(`LIB_ACTIONS 표의 파일 ${key}가 실제로 존재`, fs.existsSync(path.join(SRC, key)));

// PR #15 위임 대상 검사: 도우미/도메인 함수 안에 실제 검사가 있는지
{
  const paid = read(path.join(ADMIN, "teacher-paid-leaves/actions.ts"));
  const helper = /async function actorForPaidLeave\(\)\s*\{([\s\S]*?)\n\}/.exec(paid)?.[1] ?? "";
  const iLogin = helper.indexOf("requireBackofficeActor()");
  const iPerm = helper.indexOf('requirePermission(actor, "leave_requests.update")');
  const iHq = helper.indexOf("requireHeadquarters(actor)");
  check("teacher-paid-leaves: actorForPaidLeave가 로그인 → leave_requests.update → 본사 전용 순서", iLogin >= 0 && iLogin < iPerm && iPerm < iHq);
  const flow = read(path.join(SRC, "lib/academyClosureFlow.ts"));
  const revert = /export async function revertAcademyClosure\b[\s\S]*/.exec(flow)?.[0] ?? "";
  const scopeAt = revert.indexOf("if (input.agentScopeId && closure.agentId !== input.agentScopeId) return null;");
  const firstWrite = firstIndex(revert, /lockClosureDay\(|\.delete\(|revertReschedule\(/);
  check("academyClosureFlow.revertAcademyClosure: 협력사 범위 검사가 잠금·변경보다 먼저", scopeAt >= 0 && scopeAt < firstWrite);
}

// ───────────────────────── 4. 모든 API 라우트 ─────────────────────────
// 종류를 반드시 선언한다. 같은 종류는 같은 검사를 받는다.
//   adminToken : 마케팅 사이트 관리자 패널의 Bearer 토큰(actorFromAdminApiToken). perms=쓰기 메서드의 권한 키, hq=본사 전용(협력사 403)
//   adminCookie: 관리자 세션 쿠키(requireBackofficeActor) + requirePermission
//   studentToken: 학생 Bearer 토큰(studentIdFromAuthHeader/Request) — 401 + 본인 소유 조회
//   public     : 인증 없이 공개되는 읽기/가입 엔드포인트(사유 필수)
//   login      : 자격 증명 확인 엔드포인트
//   verify     : 서명된 토큰을 검증하는 엔드포인트
//   webhook    : 비밀 헤더를 확인하는 외부 웹훅
type ApiPolicy =
  | { kind: "adminToken"; perms: string[]; hq: boolean; note?: string; publicMethods?: string[] }
  | { kind: "adminCookie"; perm: string }
  | { kind: "studentToken" }
  | { kind: "public"; why: string }
  | { kind: "login" | "verify" | "webhook"; check: RegExp };

const API_ROOT = path.join(SRC, "app/api");
const API: Record<string, ApiPolicy> = {
  "public/consult-channels/[id]/route.ts": { kind: "adminToken", perms: ["consult_channels.update"], hq: true },
  "public/home-notices/route.ts": { kind: "adminToken", perms: ["home_notices.create"], hq: true },
  "public/home-notices/[id]/route.ts": { kind: "adminToken", perms: ["home_notices.update", "home_notices.delete"], hq: true, publicMethods: ["GET"] }, // GET: 공개된 공지 1건
  "public/pricing/route.ts": { kind: "adminToken", perms: ["pricing.update"], hq: true, publicMethods: ["GET"] }, // GET: 공개 가격표
  "public/reviews/[id]/route.ts": { kind: "adminToken", perms: [], hq: false, note: "reviews.delete" }, // 후기: 읽기/댓글은 로그인한 관리자·학생, 삭제는 reviews.delete(본사) 또는 본인 글
  "public/reviews/route.ts": { kind: "adminToken", perms: [], hq: false },
  "public/consult-channels/route.ts": { kind: "adminToken", perms: [], hq: false, publicMethods: ["GET"] }, // GET: 관리자 토큰이 없으면 공개 채널만
  "teacher-stats/export/route.ts": { kind: "adminCookie", perm: "teacher_stats.view" },
  "public/classroom/route.ts": { kind: "studentToken" },
  "public/classroom/history/route.ts": { kind: "studentToken" },
  "public/classroom/evaluation/route.ts": { kind: "studentToken" },
  "public/classroom/reschedule/route.ts": { kind: "studentToken" },
  "public/classroom/hold-release/route.ts": { kind: "studentToken" },
  "public/kakao-link/route.ts": { kind: "studentToken" },
  "public/level-test/route.ts": { kind: "studentToken" },
  "public/level-test/mine/route.ts": { kind: "studentToken" },
  "public/student-profile/route.ts": { kind: "studentToken" },
  "public/enrollment-requests/route.ts": { kind: "studentToken" },
  "public/agency-branding/route.ts": { kind: "public", why: "마케팅 사이트가 도메인으로 협력사 브랜딩(로고·상호)을 읽는 공개 정보" },
  "public/teachers/route.ts": { kind: "public", why: "마케팅 사이트의 공개 강사 소개" },
  "public/teachers/[id]/voice/route.ts": { kind: "public", why: "공개 강사 소개의 음성 샘플" },
  "public/student-signup/route.ts": { kind: "public", why: "학생 가입(인증 전)" },
  "public/admin-login/route.ts": { kind: "login", check: /verifyBackofficeLogin\(/ },
  "public/student-login/route.ts": { kind: "login", check: /verifyStudentLogin\(/ },
  "public/kakao-login/route.ts": { kind: "login", check: /kakao/i },
  "public/admin-bridge/route.ts": { kind: "verify", check: /verifyAdminBridgeToken\(/ },
  "public/sso/verify/route.ts": { kind: "verify", check: /verifySsoToken\(/ },
  "public/assemblyai-webhook/route.ts": { kind: "webhook", check: /ASSEMBLYAI_WEBHOOK_SECRET/ },
};

const apiHandlers = (src: string) => bodiesOf(src, /export async function (GET|POST|PUT|PATCH|DELETE)\b/);
const AUTH_ANY = /actorFromAdminApiToken\(|studentIdFromAuthHeader\(|studentIdFromRequest\b|requireBackofficeActor\(\)/;
for (const f of walk(API_ROOT).filter((x) => x.endsWith("route.ts"))) {
  const key = rel(API_ROOT, f);
  const policy = API[key];
  if (!policy) {
    check(`api ${key}: 정책 표에 있어야 함`, false, "새 API 라우트는 test-rbacCoverage.ts의 API 표에 종류와 검사를 선언해야 합니다");
    continue;
  }
  const src = read(f);
  const handlers = apiHandlers(src);
  check(`api ${key}: 핸들러를 찾음`, handlers.size > 0);
  switch (policy.kind) {
    case "adminToken": {
      check(`api ${key}: actorFromAdminApiToken 사용`, /actorFromAdminApiToken\(/.test(src));
      for (const perm of policy.perms) check(`api ${key}: requirePermission(actor, "${perm}")`, new RegExp(`requirePermission\\(actor, "${esc(perm)}"\\)`).test(src));
      const permCalls = (src.match(/requirePermission\(actor, "/g) ?? []).length;
      const hqCalls = (src.match(/requireHeadquarters\(actor\)/g) ?? []).length;
      check(`api ${key}: 쓰기 권한 검사마다 본사 전용 검사 ${policy.hq ? "필요" : "없음"}`, policy.hq ? hqCalls === permCalls && permCalls > 0 : hqCalls === 0);
      if (policy.note === "reviews.delete") check(`api ${key}: 후기 삭제는 reviews.delete 또는 본인 글`, /hasPermission\(admin, "reviews\.delete"\)/.test(src) && /authorAdminName !== admin\.name/.test(src));
      for (const [method, body] of handlers) {
        if (/requirePermission\(actor, "/.test(body)) orderOk(`api ${key} ${method}`, body, /requirePermission\(actor, "/, "requirePermission");
        else if (policy.publicMethods?.includes(method)) {
          // 공개 읽기: 쓰기 호출이 없어야 한다(공지 조회수 증가만 예외)
          const writes = /\.(update|delete|create|upsert)\(/.test(body);
          check(`api ${key} ${method}: 공개 읽기에 쓰기 호출 없음`, !writes || key === "public/home-notices/[id]/route.ts");
        } else orderOk(`api ${key} ${method}`, body, /actorFromAdminApiToken\(/, "토큰 확인");
      }
      break;
    }
    case "adminCookie":
      for (const [method, body] of handlers) {
        orderOk(`api ${key} ${method}`, body, new RegExp(`requirePermission\\(actor, "${esc(policy.perm)}"\\)`), `requirePermission("${policy.perm}")`);
      }
      break;
    case "studentToken":
      if (key === "public/classroom/evaluation/route.ts") {
        // 처리 규칙은 lib/studentEvaluation.ts가 가지고 test-studentEvaluationApi.ts가 검증한다 — 여기서는 연결만 고정
        check(`api ${key}: 학생 토큰을 핸들러에 연결`, /studentIdFromRequest: studentIdFromAuthHeader/.test(src));
        check(`api ${key}: 본인 소유는 조회 조건(studentId)으로 강제`, /classSession: \{ studentId, deletedAt: null \}/.test(src));
      } else {
        for (const [method, body] of handlers) orderOk(`api ${key} ${method}`, body, /studentIdFrom(AuthHeader|Request)\b/, "학생 토큰 확인");
      }
      break;
    case "public":
      check(`api ${key}: 공개 엔드포인트는 관리자 데이터/쓰기를 하지 않음(${policy.why})`, !/\.(update|delete|create|upsert)\(/.test(src) || key === "public/student-signup/route.ts");
      check(`api ${key}: 공개 엔드포인트가 관리자 인증을 쓰지 않음`, !AUTH_ANY.test(src));
      break;
    case "login":
    case "verify":
    case "webhook":
      check(`api ${key}: ${policy.kind} 검증 코드`, policy.check.test(src));
      break;
  }
}
for (const key of Object.keys(API)) check(`API 표의 ${key}가 실제로 존재`, fs.existsSync(path.join(API_ROOT, key)));
// route.ts 가 아닌 다른 이름의 핸들러 파일(예: app 아래 route.js)이 생기는 것도 막는다
for (const f of walk(APP).filter((x) => /\/route\.(js|jsx|mjs|tsx)$/.test(x.split(path.sep).join("/")))) check(`${rel(APP, f)}: route.ts 외 형식의 라우트는 이 테스트가 볼 수 없음`, false);

// ───────────────────────── 5. 보조 모듈 ─────────────────────────
{
  const scope = read(path.join(SRC, "lib/agentScope.ts"));
  for (const name of ["canAccessInScope", "requireInScope", "requireHeadquarters", "agentScopeId"]) check(`agentScope.ts가 ${name}을 export`, new RegExp(`export (async )?function ${name}\\b`).test(scope));
  const rbac = read(path.join(SRC, "lib/rbac.ts"));
  check("rbac.ts: requirePermission이 hasPermission을 쓴다(판정 기준 하나)", /export function hasPermission/.test(rbac) && /if \(hasPermission\(actor, key\)\) return;/.test(rbac));
}

console.log(failed === 0 ? `PASS: ${passed} checks` : `FAILED: ${failed} failed / ${passed} passed`);
process.exit(failed === 0 ? 0 : 1);
