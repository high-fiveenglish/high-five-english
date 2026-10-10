// 관리자 페이지 · 서버 액션 · 관리자 API의 접근 통제(RBAC + 협력사 범위) 통합 테스트.
//
// 실제 PostgreSQL과 앱 코드를 그대로 쓴다. Next 서버만 없을 뿐, 쿠키로 로그인한 사용자가 페이지 함수 / 서버 액션 /
// 라우트 핸들러를 직접 호출하는 것과 같다(next/headers·next/cache만 가짜 — scripts/lib/adminRequestHarness.ts).
//  · 권한 목록은 prisma/seed.ts의 실제 정책(ADMIN 전체, MANAGER 42개, AGENT 15개)을 그대로 읽어 DB에 넣는다.
//  · 1단계: 기본 권한 그대로 — 직접 URL 입력, 다른 협력사 레코드 id 입력(IDOR), 권한 없는 액션 호출을 막는지 + 정상 접근은 그대로인지.
//  · 2단계: "권한 관리 화면에서 협력사에 권한 키를 잘못 부여한 상황"을 흉내 — 권한 키만으로는 안전하지 않은 곳(본사 전용 / 소속 검사)을 확인.
//  · 3단계: 마케팅 사이트가 쓰는 관리자 토큰 API(/api/public/*)의 권한·범위.
//
// 필요한 것: TEST_DATABASE_URL — localhost의 이름에 "test"가 든 "버려도 되는" PostgreSQL(스키마는 `prisma db push`로 만든 현재 schema.prisma).
// 앱의 Prisma 싱글턴을 그대로 쓰기 때문에 ?schema= 로 격리한 스키마는 지원하지 않는다. 시작할 때 이 DB의 데이터를 TRUNCATE한다.
// 실행(admin 디렉터리): TEST_DATABASE_URL=... npx tsx scripts/test-rbacAccess.integration.ts
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { attempt, blockedExternalConnections, clearCookies, clearedEnvKeys, isolateExternalServices, type Outcome } from "./lib/adminRequestHarness";
import type { Actor } from "../src/lib/rbac";

const raw = process.env.TEST_DATABASE_URL;
if (!raw) {
  if (process.env.REQUIRE_INTEGRATION === "1") {
    console.error("TEST_DATABASE_URL이 없습니다(CI에서는 필수).");
    process.exit(1);
  }
  console.log("SKIP: TEST_DATABASE_URL이 없어 통합 테스트를 건너뜁니다.");
  process.exit(0);
}
const url = new URL(raw);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/test/i.test(url.pathname) || url.searchParams.get("schema")) {
  console.error("거부: TEST_DATABASE_URL은 localhost의 *test* DB여야 하고 ?schema= 는 쓸 수 없습니다(운영 DB 보호).");
  process.exit(2);
}
process.env.DATABASE_URL = raw;
process.env.ADMIN_SESSION_SECRET = "rbac-integration-test-secret";
// 외부 연동 격리(Google Sheets / R2 / AI / AssemblyAI 등) — 앱 모듈을 불러오기 전에 반드시 먼저
isolateExternalServices();

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function describe(o: Outcome): string {
  if (o.kind === "ok") return "ok";
  const e = o.error as { message?: string } | null;
  return `${o.kind}${o.kind === "other" || o.kind === "forbidden" ? `(${String(e?.message ?? e).slice(0, 140)})` : ""}`;
}

