import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { RoleName } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// 권한 키는 resource.action 규칙을 따른다. ADMIN 행은 만들지 않는다 — ADMIN은
// requirePermission()에서 이 테이블을 조회하지 않고 항상 전체 허용으로 처리된다.
const PERMISSION_SEED: { key: string; description: string }[] = [
  { key: "students.view", description: "학생 조회" },
  { key: "students.create", description: "학생 등록" },
  { key: "students.update", description: "학생 정보 수정" },
  { key: "students.delete", description: "학생 삭제(소프트)" },
  { key: "students.impersonate", description: "학생으로 로그인(임퍼소네이션)" },
  { key: "teachers.view", description: "강사 조회" },
  { key: "teachers.create", description: "강사 등록" },
  { key: "teachers.update", description: "강사 정보 수정" },
  { key: "teachers.delete", description: "강사 비활성화" },
  { key: "teachers.impersonate", description: "강사로 로그인(임퍼소네이션)" },
  { key: "schedules.view", description: "수업 일정 조회" },
  { key: "schedules.create", description: "수업 등록" },
  { key: "schedules.update", description: "수업 상태/일정 변경" },
  { key: "schedules.delete", description: "수업 삭제(소프트)" },
  { key: "level_tests.view", description: "레벨테스트 조회" },
  { key: "level_tests.create", description: "레벨테스트 등록" },
  { key: "level_tests.update", description: "레벨테스트 진행상태/강사배정 변경" },
  { key: "level_tests.delete", description: "레벨테스트 삭제" },
  { key: "enrollments.view", description: "수강 조회" },
  { key: "enrollments.create", description: "수강 등록" },
  { key: "enrollments.update", description: "수강 상태/결제상태 변경" },
  { key: "enrollments.delete", description: "수강 삭제" },
  { key: "evaluations.view", description: "학습평가서 조회" },
  { key: "evaluations.update", description: "학습평가서 작성/수정" },
  { key: "monthly_evaluations.view", description: "월평가서 조회" },
  { key: "monthly_evaluations.create", description: "월평가서 작성" },
  { key: "monthly_evaluations.update", description: "월평가서 수정" },
  { key: "monthly_evaluations.delete", description: "월평가서 삭제" },
  { key: "leave_requests.view", description: "연기신청 조회" },
  { key: "leave_requests.create", description: "연기신청(본인 수업)" },
  { key: "leave_requests.update", description: "연기 등록/적용(관리자)" },
  { key: "leave_requests.revert", description: "연기 되돌리기" },
  { key: "academy_closures.view", description: "전체수업휴강(어학원 휴강) 조회" },
  { key: "academy_closures.create", description: "전체수업휴강(어학원 휴강) 등록" },
  { key: "academy_closures.revert", description: "전체수업휴강(어학원 휴강) 되돌리기" },
  { key: "pricing.view", description: "가격표 조회" },
  { key: "pricing.update", description: "가격표 수정" },
  { key: "own_schedule.view", description: "본인 수업 일정 조회" },
  { key: "own_evaluations.view", description: "본인 평가서 조회" },
  { key: "own_evaluations.update", description: "본인 담당 수업 평가서 작성/수정" },
  { key: "own_leave_requests.view", description: "본인 Hold 신청 내역 조회" },
  { key: "own_leave_requests.create", description: "본인 담당 수업 Hold 신청" },
  { key: "own_monthly_evaluations.view", description: "본인 담당 수강생 월평가서 조회" },
  { key: "own_monthly_evaluations.update", description: "본인 담당 수강생 월평가서 작성/수정" },
  { key: "own_level_tests.update", description: "본인 담당 레벨테스트 결과(평가서) 작성/수정" },
  { key: "own_profile.update", description: "본인 프로필 정보 수정" },
  { key: "bulletins.view", description: "공지사항 조회" },
  { key: "bulletins.create", description: "공지사항 작성" },
  { key: "bulletins.update", description: "공지사항 수정" },
  { key: "bulletins.delete", description: "공지사항 삭제" },
  { key: "enrollment_requests.view", description: "수강신청 조회" },
  { key: "enrollment_requests.update", description: "수강신청 상태 변경" },
  { key: "home_notices.view", description: "홈페이지 공지 조회" },
  { key: "home_notices.create", description: "홈페이지 공지 작성" },
  { key: "home_notices.update", description: "홈페이지 공지 수정" },
  { key: "home_notices.delete", description: "홈페이지 공지 삭제" },
  { key: "consult_channels.view", description: "상담채널 조회" },
  { key: "consult_channels.update", description: "상담채널 수정" },
  { key: "reviews.view", description: "수강후기 게시판 조회" },
  { key: "reviews.delete", description: "수강후기 게시판 글 삭제(모더레이션)" },
];

const ROLE_PERMISSION_SEED: Record<Exclude<RoleName, "ADMIN">, string[]> = {
  MANAGER: [
    "students.view", "students.create", "students.update",
    "teachers.view", "teachers.create", "teachers.update", "teachers.impersonate",
    "schedules.view", "schedules.create", "schedules.update", "schedules.delete",
    "level_tests.view", "level_tests.create", "level_tests.update", "level_tests.delete",
    "enrollments.view", "enrollments.create", "enrollments.update", "enrollments.delete",
    "evaluations.view",
    "monthly_evaluations.view",
    "leave_requests.view", "leave_requests.update", "leave_requests.revert",
    "academy_closures.view", "academy_closures.create", "academy_closures.revert",
    "bulletins.view",
    "enrollment_requests.view", "enrollment_requests.update",
    "home_notices.view", "home_notices.create", "home_notices.update", "home_notices.delete",
    "consult_channels.view", "consult_channels.update",
    "reviews.view", "reviews.delete",
  ],
  TEACHER: [
    "own_schedule.view", "own_evaluations.view", "own_evaluations.update",
    "own_leave_requests.view", "own_leave_requests.create",
    "own_monthly_evaluations.view", "own_monthly_evaluations.update",
    "own_level_tests.update",
  ],
  STUDENT: ["own_schedule.view", "own_evaluations.view", "leave_requests.create", "own_profile.update"],
};

