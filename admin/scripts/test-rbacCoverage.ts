// 접근 통제 "목록 고정" 테스트 — 새 관리자 페이지 / 서버 액션 / 관리자 토큰 API가 권한 검사 없이 들어오는 것을 막는다.
//
// (admin) 아래 모든 page.tsx, "use server" 파일의 모든 export 함수, 관리자 토큰을 받는 /api/public 라우트가
// 아래 정책 표에 있어야 하고, 표에 적힌 검사(권한 키 · 본사 전용 · 협력사 소속 검사)가 실제 소스에 있어야 한다.
// 표에 없는 항목이 생기면 실패한다 — 새 화면을 만들 때는 표에 정책을 적고 그 검사를 구현해야 한다.
// 동작(실제로 막히는가)은 test-rbacAccess.integration.ts가 PostgreSQL에서 검증한다. 이 테스트는 DB가 필요 없다.
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(__dirname, "../src");
const ADMIN = path.join(SRC, "app/(admin)");

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
const read = (p: string) => strip(fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n"));
const walk = (d: string): string[] =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const rel = (base: string, f: string) => path.relative(base, f).split(path.sep).join("/");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ───────────────────────── 페이지 ─────────────────────────
type PagePolicy =
  | { perm: string; denyAgent?: true; scope?: "student" | "levelTest" | "inline" }
  | { admin: true }
  | { custom: RegExp[]; note: string };

const P = (perm: string, extra: { denyAgent?: true; scope?: "student" | "levelTest" | "inline" } = {}): PagePolicy => ({ perm, ...extra });
const HQ = { denyAgent: true } as const;

const PAGES: Record<string, PagePolicy> = {
  "page.tsx": { custom: [/requireBackofficeActor\(\)/, /actor\.role === "AGENT"/, /teacher_stats\.view/], note: "홈 — 역할별로 다른 화면(협력사는 자기 협력사 통계만)" },
  "accounts/page.tsx": { admin: true },
  "accounts/new/page.tsx": { admin: true },
  "audit-log/page.tsx": { admin: true },
  "permissions/page.tsx": { admin: true },
  "session-plan/page.tsx": { admin: true },
  "my-profile/page.tsx": { custom: [/requireBackofficeActor\(\)/, /actor\.role !== "AGENT"/], note: "본인 정보 수정(협력사 전용), 대상은 항상 로그인한 본인" },
  "settlements/page.tsx": { custom: [/requirePermission\(actor, "enrollments\.view"\)/, /scopeAgentId/], note: "수강 결제 현황 — 협력사는 자기 협력사만" },
  "student-holds/page.tsx": { custom: [/requirePermission\(actor, "enrollments\.view"\)/, /scopeAgentId/], note: "학생 홀드 — 협력사는 자기 협력사만" },
  "leave-requests/page.tsx": {
    custom: [/requirePagePermission\(actor, tab === "academy" \? "academy_closures\.view" : "leave_requests\.view"\)/, /const tab: TabKey = isAgent \? "academy"/],
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
  "students/[id]/page.tsx": P("students.view", { scope: "inline" }),
  "students/[id]/sessions/page.tsx": P("schedules.view", { scope: "student" }),
  "students/[id]/enrollment/page.tsx": P("enrollments.create", { scope: "student" }),
  "students/[id]/level-test/page.tsx": P("level_tests.create", { scope: "student" }),
  "enrollments/page.tsx": P("enrollments.view"),
  "enrollments/new/page.tsx": P("enrollments.create"),
  "enrollments/[id]/edit/page.tsx": P("enrollments.update", { scope: "inline" }),
  "level-tests/page.tsx": P("level_tests.view"),
  "level-tests/new/page.tsx": P("level_tests.create"),
  "level-tests/[id]/page.tsx": P("level_tests.view", { scope: "levelTest" }),
  "level-tests/[id]/result/page.tsx": P("level_tests.view", { scope: "levelTest" }),
  "schedule/page.tsx": P("schedules.view"),
  "pricing/page.tsx": P("pricing.view"),
};

const pageFiles = walk(ADMIN).filter((f) => f.endsWith("page.tsx"));
for (const f of pageFiles) {
  const key = rel(ADMIN, f);
  const policy = PAGES[key];
  if (!policy) {
    check(`page ${key}: 정책 표에 있어야 함`, false, "새 페이지는 test-rbacCoverage.ts의 PAGES 표에 권한 정책을 적고 그 검사를 구현해야 합니다");
    continue;
  }
  const src = read(f);
  if ("admin" in policy) {
    check(`page ${key}: ADMIN 전용 검사`, /actor\.role !== "ADMIN"\) notFound\(\)/.test(src) || /requirePageAdmin\(/.test(src));
  } else if ("custom" in policy) {
    check(`page ${key}: ${policy.note}`, policy.custom.every((re) => re.test(src)), "정해진 검사 코드를 찾지 못했습니다");
  } else {
    const m = new RegExp(`requirePageActor\\("${esc(policy.perm)}"(, \\{ denyAgent: true \\})?\\)`).exec(src);
    check(`page ${key}: requirePageActor("${policy.perm}") 호출`, !!m);
    if (m) check(`page ${key}: denyAgent ${policy.denyAgent ? "필요" : "없어야 함"}`, !!m[1] === !!policy.denyAgent);
    if (policy.scope === "student" || policy.scope === "levelTest") {
      check(`page ${key}: 협력사 소속 검사(${policy.scope})`, new RegExp(`requirePageInScope\\(actor, "${policy.scope}"`).test(src));
    } else if (policy.scope === "inline") {
      check(`page ${key}: 협력사 소속 검사(inline)`, /actor\.role === "AGENT" && \w+\.agentId !== actor\.agentId/.test(src));
    }
  }
}
for (const key of Object.keys(PAGES)) check(`PAGES 표의 ${key}가 실제로 존재`, fs.existsSync(path.join(ADMIN, key)));

// ───────────────────────── 서버 액션 ─────────────────────────
type ActionPolicy = {
  perm?: string; // requirePermission(actor, "<perm>")
  hq?: true; // requireHeadquarters(actor) — 본사 전용
  scope?: string; // requireInScope(prisma, actor, "<kind>", ...)
  inline?: RegExp; // 소속 검사를 그 함수 안에서 직접 구현한 기존 코드
  also?: RegExp[];
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
    revertAcademyClosure: A("academy_closures.revert", { inline: /closure\.agentId !== actor\.agentId/ }),
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
};

function functionBodies(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /export async function (\w+)\b/g;
  const starts: { name: string; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) starts.push({ name: m[1], at: m.index });
  starts.forEach((s, i) => out.set(s.name, src.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : undefined)));
  return out;
}
const isUseServer = (raw: string) => /^\s*["']use server["']/.test(raw.slice(0, 200));

const adminActionFiles = walk(ADMIN).filter((f) => /\.(ts|tsx)$/.test(f) && isUseServer(fs.readFileSync(f, "utf8")));
for (const f of adminActionFiles) {
  const key = rel(ADMIN, f);
  const table = ACTIONS[key];
  const bodies = functionBodies(read(f));
  if (!table) {
    check(`actions ${key}: 정책 표에 있어야 함`, false, "새 서버 액션 파일은 test-rbacCoverage.ts의 ACTIONS 표에 정책을 적어야 합니다");
    continue;
  }
  for (const [name, body] of bodies) {
    const policy = table[name];
    if (!policy) {
      check(`actions ${key}#${name}: 정책 표에 있어야 함`, false);
      continue;
    }
    if (policy.perm) check(`actions ${key}#${name}: requirePermission(actor, "${policy.perm}")`, new RegExp(`requirePermission\\(actor, "${esc(policy.perm)}"\\)`).test(body));
    check(`actions ${key}#${name}: 본사 전용 검사 ${policy.hq ? "필요" : "없음"}`, /requireHeadquarters\(actor\)/.test(body) === !!policy.hq);
    if (policy.scope) check(`actions ${key}#${name}: 협력사 소속 검사(${policy.scope})`, new RegExp(`requireInScope\\(prisma, actor, "${policy.scope}"`).test(body));
    if (policy.inline) check(`actions ${key}#${name}: 협력사 소속 검사(기존 코드)`, policy.inline.test(body));
    for (const re of policy.also ?? []) check(`actions ${key}#${name}: ${policy.note ?? re}`, re.test(body));
    if (!policy.perm && !policy.also && !policy.note) check(`actions ${key}#${name}: 검사 정의가 비어 있음`, false);
  }
  for (const name of Object.keys(table)) check(`ACTIONS 표의 ${key}#${name}가 실제로 존재`, bodies.has(name));
}
for (const key of Object.keys(ACTIONS)) check(`ACTIONS 표의 파일 ${key}가 실제로 존재`, fs.existsSync(path.join(ADMIN, key)));

// 공용 레벨테스트 등록 로직("use server" — 클라이언트에서 직접 호출될 수 있음): 권한 + 학생 소속 검사
{
  const f = path.join(SRC, "lib/levelTestCreate.ts");
  const body = functionBodies(read(f)).get("createLevelTestCore") ?? "";
  check("lib/levelTestCreate#createLevelTestCore: level_tests.create", /requirePermission\(actor, "level_tests\.create"\)/.test(body));
  check("lib/levelTestCreate#createLevelTestCore: 학생 소속 검사", /requireInScope\(prisma, actor, "student", studentId\)/.test(body));
}

// 강사/학생 포털 서버 액션: 로그인한 본인 확인(requireTeacher/requireStudent)이 있어야 한다(로그인 액션 제외)
{
  const portalFiles = walk(path.join(SRC, "app")).filter(
    (f) => /\.(ts|tsx)$/.test(f) && isUseServer(fs.readFileSync(f, "utf8")) && /\/(student|teacher)\//.test(rel(path.join(SRC, "app"), f)) && !f.startsWith(ADMIN),
  );
  for (const f of portalFiles) {
    const key = rel(path.join(SRC, "app"), f);
    if (key.endsWith("login/actions.ts")) continue; // 로그인 액션은 인증 전 호출
    for (const [name, body] of functionBodies(read(f))) {
      check(`portal ${key}#${name}: requireTeacher/requireStudent`, /require(Teacher|Student)\(\)/.test(body));
    }
  }
}

// ───────────────────────── 관리자 토큰 API ─────────────────────────
// actorFromAdminApiToken을 쓰는 라우트: 쓰기 메서드마다 권한 키 + 본사 전용(협력사 차단)이 있어야 한다.
const API_ROOT = path.join(SRC, "app/api");
type ApiPolicy = { perms: string[]; hq: boolean; note?: string };
const API: Record<string, ApiPolicy> = {
  "public/consult-channels/[id]/route.ts": { perms: ["consult_channels.update"], hq: true },
  "public/home-notices/route.ts": { perms: ["home_notices.create"], hq: true },
  "public/home-notices/[id]/route.ts": { perms: ["home_notices.update", "home_notices.delete"], hq: true },
  "public/pricing/route.ts": { perms: ["pricing.update"], hq: true },
  // 후기 게시판: 읽기/댓글은 로그인한 관리자 누구나, 삭제는 reviews.delete(본사) 또는 본인 글
  "public/reviews/[id]/route.ts": { perms: [], hq: false, note: "reviews.delete" },
  "public/reviews/route.ts": { perms: [], hq: false },
  "public/consult-channels/route.ts": { perms: [], hq: false, note: "읽기 전용" },
};
for (const f of walk(API_ROOT).filter((x) => x.endsWith("route.ts"))) {
  const src = read(f);
  if (!/actorFromAdminApiToken\(/.test(src)) continue;
  const key = rel(API_ROOT, f);
  const policy = API[key];
  if (!policy) {
    check(`api ${key}: 정책 표에 있어야 함`, false, "관리자 토큰을 받는 새 라우트는 test-rbacCoverage.ts의 API 표에 정책을 적어야 합니다");
    continue;
  }
  for (const perm of policy.perms) check(`api ${key}: requirePermission(actor, "${perm}")`, new RegExp(`requirePermission\\(actor, "${esc(perm)}"\\)`).test(src));
  const permCalls = (src.match(/requirePermission\(actor, "/g) ?? []).length;
  const hqCalls = (src.match(/requireHeadquarters\(actor\)/g) ?? []).length;
  check(`api ${key}: 쓰기 권한 검사마다 본사 전용 검사 ${policy.hq ? "필요" : "없음"}`, policy.hq ? hqCalls === permCalls && permCalls > 0 : hqCalls === 0);
  if (policy.note === "reviews.delete") check(`api ${key}: 후기 삭제는 reviews.delete 또는 본인 글`, /hasPermission\(admin, "reviews\.delete"\)/.test(src) && /authorAdminName !== admin\.name/.test(src));
}
for (const key of Object.keys(API)) check(`API 표의 ${key}가 실제로 존재`, fs.existsSync(path.join(API_ROOT, key)));

// 보조 모듈 자체 검사: 소속 판정은 한 곳(agentScope.ts)에서만 — 새 파일이 AGENT 범위를 각자 구현하지 않도록 핵심 export 유지
{
  const scope = read(path.join(SRC, "lib/agentScope.ts"));
  for (const name of ["canAccessInScope", "requireInScope", "requireHeadquarters", "agentScopeId"]) check(`agentScope.ts가 ${name}을 export`, new RegExp(`export (async )?function ${name}\\b`).test(scope));
  const rbac = read(path.join(SRC, "lib/rbac.ts"));
  check("rbac.ts: requirePermission이 hasPermission을 쓴다(판정 기준 하나)", /export function hasPermission/.test(rbac) && /if \(hasPermission\(actor, key\)\) return;/.test(rbac));
}

console.log(failed === 0 ? `PASS: ${passed} checks` : `FAILED: ${failed} failed / ${passed} passed`);
process.exit(failed === 0 ? 0 : 1);