// ── prisma/seed.ts의 실제 권한 정책 읽기 ─────────────────────────────────────────────
const seedSrc = fs.readFileSync(path.join(__dirname, "../prisma/seed.ts"), "utf8");
function stringsIn(startMarker: string): string[] {
  const start = seedSrc.indexOf(startMarker);
  if (start < 0) throw new Error(`seed.ts에서 ${startMarker}를 찾지 못했습니다.`);
  const end = seedSrc.indexOf("]", start);
  return [...seedSrc.slice(start, end).matchAll(/"([a-z_]+\.[a-z_]+)"/g)].map((m) => m[1]);
}
const ALL_KEYS = [...seedSrc.matchAll(/\{ key: "([^"]+)"/g)].map((m) => m[1]);
const AGENT_KEYS = stringsIn("const AGENT_PERMISSIONS = [");
const MANAGER_KEYS = stringsIn("MANAGER: [");
if (ALL_KEYS.length < 60 || AGENT_KEYS.length !== 15 || MANAGER_KEYS.length < 40) {
  console.error(`seed 정책 파싱 이상: all=${ALL_KEYS.length} agent=${AGENT_KEYS.length} manager=${MANAGER_KEYS.length}`);
  process.exit(1);
}

type Props = { params?: Record<string, string>; search?: Record<string, string> };
const propsOf = (p: Props = {}) => ({ params: Promise.resolve(p.params ?? {}), searchParams: Promise.resolve(p.search ?? {}) });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { createBackofficeSession } = await import("../src/lib/backofficeAuth");
  const { createAdminApiToken } = await import("../src/lib/adminApiToken");
  const { hasPermission } = await import("../src/lib/rbac");

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "sites", "permissions" RESTART IDENTITY CASCADE`);
  await prisma.site.create({ data: { code: "main", name: "rbac-test" } });
  for (const key of ALL_KEYS) await prisma.permission.create({ data: { key, description: key } });
  const permId = new Map((await prisma.permission.findMany()).map((p) => [p.key, p.id]));
  async function grant(role: "AGENT" | "MANAGER", keys: string[]) {
    for (const key of keys) {
      const permissionId = permId.get(key);
      if (!permissionId) throw new Error(`알 수 없는 권한 키 ${key}`);
      await prisma.rolePermission.upsert({ where: { role_permissionId: { role, permissionId } }, update: {}, create: { role, permissionId } });
    }
  }
  await grant("AGENT", AGENT_KEYS);
  await grant("MANAGER", MANAGER_KEYS);

  // ── 데이터: 협력사 A, B, 본사 직영(null) ──
  const agentA = await prisma.agent.create({ data: { siteId: 1, name: "AgencyA", code: "agency-a" } });
  const agentB = await prisma.agent.create({ data: { siteId: 1, name: "AgencyB", code: "agency-b" } });
  const mkAdmin = (loginId: string, role: "ADMIN" | "MANAGER" | "AGENT", agentId?: number) =>
    prisma.adminUser.create({ data: { siteId: 1, loginId, name: `name-${loginId}`, passwordHash: "x", role, agentId } });
  const admin = await mkAdmin("adm", "ADMIN");
  const manager = await mkAdmin("mgr", "MANAGER");
  const userA = await mkAdmin("agent-a", "AGENT", agentA.id);
  const userB = await mkAdmin("agent-b", "AGENT", agentB.id);

  const teacher = await prisma.teacher.create({
    data: { siteId: 1, realName: "T1", loginId: "t1", passwordHash: "x", approvalStatus: "APPROVED", accountStatus: "ACTIVE", availableHours: [] },
  });
  const mkStudent = (n: string, agentId: number | null) =>
    prisma.student.create({ data: { siteId: 1, name: `S-${n}`, loginId: `s-${n}`, passwordHash: "x", agentId } });
  const sA = await mkStudent("a", agentA.id);
  const sB = await mkStudent("b", agentB.id);
  const sHQ = await mkStudent("hq", null);
  const mkEnrollment = (studentId: number, agentId: number | null) =>
    prisma.enrollment.create({
      data: {
        siteId: 1, studentId, teacherId: teacher.id, agentId, packageMonths: 1, classMethod: "zoom", scheduleDays: "월", classTime: "10:00",
        classDurationMin: 25, totalSessions: 4, startDate: new Date("2027-01-04T00:00:00Z"), endDate: new Date("2027-02-01T00:00:00Z"), status: "ACTIVE",
      },
    });
  const eA = await mkEnrollment(sA.id, agentA.id);
  const eB = await mkEnrollment(sB.id, agentB.id);
  const eHQ = await mkEnrollment(sHQ.id, null);
  let dayOffset = 0;
  const mkSession = (e: { id: number; studentId: number }) => {
    dayOffset += 7;
    return prisma.classSession.create({
      data: {
        siteId: 1, enrollmentId: e.id, studentId: e.studentId, teacherId: teacher.id, durationMin: 25, status: "SCHEDULED",
        scheduledAt: new Date(Date.UTC(2027, 0, 4 + dayOffset, 1, 0, 0)),
      },
    });
  };
  const cA = await mkSession(eA);
  const cB = await mkSession(eB);
  const cHQ = await mkSession(eHQ);
  const cA2 = await mkSession(eA);
  const cB2 = await mkSession(eB);
  const mkLevelTest = (studentId: number, agentId: number | null) =>
    prisma.levelTest.create({ data: { siteId: 1, studentId, agentId, progressStatus: "접수", classMethod: "zoom", englishLevel: "beginner" } });
  const ltA = await mkLevelTest(sA.id, agentA.id);
  const ltB = await mkLevelTest(sB.id, agentB.id);
  const ltHQ = await mkLevelTest(sHQ.id, null);
  const mkLeave = (s: { id: number; enrollmentId: number; studentId: number }) =>
    prisma.leaveRequest.create({
      data: { siteId: 1, classSessionId: s.id, enrollmentId: s.enrollmentId, studentId: s.studentId, status: "PENDING", requestedByRole: "TEACHER" },
    });
  const lrA = await mkLeave(cA2);
  const lrB = await mkLeave(cB2);
  const closureA = await prisma.academyClosure.create({ data: { siteId: 1, date: new Date("2027-03-01T00:00:00Z"), reason: "A", agentId: agentA.id } });
  const closureB = await prisma.academyClosure.create({ data: { siteId: 1, date: new Date("2027-03-02T00:00:00Z"), reason: "B", agentId: agentB.id } });
  const closureHQ = await prisma.academyClosure.create({ data: { siteId: 1, date: new Date("2027-03-03T00:00:00Z"), reason: "HQ", agentId: null } });
  const resB = await prisma.slotReservation.create({
    data: { siteId: 1, teacherId: teacher.id, weekday: 1, classTime: "10:00", prospectName: "p", agentId: agentB.id },
  });
  const bulletin = await prisma.bulletin.create({ data: { siteId: 1, title: "b", content: "c" } });
  const notice = await prisma.homeNotice.create({ data: { siteId: 1, title: "n", content: "c" } });
  const duration = await prisma.pricingDuration.create({ data: { siteId: 1, code: "1m", order: 1, hasBadge: false } });
  await prisma.pricingRow.create({ data: { durationId: duration.id, frequencyId: "freq5", price25KRW: 100, price25CNY: 1, price25VND: 1 } });

  const users = { ADMIN: admin, MANAGER: manager, AGENT_A: userA, AGENT_B: userB } as const;
  type Who = keyof typeof users;
  async function actAs(who: Who) {
    clearCookies();
    await createBackofficeSession(users[who].id);
  }

  // ───────── 0-a. 외부 연동 격리 자체 검사 ─────────
  {
    check("외부 연동 환경변수가 남아 있지 않음", !Object.keys(process.env).some((k) => /^(GOOGLE_SHEETS_|R2_|ANTHROPIC_|ASSEMBLYAI_)/.test(k)), clearedEnvKeys.join(","));
    let blocked = false;
    try {
      net.connect({ host: "example.invalid", port: 443 }).on("error", () => {});
    } catch {
      blocked = true;
    }
    check("localhost 밖으로 나가는 연결은 차단되고 기록됨", blocked && blockedExternalConnections.includes("example.invalid"));
    blockedExternalConnections.length = 0; // 자체 검사 기록은 비우고, 이후 테스트 중 새로 생기는 기록만 본다
  }

  // ───────── 0. 권한 판정 단위 ─────────
  {
    const a: Actor = { role: "AGENT", id: 1, name: "a", permissions: ["students.view"], agentId: 1 };
    const m: Actor = { role: "MANAGER", id: 2, name: "m", permissions: [] };
    const ad: Actor = { role: "ADMIN", id: 3, name: "ad" };
    check("hasPermission: 보유한 키", hasPermission(a, "students.view"));
    check("hasPermission: 없는 키", !hasPermission(a, "students.update") && !hasPermission(m, "students.view"));
    check("hasPermission: ADMIN은 항상 통과", hasPermission(ad, "anything.at_all"));
  }

  // ───────── 1. 기본 권한 그대로: 페이지 직접 URL 접근 ─────────
  type Expect = "ok" | "nf" | "denied";
  type PageCase = { page: string; props?: Props; ADMIN: Expect; MANAGER: Expect; AGENT_A: Expect; AGENT_B?: Expect };
  const pageCases: PageCase[] = [
    // 본사 전용(협력사 메뉴에 없음) — 협력사는 권한 키(teachers.view, schedules.view)가 있어도 404
    { page: "teachers/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    { page: "teachers/new/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    { page: "teachers/[id]/page", props: { params: { id: String(teacher.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    { page: "deleted-sessions/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    { page: "overlapping-sessions/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    { page: "agencies/page", ADMIN: "ok", MANAGER: "nf", AGENT_A: "nf" },
    { page: "agencies/[id]/page", props: { params: { id: String(agentA.id) } }, ADMIN: "ok", MANAGER: "nf", AGENT_A: "nf", AGENT_B: "nf" },
    { page: "bulletins/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    { page: "bulletins/new/page", ADMIN: "ok", MANAGER: "nf", AGENT_A: "nf" },
    { page: "bulletins/[id]/page", props: { params: { id: String(bulletin.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    { page: "home-notices/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    { page: "home-notices/new/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    { page: "home-notices/[id]/page", props: { params: { id: String(notice.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    { page: "consult-channels/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    { page: "reviews/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    { page: "reservations/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    { page: "reservations/new/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    { page: "evaluations/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    { page: "monthly-evaluations/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    { page: "schedule/new/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    // 협력사에도 열려 있는 화면 — 정상 접근 회귀
    { page: "page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "ok" },
    { page: "students/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "ok" },
    { page: "students/new/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "ok" },
    { page: "enrollments/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "ok" },
    { page: "enrollments/new/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "ok" },
    { page: "level-tests/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "ok" },
    { page: "schedule/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "ok" },
    { page: "pricing/page", ADMIN: "ok", MANAGER: "nf", AGENT_A: "ok" }, // MANAGER 기본 정책에는 pricing.view가 없다
    { page: "settlements/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "ok" },
    { page: "student-holds/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "ok" },
    { page: "leave-requests/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "ok" },
    // 레벨테스트 신청 등록: 협력사는 level_tests.create 권한이 없다(기본 정책)
    { page: "level-tests/new/page", ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    // ── 협력사 범위(IDOR): 자기 협력사 레코드만 ──
    { page: "students/[id]/page", props: { params: { id: String(sA.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "ok", AGENT_B: "nf" },
    { page: "students/[id]/page", props: { params: { id: String(sB.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf", AGENT_B: "ok" },
    { page: "students/[id]/page", props: { params: { id: String(sHQ.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf", AGENT_B: "nf" },
    { page: "students/[id]/sessions/page", props: { params: { id: String(sA.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "ok", AGENT_B: "nf" },
    { page: "students/[id]/sessions/page", props: { params: { id: String(sB.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf", AGENT_B: "ok" },
    { page: "students/[id]/sessions/page", props: { params: { id: String(sHQ.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf", AGENT_B: "nf" },
    { page: "students/[id]/enrollment/page", props: { params: { id: String(sA.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "ok", AGENT_B: "nf" },
    { page: "students/[id]/enrollment/page", props: { params: { id: String(sB.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf", AGENT_B: "ok" },
    { page: "students/[id]/enrollment/page", props: { params: { id: String(sHQ.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf", AGENT_B: "nf" },
    { page: "students/[id]/level-test/page", props: { params: { id: String(sA.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf" },
    { page: "enrollments/[id]/edit/page", props: { params: { id: String(eA.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "ok", AGENT_B: "nf" },
    { page: "enrollments/[id]/edit/page", props: { params: { id: String(eB.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf", AGENT_B: "ok" },
    { page: "enrollments/[id]/edit/page", props: { params: { id: String(eHQ.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf", AGENT_B: "nf" },
    { page: "level-tests/[id]/page", props: { params: { id: String(ltA.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "ok", AGENT_B: "nf" },
    { page: "level-tests/[id]/page", props: { params: { id: String(ltB.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf", AGENT_B: "ok" },
    { page: "level-tests/[id]/page", props: { params: { id: String(ltHQ.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf", AGENT_B: "nf" },
    { page: "level-tests/[id]/result/page", props: { params: { id: String(ltA.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "ok", AGENT_B: "nf" },
    { page: "level-tests/[id]/result/page", props: { params: { id: String(ltB.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf", AGENT_B: "ok" },
    { page: "level-tests/[id]/result/page", props: { params: { id: String(ltHQ.id) } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "nf", AGENT_B: "nf" },
    // 휴강 관리: 협력사는 전체수업휴강 탭만(쿼리스트링을 바꿔도 다른 탭은 열리지 않는다)
    { page: "leave-requests/page", props: { search: { tab: "student" } }, ADMIN: "ok", MANAGER: "ok", AGENT_A: "ok" },
    // ADMIN 전용 화면
    { page: "accounts/page", ADMIN: "ok", MANAGER: "denied", AGENT_A: "denied" },
    { page: "permissions/page", ADMIN: "ok", MANAGER: "denied", AGENT_A: "denied" },
    { page: "audit-log/page", ADMIN: "ok", MANAGER: "denied", AGENT_A: "denied" },
  ];
  const pageModules = new Map<string, (p: unknown) => Promise<unknown>>();
  async function callPage(rel: string, props?: Props): Promise<Outcome> {
    let fn = pageModules.get(rel);
    if (!fn) {
      const mod = (await import(`../src/app/(admin)/${rel}`)) as { default: (p: unknown) => Promise<unknown> };
      fn = mod.default;
      pageModules.set(rel, fn);
    }
    return attempt(() => fn!(propsOf(props)));
  }
  function matches(expect: Expect, o: Outcome): boolean {
    if (expect === "ok") return o.kind === "ok";
    if (expect === "nf") return o.kind === "notFound";
    return o.kind !== "ok";
  }
  for (const c of pageCases) {
    for (const who of ["ADMIN", "MANAGER", "AGENT_A", "AGENT_B"] as const) {
      const expect: Expect | undefined = who === "AGENT_B" ? c.AGENT_B ?? c.AGENT_A : c[who];
      if (!expect) continue;
      await actAs(who);
      const o = await callPage(c.page, c.props);
      const label = `page ${c.page} ${JSON.stringify(c.props?.params ?? {})}${c.props?.search ? JSON.stringify(c.props.search) : ""} as ${who}`;
      check(`${label} → ${expect}`, matches(expect, o), `실제 ${describe(o)}`);
    }
  }
  // 로그인하지 않은 요청은 로그인 화면으로
  {
    clearCookies();
    const o = await callPage("students/[id]/sessions/page", { params: { id: String(sA.id) } });
    check("로그인 없이 학생 수업 화면 → 로그인으로 redirect", o.kind === "redirect", describe(o));
    const o2 = await callPage("teachers/page");
    check("로그인 없이 강사 화면 → 로그인으로 redirect", o2.kind === "redirect", describe(o2));
  }
  // AGENT가 쿼리스트링으로 학생휴강 탭을 요청해도 본사/타 협력사 휴강 정보는 나오지 않는다(전체수업휴강 탭으로 고정)
  {
    await actAs("AGENT_A");
    const o = await callPage("leave-requests/page", { search: { tab: "student", q: "S-" } });
    check("AGENT 휴강 화면은 tab=student를 요청해도 열리되 전체수업휴강 탭으로 고정", o.kind === "ok", describe(o));
  }

  // ───────── 1b. 기본 권한 그대로: 서버 액션 ─────────
  const fd = (o: Record<string, string> = {}) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  const act = async <T extends unknown[]>(rel: string, name: string, ...args: T): Promise<Outcome> => {
    const mod = (await import(`../src/app/(admin)/${rel}`)) as Record<string, (...a: unknown[]) => Promise<unknown>>;
    return attempt(() => mod[name](...args));
  };

  await actAs("AGENT_A");
  {
    const o = await act("students/[id]/sessions/actions", "getAvailableTeachersForSlot", "2027-02-01T10:00", 25);
    check("협력사: 강사 근무가능시간 조회(getAvailableTeachersForSlot) 차단", o.kind === "forbidden", describe(o));
    const o2 = await act("students/[id]/sessions/actions", "cancelSession", sB.id, cB.id);
    check("협력사(기본 권한): 남의 수업 취소 차단", o2.kind === "forbidden", describe(o2));
    check("   └ 남의 수업 상태 그대로", (await prisma.classSession.findUniqueOrThrow({ where: { id: cB.id } })).status === "SCHEDULED");
  }
  // 레벨테스트 폼의 강사 가용성 조회(공용 서버 액션) — 조회 권한(level_tests.view)만으로는 모든 강사의 근무시간·일정 충돌을 볼 수 없다
  {
    const availability = async (who: Who) => {
      await actAs(who);
      const mod = await import("../src/lib/teacherAvailability");
      return attempt(() => mod.getAvailableTeachersForLevelTestSlot("2027-02-01", "10:00"));
    };
    const a = await availability("AGENT_A");
    check("협력사(level_tests.view만 보유): 레벨테스트 강사 가용성 조회 차단", a.kind === "forbidden", describe(a));
    const b = await availability("AGENT_B");
    check("협력사 B도 동일하게 차단", b.kind === "forbidden", describe(b));
    const m = await availability("MANAGER");
    check("본사 MANAGER(level_tests.update 보유): 가용성 조회 정상", m.kind === "ok" && Array.isArray((m as { value: unknown }).value), describe(m));
    const ad = await availability("ADMIN");
    check("ADMIN: 가용성 조회 정상", ad.kind === "ok", describe(ad));
    clearCookies();
    const anon = await attempt(async () => (await import("../src/lib/teacherAvailability")).getAvailableTeachersForLevelTestSlot("2027-02-01", "10:00"));
    check("로그인 없이 가용성 조회 → redirect", anon.kind === "redirect", describe(anon));
  }
  await actAs("MANAGER");
  {
    const o = await act("students/[id]/sessions/actions", "getAvailableTeachersForSlot", "2027-02-01T10:00", 25);
    check("본사 MANAGER: getAvailableTeachersForSlot 정상", o.kind === "ok" && Array.isArray((o as { value: unknown }).value), describe(o));
  }
  await actAs("ADMIN");
  {
    const o = await act("students/[id]/sessions/actions", "getAvailableTeachersForSlot", "2027-02-01T10:00", 25);
    check("ADMIN: getAvailableTeachersForSlot 정상", o.kind === "ok", describe(o));
  }

  // ───────── 2. 협력사에 권한 키를 잘못 부여한 상황(권한 키만으로는 안전하지 않은 곳) ─────────
  const EXTRA_KEYS = [
    "schedules.create", "schedules.update", "schedules.delete", "leave_requests.update", "leave_requests.revert",
    "level_tests.create", "level_tests.update", "level_tests.delete", "enrollments.delete", "students.delete", "students.impersonate",
    "teachers.create", "teachers.update", "teachers.delete", "teachers.impersonate", "bulletins.create", "bulletins.update", "bulletins.delete",
    "home_notices.create", "home_notices.update", "home_notices.delete", "consult_channels.update", "reviews.delete", "agencies.update",
    "evaluations.update", "monthly_evaluations.update", "monthly_evaluations.delete", "reservations.create", "reservations.update",
    "enrollment_requests.update",
  ];
  await grant("AGENT", EXTRA_KEYS);

  // 2-1. 협력사 범위(남의 레코드 차단 + 자기 것은 정상)
  const stateOf = {
    session: async (id: number) => (await prisma.classSession.findUniqueOrThrow({ where: { id } })).status,
    sessionDeleted: async (id: number) => (await prisma.classSession.findUniqueOrThrow({ where: { id } })).deletedAt !== null,
    levelTest: async (id: number) => (await prisma.levelTest.findUnique({ where: { id } }))?.progressStatus ?? "(삭제됨)",
    leave: async (id: number) => (await prisma.leaveRequest.findUnique({ where: { id } }))?.status ?? "(삭제됨)",
  };
  await actAs("AGENT_A");
  {
    const denied = async (name: string, o: Outcome) => check(`협력사(권한키 부여) ${name} → 차단`, o.kind === "forbidden", describe(o));
    await denied("남의 수업 상태 변경", await act("schedule/actions", "updateClassSessionStatus", cB.id, "COMPLETED"));
    await denied("본사 직영 수업 상태 변경", await act("schedule/actions", "updateClassSessionStatus", cHQ.id, "COMPLETED"));
    await denied("남의 수업 삭제", await act("schedule/actions", "deleteClassSession", cB.id));
    await denied("남의 수업 복원", await act("schedule/actions", "restoreClassSession", cB.id));
    await denied("남의 수강에 수업 등록", await act("schedule/actions", "createClassSession", undefined, fd({ enrollmentId: String(eB.id), scheduledAt: "2027-03-01T10:00", durationMin: "25" })));
    await denied("남의 학생 수업 취소", await act("students/[id]/sessions/actions", "cancelSession", sB.id, cB.id));
    await denied("남의 학생 수업 취소 되돌리기", await act("students/[id]/sessions/actions", "revertCancelSession", sB.id, cB.id));
    await denied("남의 학생 학생연기", await act("students/[id]/sessions/actions", "applyStudentLeave", sB.id, cB.id, "x"));
    await denied("남의 학생 관리자연기", await act("students/[id]/sessions/actions", "applyAdminLeave", sB.id, cB.id, "x"));
    await denied("남의 학생 보충수업 등록", await act("students/[id]/sessions/actions", "addSupplementSession", sB.id, undefined, fd({ enrollmentId: String(eB.id), teacherId: String(teacher.id), scheduledAt: "2027-03-01T10:00", durationMin: "25" })));
    await denied("남의 연기 신청 승인", await act("leave-requests/actions", "approveLeaveRequest", lrB.id));
    await denied("남의 연기 신청 반려", await act("leave-requests/actions", "rejectLeaveRequest", lrB.id));
    await denied("남의 연기 신청 되돌리기", await act("leave-requests/actions", "revertLeaveRequest", lrB.id));
    await denied("남의 수업 연기 등록", await act("leave-requests/actions", "createLeaveRequestAdmin", undefined, fd({ classSessionId: String(cB.id), reason: "x" })));
    await denied("남의 레벨테스트 결과 변경", await act("level-tests/actions", "setLevelTestOutcome", ltB.id, "취소"));
    await denied("남의 레벨테스트 삭제", await act("level-tests/actions", "deleteLevelTest", ltB.id));
    await denied("본사 직영 레벨테스트 삭제", await act("level-tests/actions", "deleteLevelTest", ltHQ.id));
    await denied("남의 레벨테스트 확정 되돌리기", await act("level-tests/actions", "revertLevelTestConfirmation", ltB.id));
    await denied("남의 학생에게 레벨테스트 등록", await act("students/[id]/level-test/actions", "createLevelTestForStudent", sB.id, undefined, fd({ classMethod: "zoom", englishLevel: "x" })));
    await denied("남의 수강 삭제", await act("enrollments/actions", "deleteEnrollment", eB.id));
    await denied("남의 학생 복원", await act("students/actions", "restoreStudent", sB.id));
    await denied("남의 학생 대리 로그인", await act("students/actions", "impersonateStudent", sB.id));
    // 협력사 휴강 되돌리기는 남의 것이면 오류 없이 무시한다(기존 동작) — 결과가 아니라 데이터가 그대로인지로 확인한다.
    await act("leave-requests/actions", "revertAcademyClosure", closureB.id);
    await act("leave-requests/actions", "revertAcademyClosure", closureHQ.id);

    check("   └ 남의 수업 상태/삭제 그대로", (await stateOf.session(cB.id)) === "SCHEDULED" && !(await stateOf.sessionDeleted(cB.id)));
    check("   └ 남의 연기 신청 그대로", (await stateOf.leave(lrB.id)) === "PENDING");
    check("   └ 남의 레벨테스트 그대로", (await stateOf.levelTest(ltB.id)) === "접수" && (await stateOf.levelTest(ltHQ.id)) === "접수");
    check("   └ 남의 수강 그대로", !!(await prisma.enrollment.findUnique({ where: { id: eB.id } })));
    check("   └ 남의 휴강(closure) 그대로", (await prisma.academyClosure.count({ where: { id: { in: [closureB.id, closureHQ.id] } } })) === 2);
    check("   └ 남의 수강에 수업이 생기지 않음", (await prisma.classSession.count({ where: { enrollmentId: eB.id } })) === 2);

    // 정상 접근 회귀: 자기 협력사 레코드는 그대로 처리된다
    const own = await act("schedule/actions", "updateClassSessionStatus", cA.id, "COMPLETED");
    check("협력사(권한키 부여) 자기 수업 상태 변경 정상", own.kind === "ok" && (await stateOf.session(cA.id)) === "COMPLETED", describe(own));
    const own2 = await act("students/[id]/sessions/actions", "cancelSession", sA.id, cA2.id);
    check("협력사(권한키 부여) 자기 학생 수업 취소 정상", own2.kind === "ok" && (await stateOf.session(cA2.id)) === "CANCELLED", describe(own2));
    const own3 = await act("students/[id]/sessions/actions", "revertCancelSession", sA.id, cA2.id);
    check("협력사(권한키 부여) 자기 학생 수업 취소 되돌리기 정상", own3.kind === "ok" && (await stateOf.session(cA2.id)) === "SCHEDULED", describe(own3));
    const own4 = await act("level-tests/actions", "setLevelTestOutcome", ltA.id, "취소");
    check("협력사(권한키 부여) 자기 레벨테스트 결과 변경 정상", own4.kind === "ok" && (await stateOf.levelTest(ltA.id)) === "취소", describe(own4));
    const own5 = await act("leave-requests/actions", "rejectLeaveRequest", lrA.id);
    check("협력사(권한키 부여) 자기 연기 신청 반려 정상", own5.kind === "ok" && (await stateOf.leave(lrA.id)) === "REJECTED", describe(own5));
    // 협력사가 자기 협력사의 전체수업휴강을 되돌리는 것은 기본 권한(academy_closures.revert)으로 계속 가능
    await act("leave-requests/actions", "revertAcademyClosure", closureA.id);
    check("협력사: 자기 협력사 휴강 되돌리기 정상(회귀)", (await prisma.academyClosure.count({ where: { id: closureA.id } })) === 0);
    const own6 = await act("students/[id]/sessions/actions", "getAvailableTeachersForSlot", "2027-02-01T10:00", 25);
    check("협력사(schedules.create 부여) 강사 근무가능시간 조회 허용", own6.kind === "ok", describe(own6));
    const own7 = await attempt(async () => (await import("../src/lib/teacherAvailability")).getAvailableTeachersForLevelTestSlot("2027-02-01", "10:00"));
    check("협력사(level_tests.create/update 부여) 레벨테스트 가용성 조회 허용 — 권한이 있으면 동작", own7.kind === "ok", describe(own7));
  }
  // 협력사 B도 A의 레코드를 건드릴 수 없다(대칭)
  await actAs("AGENT_B");
  {
    const o1 = await act("schedule/actions", "updateClassSessionStatus", cA.id, "CANCELLED");
    const o2 = await act("level-tests/actions", "deleteLevelTest", ltA.id);
    const o3 = await act("leave-requests/actions", "approveLeaveRequest", lrA.id);
    check("협력사 B: A의 수업/레벨테스트/연기 신청 접근 차단", o1.kind === "forbidden" && o2.kind === "forbidden" && o3.kind === "forbidden", `${describe(o1)} | ${describe(o2)} | ${describe(o3)}`);
    check("   └ A의 레벨테스트 그대로", (await stateOf.levelTest(ltA.id)) === "취소");
  }

  // 2-2. 본사 전용 액션: 권한 키를 줘도 협력사는 차단
  await actAs("AGENT_A");
  {
    const hq: [string, string, unknown[]][] = [
      ["teachers/actions", "createTeacher", [undefined, fd({})]],
      ["teachers/actions", "updateTeacher", [teacher.id, undefined, fd({})]],
      ["teachers/actions", "deleteTeacher", [teacher.id]],
      ["teachers/actions", "impersonateTeacher", [teacher.id]],
      ["teachers/actions", "bulkHardDeleteTeachers", [[teacher.id]]],
      ["teachers/actions", "updateTeacherAccountStatus", [teacher.id, "INACTIVE"]],
      ["teachers/mediaUploadActions", "getTeacherMediaUploadUrl", [teacher.id, "photo", "image/png", 1000]],
      ["bulletins/actions", "createBulletin", [undefined, fd({})]],
      ["bulletins/actions", "updateBulletin", [bulletin.id, undefined, fd({})]],
      ["bulletins/actions", "deleteBulletin", [bulletin.id]],
      ["home-notices/actions", "createHomeNotice", [undefined, fd({})]],
      ["home-notices/actions", "updateHomeNotice", [notice.id, undefined, fd({})]],
      ["home-notices/actions", "deleteHomeNotice", [notice.id]],
      ["consult-channels/actions", "updateConsultChannel", [1, { displayName: "x", value: "x", url: "", enabled: true }]],
      ["reviews/actions", "deleteReviewPost", [1]],
      ["reviews/actions", "updateReviewViews", [1, undefined, fd({ views: "1" })]],
      ["agencies/actions", "updateAgentBranding", [agentA.id, undefined, fd({})]],
      ["agencies/actions", "updateAgentConsultChannel", [agentA.id, "kakao", { value: "x", url: "" }]],
      ["evaluations/actions", "saveEvaluationAdmin", [cA.id, undefined, fd({})]],
      ["monthly-evaluations/actions", "saveMonthlyEvaluation", [eA.id, 1, 8, undefined, fd({})]],
      ["monthly-evaluations/actions", "deleteMonthlyEvaluation", [1]],
      ["reservations/actions", "createReservation", [undefined, fd({})]],
      ["reservations/actions", "cancelReservation", [`${resB.id}`]],
      ["enrollments/actions", "updateEnrollmentRequestStatus", [1, "CONTACTED"]],
    ];
    for (const [rel, name, args] of hq) {
      const o = await act(rel, name, ...args);
      check(`협력사(권한키 부여) 본사 전용 ${name} → 차단`, o.kind === "forbidden", describe(o));
    }
    check("   └ 본사 데이터 그대로(강사/공지/게시물/예약)", !!(await prisma.teacher.findUnique({ where: { id: teacher.id } })) && !!(await prisma.bulletin.findUnique({ where: { id: bulletin.id } })) && !!(await prisma.homeNotice.findUnique({ where: { id: notice.id } })) && !!(await prisma.slotReservation.findUnique({ where: { id: resB.id } })));
  }
  // 본사 계정의 같은 액션은 그대로 동작(회귀)
  await actAs("MANAGER");
  {
    const o = await act("schedule/actions", "updateClassSessionStatus", cB.id, "COMPLETED");
    check("MANAGER: 어느 협력사 수업이든 상태 변경 정상", o.kind === "ok" && (await stateOf.session(cB.id)) === "COMPLETED", describe(o));
    const o2 = await act("level-tests/actions", "setLevelTestOutcome", ltHQ.id, "취소");
    check("MANAGER: 본사 직영 레벨테스트 결과 변경 정상", o2.kind === "ok" && (await stateOf.levelTest(ltHQ.id)) === "취소", describe(o2));
    const o3 = await act("bulletins/actions", "deleteBulletin", bulletin.id);
    check("MANAGER: bulletins.delete 권한이 없으면(기본 정책) 공지 삭제 차단 유지", o3.kind === "forbidden", describe(o3));
    const o4 = await act("leave-requests/actions", "rejectLeaveRequest", lrB.id);
    check("MANAGER: 타 협력사 학생의 연기 신청 반려 정상", o4.kind === "ok" && (await stateOf.leave(lrB.id)) === "REJECTED", describe(o4));
  }
  await actAs("ADMIN");
  {
    const o = await act("bulletins/actions", "deleteBulletin", bulletin.id);
    check("ADMIN: 공지 삭제 정상", o.kind === "ok" && !(await prisma.bulletin.findUnique({ where: { id: bulletin.id } })), describe(o));
  }

  // ───────── 3. 마케팅 사이트가 쓰는 관리자 토큰 API ─────────
  const bearer = (u: { id: number; role: "ADMIN" | "MANAGER" | "AGENT" | "TEACHER" | "STUDENT" }) => ({ authorization: `Bearer ${createAdminApiToken(u.id, u.role)}`, "content-type": "application/json" });
  type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
  const call = async (handler: Handler, method: string, urlPath: string, who: Who | null, body?: unknown, id?: string) => {
    const headers = who ? bearer(users[who]) : { "content-type": "application/json" };
    const req = new Request(`http://localhost${urlPath}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return handler(req, { params: Promise.resolve({ id: id ?? "" }) });
  };
  {
    const reviews = await import("../src/app/api/public/reviews/[id]/route");
    const mkPost = (o: { studentId?: number; agentId?: number | null; authorAdminName?: string }) =>
      prisma.reviewPost.create({ data: { siteId: 1, content: "c", title: "t", studentId: o.studentId, agentId: o.agentId ?? null, authorAdminName: o.authorAdminName } });
    const p1 = await mkPost({ studentId: sB.id, agentId: agentB.id });
    const r1 = await call(reviews.DELETE, "DELETE", `/api/public/reviews/${p1.id}`, "AGENT_A", undefined, String(p1.id));
    check("API 후기 삭제: 협력사 관리자가 남의 후기 삭제 → 403", r1.status === 403, `status ${r1.status}`);
    check("   └ 후기 그대로", !!(await prisma.reviewPost.findUnique({ where: { id: p1.id } })));
    const own = await mkPost({ agentId: agentA.id, authorAdminName: userA.name });
    const r2 = await call(reviews.DELETE, "DELETE", `/api/public/reviews/${own.id}`, "AGENT_A", undefined, String(own.id));
    check("API 후기 삭제: 협력사 관리자가 자기가 쓴 글 삭제 → 200(기존 동작 유지)", r2.status === 200, `status ${r2.status}`);
    const r3 = await call(reviews.DELETE, "DELETE", `/api/public/reviews/${p1.id}`, "MANAGER", undefined, String(p1.id));
    check("API 후기 삭제: reviews.delete 권한이 있는 MANAGER → 200", r3.status === 200, `status ${r3.status}`);
    const p2 = await mkPost({ studentId: sB.id, agentId: agentB.id });
    const r4 = await call(reviews.DELETE, "DELETE", `/api/public/reviews/${p2.id}`, "ADMIN", undefined, String(p2.id));
    check("API 후기 삭제: ADMIN → 200", r4.status === 200, `status ${r4.status}`);
    const r5 = await call(reviews.DELETE, "DELETE", `/api/public/reviews/${p2.id}`, null, undefined, String(p2.id));
    check("API 후기 삭제: 토큰 없음 → 401", r5.status === 401, `status ${r5.status}`);
  }
  {
    const pricing = await import("../src/app/api/public/pricing/route");
    const body = { durationId: "1m", frequencyId: "freq5", lessonLength: 25, currency: "KRW", amount: 111 };
    const rA = await call(pricing.PATCH, "PATCH", "/api/public/pricing", "AGENT_A", body);
    check("API 가격표 수정: 협력사 관리자가 본사 가격표 수정 → 403(pricing.update가 있어도)", rA.status === 403, `status ${rA.status}`);
    const rM = await call(pricing.PATCH, "PATCH", "/api/public/pricing", "MANAGER", body);
    check("API 가격표 수정: MANAGER(pricing.update 없음) → 403", rM.status === 403, `status ${rM.status}`);
    check("   └ 협력사/MANAGER 요청은 값을 바꾸지 않음", (await prisma.pricingRow.findUniqueOrThrow({ where: { durationId_frequencyId: { durationId: duration.id, frequencyId: "freq5" } } })).price25KRW === 100);
    const rAd = await call(pricing.PATCH, "PATCH", "/api/public/pricing", "ADMIN", body);
    const row = await prisma.pricingRow.findUniqueOrThrow({ where: { durationId_frequencyId: { durationId: duration.id, frequencyId: "freq5" } } });
    check("API 가격표 수정: ADMIN → 200, 값 반영(회귀)", rAd.status === 200 && row.price25KRW === 111, `status ${rAd.status} price ${row.price25KRW}`);
  }
  {
    const notices = await import("../src/app/api/public/home-notices/route");
    const noticeId = await import("../src/app/api/public/home-notices/[id]/route");
    const channels = await import("../src/app/api/public/consult-channels/[id]/route");
    const n = await prisma.homeNotice.create({ data: { siteId: 1, title: "n2", content: "c" } });
    const created = await call(notices.POST, "POST", "/api/public/home-notices", "AGENT_A", { title: "x", content: "y", published: true });
    check("API 홈 공지 작성: 협력사 관리자(권한키 부여) → 403", created.status === 403, `status ${created.status}`);
    const patched = await call(noticeId.PATCH, "PATCH", `/api/public/home-notices/${n.id}`, "AGENT_A", { title: "x", content: "y" }, String(n.id));
    check("API 홈 공지 수정: 협력사 관리자(권한키 부여) → 403", patched.status === 403, `status ${patched.status}`);
    const deleted = await call(noticeId.DELETE, "DELETE", `/api/public/home-notices/${n.id}`, "AGENT_A", undefined, String(n.id));
    check("API 홈 공지 삭제: 협력사 관리자(권한키 부여) → 403", deleted.status === 403, `status ${deleted.status}`);
    check("   └ 공지 그대로", !!(await prisma.homeNotice.findUnique({ where: { id: n.id } })));
    const ch = await call(channels.PATCH, "PATCH", "/api/public/consult-channels/kakao", "AGENT_A", { value: "x" }, "kakao");
    check("API 상담채널 수정: 협력사 관리자(권한키 부여) → 403", ch.status === 403, `status ${ch.status}`);
    const mgrCreate = await call(notices.POST, "POST", "/api/public/home-notices", "MANAGER", { title: "x", content: "y", published: true });
    check("API 홈 공지 작성: MANAGER(home_notices.create) → 201(회귀)", mgrCreate.status === 201 || mgrCreate.status === 200, `status ${mgrCreate.status}`);
  }

  await prisma.$disconnect();
  check("테스트 중 localhost 밖으로 나간 연결이 없음", blockedExternalConnections.length === 0, blockedExternalConnections.join(","));
  console.log(failed === 0 ? `PASS: ${passed} checks` : `FAILED: ${failed} failed / ${passed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
