// 경로/쿼리 id 검증(src/lib/routeId.ts)과 그 적용 범위를 검증한다.
//  1) parseRouteId / isInt4 단위 검사 — 숫자가 아닌 값·int4 범위 초과·소수·지수·부호·선행 0이 DB까지 가지 못하게.
//  2) 정적 회귀 검사 — 동적 라우트([id], [enrollmentId])의 page.tsx / route.ts가 경로 파라미터를 검증 없이 Number()로 바꿔
//     Prisma에 넘기는 코드가 다시 생기면 실패한다(이전에 /student/evaluations/abc 같은 URL이 500이 되던 원인).
// 실행(admin 디렉터리): npx tsx scripts/test-routeId.ts
import fs from "node:fs";
import path from "node:path";
import { MAX_INT4, isInt4, parseRouteId } from "../src/lib/routeId";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---- 1. parseRouteId ----------------------------------------------------------------------------------------------
for (const [raw, want] of [["1", 1], ["9", 9], ["10", 10], ["4689", 4689], ["38548", 38548], ["2147483647", 2147483647]] as const) {
  check(`parseRouteId(${JSON.stringify(raw)}) = ${want}`, parseRouteId(raw) === want);
}
const REJECTED: Array<string | null | undefined | string[]> = [
  undefined, null, "", " ", "abc", "NaN", "Infinity", "-Infinity", "null", "undefined", "1.5", "1.0", ".5", "1e3", "1E3", "0x10", "0b1", "0", "-1", "-0", "+1", "01", "007",
  " 1", "1 ", "1\n", "\t1", "1;2", "1,2", "1/2", "1abc", "abc1", "２", "１２", "٣", "2147483648", "9999999999", "99999999999", "123456789012345678901234567890", ["1"], ["1", "2"], [],
];
for (const raw of REJECTED) check(`parseRouteId(${JSON.stringify(raw)}) rejects`, parseRouteId(raw as string) === null);
check("MAX_INT4 is the Postgres int4 maximum", MAX_INT4 === 2147483647);

// ---- 2. isInt4 ------------------------------------------------------------------------------------------------------
for (const n of [0, 1, -1, 4689, 2147483647, -2147483648]) check(`isInt4(${n})`, isInt4(n));
for (const n of [NaN, Infinity, -Infinity, 1.5, 0.1, 2147483648, -2147483649, 99999999999, 1e21]) check(`isInt4(${n}) rejects`, !isInt4(n));

// ---- 3. static regression guard ----------------------------------------------------------------------------------------
const appDir = path.join(process.cwd(), "src", "app");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name === "page.tsx" || e.name === "route.ts") out.push(p);
  }
  return out;
}
const files = walk(appDir);
check("route files were found", files.length > 50, `found ${files.length}`);

/** Folders whose [param] is NOT an integer primary key. */
const NON_NUMERIC_PARAMS = new Set(["cycleNumber"]); // compared with a number, never sent to Prisma
const NON_NUMERIC_ROUTES = ["api/public/consult-channels/[id]"]; // [id] is a public code (kakao / wechat / customerService), not a DB id

let checked = 0;
for (const file of files) {
  const rel = path.relative(appDir, file).split(path.sep).join("/");
  const params = [...rel.matchAll(/\[(\w+)\]/g)].map((m) => m[1]).filter((p) => !NON_NUMERIC_PARAMS.has(p));
  if (params.length === 0) continue;
  if (NON_NUMERIC_ROUTES.some((r) => rel.startsWith(r))) continue;
  const src = fs.readFileSync(file, "utf8");
  checked++;
  for (const p of params) {
    // A Number(<param>) conversion is only acceptable when the file range-checks the result with isInt4 (the teacher-voice route keeps its
    // 400 "invalid_id" contract that way); everywhere else the param must go through parseRouteId.
    const bare = new RegExp(`(Number|parseInt|parseFloat)\\(\\s*${p}\\s*[,)]`).test(src) || new RegExp(`\\+${p}\\b`).test(src);
    check(`${rel}: [${p}] is not passed through an unchecked Number()/parseInt()`, !bare || /\bisInt4\(/.test(src));
  }
  check(`${rel}: validates its id with parseRouteId/isInt4`, /\bparseRouteId\(|\bisInt4\(/.test(src));
}
check("dynamic id routes were checked (19 pages + 3 api route files + student evaluation api is not dynamic)", checked >= 22, `checked ${checked}`);

// query-string ids that reach Prisma
for (const [rel, names] of [
  ["(admin)/enrollments/new/page.tsx", ["fromRequest", "renewFrom"]],
  ["(admin)/home-notices/page.tsx", ["agentIdRaw"]],
  ["(admin)/home-notices/new/page.tsx", ["agentId"]],
  ["(admin)/pricing/page.tsx", ["agentIdRaw"]],
] as const) {
  const src = fs.readFileSync(path.join(appDir, rel), "utf8");
  for (const n of names) check(`${rel}: query id "${n}" is not passed through a bare Number()`, !new RegExp(`Number\\(\\s*${n}\\s*\\)`).test(src));
  check(`${rel}: validates query ids with parseRouteId`, src.includes("parseRouteId("));
}
const reservationSrc = fs.readFileSync(path.join(appDir, "(admin)/enrollments/new/page.tsx"), "utf8");
check("enrollments/new: the numeric fromReservation id is range-checked", !/Number\(\s*fromReservation\s*\)/.test(reservationSrc));
for (const rel of ["api/public/classroom/hold-release/route.ts", "api/public/classroom/reschedule/route.ts", "api/public/teachers/[id]/voice/route.ts"]) {
  const src = fs.readFileSync(path.join(appDir, rel), "utf8");
  check(`${rel}: numeric input is range-checked with isInt4`, src.includes("isInt4("));
  check(`${rel}: no bare Number.isInteger guard left`, !/Number\.isInteger\(/.test(src));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
