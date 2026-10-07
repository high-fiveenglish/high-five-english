// 새 마이그레이션(20261007000000_add_postponement_cascade_paid_leave)이 "적용 직전 스키마"(master)의 DB에 그대로 적용되고, 적용 후 DB가
// 현재 schema.prisma와 정확히 일치하는지, 새 컬럼이 전부 nullable/default라 기존 행을 깨지 않는지 검증한다.
// (이력 전체 재생이 안 되는 이유와 방식은 test-sessionGenerationMigration.ts와 같다.)
// 필요: TEST_DATABASE_URL(테스트 DB) — 격리 스키마 gentest_mig_pc_*를 만들고 끝나면 지운다. 없으면 건너뛴다(CI는 REQUIRE_INTEGRATION=1).
// 실행(admin 디렉터리): TEST_DATABASE_URL=... npx tsx scripts/test-postponementMigration.ts
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "pg";
import { parseDbUrl } from "./lib/generationClient";

const raw = process.env.TEST_DATABASE_URL;
if (!raw) {
  if (process.env.REQUIRE_INTEGRATION === "1") {
    console.error("TEST_DATABASE_URL이 없습니다(CI에서는 필수).");
    process.exit(1);
  }
  console.log("SKIP: TEST_DATABASE_URL이 없어 마이그레이션 검증을 건너뜁니다.");
  process.exit(0);
}
const base = parseDbUrl(raw);
const isLocalTestDb = ["localhost", "127.0.0.1"].includes(base.host) && /test/i.test(base.database);
const isIsolated = !!base.schema && base.schema.startsWith("gentest_");
if (!isLocalTestDb && !isIsolated) {
  console.error("거부: TEST_DATABASE_URL이 테스트 DB로 보이지 않습니다.");
  process.exit(2);
}

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const schema = `gentest_mig_pc_${Date.now().toString(36)}`;
const u = new URL(base.connectionString);
u.searchParams.set("schema", schema);
const url = u.toString();
const root = process.cwd();
const redact = (t: string) => t.split(url).join("<url>").replace(/postgres(ql)?:\/\/[^\s"']+/gi, "<url>");
const prisma = (args: string[]) => {
  const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", ...args], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return { code: r.status ?? 1, out: redact((r.stdout ?? "") + (r.stderr ?? "")) };
};

async function main() {
  const cleanup = new Client({ connectionString: base.connectionString });
  cleanup.on("error", () => {});
  await cleanup.connect();
  try {
    // 1) 적용 직전 스키마로 격리 스키마 생성
    const push = prisma(["db", "push", "--schema", "scripts/fixtures/schema-before-postponement.prisma"]);
    check("적용 직전 스키마로 DB 생성(db push)", push.code === 0, push.out.slice(-300));
    const before = await cleanup.query(
      `select count(*)::int n from information_schema.columns where table_schema = $1 and ((table_name = 'class_sessions' and column_name = 'relatedSessionId') or (table_name = 'teachers' and column_name = 'employmentType') or (table_name = 'leave_requests' and column_name = 'source'))`,
      [schema],
    );
    check("(전제) 적용 전에는 새 컬럼이 없음", before.rows[0].n === 0);

    // 2) 새 migration.sql만 적용(Prisma가 production에서 하는 것과 같은 SQL)
    const sql = fs.readFileSync(path.join(root, "prisma/migrations/20261007000000_add_postponement_cascade_paid_leave/migration.sql"), "utf8");
    await cleanup.query(`SET search_path TO "${schema}"`);
    let applied = true;
    let applyError = "";
    try {
      await cleanup.query("BEGIN");
      await cleanup.query(sql);
      await cleanup.query("COMMIT");
    } catch (e) {
      applied = false;
      applyError = (e as Error).message;
      await cleanup.query("ROLLBACK").catch(() => {});
    }
    check("migration.sql이 오류 없이 적용됨", applied, applyError);

    // 3) 적용 후 DB == 현재 schema.prisma
    const diff = prisma(["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"]);
    check("적용 후 DB와 schema.prisma 사이에 차이 없음(migrate diff exit 0)", diff.code === 0, diff.out.slice(-400));

    // 4) 추가형인지: 새 컬럼은 전부 nullable이거나 default가 있고, 필요한 제약이 존재
    const newCols = await cleanup.query(
      `select table_name, column_name, is_nullable, column_default from information_schema.columns where table_schema = $1 and (
         (table_name = 'class_sessions' and column_name = 'relatedSessionId') or
         (table_name = 'teachers' and column_name = 'employmentType') or
         (table_name = 'enrollments' and column_name = 'leaveQuotaAdjustment') or
         (table_name = 'leave_requests' and column_name in ('source','finalSource','quotaImpact','executedByRole','executedById','supersededByClosureId','supersededAt','replacementSessionId','previousEndDate','paidLeaveId')))`,
      [schema],
    );
    check("새 컬럼 13개가 존재", newCols.rows.length === 13, String(newCols.rows.length));
    check(
      "새 컬럼은 전부 nullable이거나 default가 있다(기존 행을 깨지 않음)",
      newCols.rows.every((r: { is_nullable: string; column_default: string | null }) => r.is_nullable === "YES" || r.column_default !== null),
    );
    const uq = await cleanup.query(
      `select indexname from pg_indexes where schemaname = $1 and indexname in ('teacher_paid_leaves_teacherId_leaveDate_key','leave_requests_replacementSessionId_key')`,
      [schema],
    );
    check("unique 인덱스 2개(강사·휴가일 / 대체 수업) 존재", uq.rows.length === 2);
    const chk = await cleanup.query(
      `select 1 from pg_constraint where conname = 'leave_requests_quotaImpact_check' and connamespace = (select oid from pg_namespace where nspname = $1)`,
      [schema],
    );
    check("quotaImpact는 0/1만 허용하는 CHECK 제약이 있다", chk.rows.length === 1);
    const en = await cleanup.query(
      `select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'TeacherEmploymentType' order by enumsortorder`,
    );
    check("정규 강사 enum: REGULAR/NON_REGULAR", JSON.stringify(en.rows.map((r: { enumlabel: string }) => r.enumlabel)) === JSON.stringify(["REGULAR", "NON_REGULAR"]));
    const def = await cleanup.query(
      `select column_default from information_schema.columns where table_schema = $1 and table_name = 'teachers' and column_name = 'employmentType'`,
      [schema],
    );
    check("강사 기본값은 NON_REGULAR(오너가 지정하기 전에는 유급휴가 대상 없음)", String(def.rows[0]?.column_default).includes("NON_REGULAR"));
  } finally {
    await cleanup.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => {});
    await cleanup.end();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error(redact(String(e && e.message ? e.message : e)));
  process.exit(1);
});