const PRICING_SEED = [
  {
    code: "1m",
    hasBadge: false,
    order: 1,
    rows: [
      { frequencyId: "freq5", price25KRW: 103000, price25CNY: 509, price25VND: 1950000, price50KRW: 187000, price50CNY: 929, price50VND: 3550000 },
      { frequencyId: "freq3", price25KRW: 79000, price25CNY: 399, price25VND: 1500000, price50KRW: 129000, price50CNY: 639, price50VND: 2450000 },
      { frequencyId: "freq2", price25KRW: 53000, price25CNY: 269, price25VND: 1000000, price50KRW: 86000, price50CNY: 429, price50VND: 1650000 },
    ],
  },
  {
    code: "3m",
    hasBadge: true,
    order: 2,
    rows: [
      { frequencyId: "freq5", price25KRW: 283000, price25CNY: 1389, price25VND: 5350000, price50KRW: 517000, price50CNY: 2539, price50VND: 9700000 },
      { frequencyId: "freq3", price25KRW: 219000, price25CNY: 1079, price25VND: 4150000, price50KRW: 356000, price50CNY: 1749, price50VND: 6700000 },
      { frequencyId: "freq2", price25KRW: 147000, price25CNY: 729, price25VND: 2800000, price50KRW: 238000, price50CNY: 1169, price50VND: 4500000 },
    ],
  },
  {
    code: "6m",
    hasBadge: true,
    order: 3,
    rows: [
      { frequencyId: "freq5", price25KRW: 537000, price25CNY: 2639, price25VND: 10100000, price50KRW: 1002000, price50CNY: 4919, price50VND: 18800000 },
      { frequencyId: "freq3", price25KRW: 416000, price25CNY: 2049, price25VND: 7800000, price50KRW: 676000, price50CNY: 3319, price50VND: 12700000 },
      { frequencyId: "freq2", price25KRW: 280000, price25CNY: 1379, price25VND: 5300000, price50KRW: 453000, price50CNY: 2229, price50VND: 8500000 },
    ],
  },
];

// 마케팅 사이트의 기존 정적 CONTACT.kakaoId/wechatId 값을 그대로 옮긴다(src/data/contact.ts
// 참고) — customerService는 실제 상담 연락처가 아직 없어 기본 비활성.
const CONSULT_CHANNEL_SEED = [
  { id: "kakao", displayName: "카카오톡 상담", value: "jongbum1010", url: null, enabled: true },
  { id: "wechat", displayName: "위챗 상담", value: "wjb5463", url: null, enabled: true },
  { id: "customerService", displayName: "고객센터", value: "www.hfenglish.co.kr", url: null, enabled: false },
];

// 협력사 — 학생별로 지정하며, 추후 별도의 협력사 관리 화면에서 CRUD하도록 확장한다.
const AGENT_SEED = [
  { code: "highfive", name: "직영에이전트" },
  { code: "mnmenglish", name: "맘앤맘화상영어" },
  { code: "synergyenglish", name: "시너지잉글리쉬" },
];

async function main() {
  const site = await prisma.site.upsert({
    where: { code: "hifive" },
    update: {},
    create: {
      code: "hifive",
      name: "하이파이브 잉글리쉬",
      status: "active",
    },
  });

  for (const agent of AGENT_SEED) {
    await prisma.agent.upsert({
      where: { code: agent.code },
      update: {},
      create: { ...agent, siteId: site.id },
    });
  }

  for (const p of PERMISSION_SEED) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { description: p.description },
      create: p,
    });
  }

  for (const [role, keys] of Object.entries(ROLE_PERMISSION_SEED) as [Exclude<RoleName, "ADMIN">, string[]][]) {
    for (const key of keys) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });
      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role, permissionId: permission.id } },
        update: {},
        create: { role, permissionId: permission.id },
      });
    }
  }

  // ADMIN 계정 시드 — 기존 admin/0000 로그인이 그대로 유지되도록 env var 값을 그대로
  // 옮긴다. 이후 로그인 검증은 이 테이블을 기준으로 하고, ADMIN_ID/ADMIN_PASSWORD env
  // var는 이 최초 시드 이후로는 쓰이지 않는다.
  const adminId = process.env.ADMIN_ID;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminId && adminPassword) {
    const existing = await prisma.adminUser.findUnique({ where: { loginId: adminId } });
    if (!existing) {
      await prisma.adminUser.create({
        data: {
          siteId: site.id,
          loginId: adminId,
          passwordHash: await bcrypt.hash(adminPassword, 10),
          name: "관리자",
          role: "ADMIN",
        },
      });
    }
  }

  for (const duration of PRICING_SEED) {
    const createdDuration = await prisma.pricingDuration.upsert({
      where: { siteId_code: { siteId: site.id, code: duration.code } },
      update: {},
      create: {
        siteId: site.id,
        code: duration.code,
        hasBadge: duration.hasBadge,
        order: duration.order,
      },
    });
    for (const row of duration.rows) {
      await prisma.pricingRow.upsert({
        where: { durationId_frequencyId: { durationId: createdDuration.id, frequencyId: row.frequencyId } },
        update: {},
        create: { ...row, durationId: createdDuration.id },
      });
    }
  }

  for (const channel of CONSULT_CHANNEL_SEED) {
    await prisma.consultChannel.upsert({
      where: { id: channel.id },
      update: {},
      create: { ...channel, siteId: site.id },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
