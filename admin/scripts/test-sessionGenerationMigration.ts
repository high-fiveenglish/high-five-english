// 새 마이그레이션(20261005120000_add_session_generation)이 "적용 직전 스키마"의 DB에 그대로 적용되고, 적용 후 DB가
// 현재 schema.prisma와 정확히 일치하는지 검증한다.
//
// 왜 이렇게 하나: 기존 마이그레이션 이력은 빈 DB에서 처음부터 재생되지 않는다(slot_reservations 테이블을 만드는 마이그레이션이
// 저장소에 없어 20260923094047에서 실패 — production은 이미 적용된 상태라 새 마이그레이션만 적용된다). 그래서 이력 전체를 재생하는 대신
//  1) 적용 직전 스키마(scripts/fixtures/schema-before-session-generation.prisma)로 격리 스키마를 만들고(prisma db push)
//  2) 새 migration.sql만 적용한 뒤
//  3) `prisma migrate diff`가 "차이 없음"(exit 0)인지 확인한다.
// 필요: TEST_DATABASE_URL(테스트 DB) — 격리 스키마 gentest_mig_*를 만들고 끝나면 지운다. 없으면 건너뛴다(CI는 REQUIRE_INTEGRATION=1).
// 실행(admin 디렉터리): TEST_DATABASE_URL=... npx tsx scripts/test-sessionGenerationMigration.ts
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

const schema = `gentest_mig_${Date.now().toString(36)}`;
const u = new URL(base.connectionString);
u.searchParams.set("schema", schema);
const url = u.toString();
const root = process.cwd();
const redact = (t: string) => t.split(url).join("<url>").replace(/postgres(ql)?:\/\/[^\s"']+/gi, "<url>");
const prisma = (args: string[]) => {
  const r = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["prisma", ...args], { cwd: root, env: { ...process.env, DATABASE_URL: url }, encoding: "utf8", shell: process.platform === "win32" });
  return { code: r.status ?? 1, out: redact((r.stdout ?? "") + (r.stderr ?? "")) };
};

async function main() {
  const cleanup = new Client({ connectionString: base.connectionString });
  cleanup.on("error", () => {});
  await cleanup.connect();
  try {
    // 1) 적용 직전 스키마로 격리 스키마 생성
    const push = prisma(["db", "push", "--schema", "scripts/fixtures/schema-before-session-generation.prisma"]);
    check("적용 직전 스키마로 DB 생성(db push)", push.code === 0, push.out.slice(-300));
    const before = await cleanup.query(`select count(*)::int n from information_schema.columns where table_schema = $1 and table_name = 'class_sessions' and column_name in ('generationKey','generationBatchId')`, [schema]);
    check("(전제) 적용 전에는 새 컬럼이 없음", before.rows[0].n === 0);

    // 2) 새 migration.sql만 적용(Prisma가 production에서 하는 것과 같은 SQL)
    const sql = fs.readFileSync(path.join(root, "prisma/migrations/20261005120000_add_session_generation/migration.sql"), "utf8");
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

    // 4) 제약이 실제로 동작하는지
    const idx = await cleanup.query(`select indexname from pg_indexes where schemaname = $1 and indexname in ('class_sessions_generationKey_key','session_generation_batches_activeLock_key')`, [schema]);
    check("unique 인덱스 2개 존재", idx.rows.length === 2);
    const cols = await cleanup.query(`select column_name, is_nullable from information_schema.columns where table_schema = $1 and table_name = 'class_sessions' and column_name in ('generationKey','generationBatchId')`, [schema]);
    check("새 컬럼 2개는 모두 nullable", cols.rows.length === 2 && cols.rows.every((r: { is_nullable: string }) => r.is_nullable === "YES"));
    const fk = await cleanup.query(`select confdeltype from pg_constraint where conname = 'class_sessions_generationBatchId_fkey' and connamespace = (select oid from pg_namespace where nspname = $1)`, [schema]);
    check("배치 FK는 RESTRICT(r)", fk.rows[0]?.confdeltype === "r");
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
