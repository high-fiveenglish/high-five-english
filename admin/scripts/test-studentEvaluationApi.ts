// 공개 사이트 "내 강의실 > 평가서 보기" read-only API (GET /api/public/classroom/evaluation?lessonId=...)의 인증·소유권·입력 검증을
// DB 없이 검증한다. 인증은 실제 토큰 모듈(studentApiToken.ts)을 그대로 쓰고, DB만 in-memory fake로 대신한다
// (조회 조건의 의미는 라우트 파일과 같다 — 라우트의 실제 Prisma 쿼리는 rehearsal DB 통합 확인으로 따로 본다).
// 실행(admin 디렉터리): npx tsx scripts/test-studentEvaluationApi.ts
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

process.env.ADMIN_SESSION_SECRET = "unit-test-secret";
process.env.PUBLIC_SITE_ORIGINS = "https://site.example";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const { createStudentApiToken } = await import("../src/lib/studentApiToken");
  const { studentIdFromAuthHeader } = await import("../src/lib/studentApiToken");
  const { handleStudentEvaluationRequest, parseLessonIdParam } = await import("../src/lib/studentEvaluation");
  type Deps = import("../src/lib/studentEvaluation").StudentEvaluationDeps;
  type Eval = import("../src/lib/studentEvaluation").StudentLessonEvaluation;

  // ---- 1. lessonId parsing -------------------------------------------------------------------------------------
  for (const [raw, want] of [["1", 1], ["4689", 4689], ["2147483647", 2147483647], ["10", 10]] as const) {
    check(`parseLessonIdParam(${JSON.stringify(raw)}) = ${want}`, parseLessonIdParam(raw) === want);
  }
  for (const raw of [null, "", "0", "-1", "1.5", "abc", "1e3", " 1", "1 ", "01", "2147483648", "99999999999", "１２", "1;2", "0x10", "NaN", "Infinity", "4689abc"]) {
    check(`parseLessonIdParam(${JSON.stringify(raw)}) rejects`, parseLessonIdParam(raw) === null);
  }

  // ---- fake database with the same ownership semantics as the route's Prisma query -----------------------------------
  const STUDENT_A = 10;
  const STUDENT_B = 20;
  const sessions = [
    { id: 100, studentId: STUDENT_A, deletedAt: null as Date | null },
    { id: 101, studentId: STUDENT_A, deletedAt: null as Date | null }, // completed but no evaluation yet
    { id: 102, studentId: STUDENT_A, deletedAt: new Date() }, // soft-deleted session of A
    { id: 200, studentId: STUDENT_B, deletedAt: null as Date | null },
    { id: 201, studentId: STUDENT_B, deletedAt: null as Date | null },
  ];
  const evaluations = new Map<number, Eval & { aiDraft?: string; teacherQcDraft?: string }>([
    [100, { lessonId: 100, date: "2026-08-18", content: "A original", contentTranslated: "A 번역", translatedLangLabel: "한국어", aiDraft: "SECRET-AI", teacherQcDraft: "SECRET-QC" }],
    [102, { lessonId: 102, date: "2026-08-19", content: "A deleted", contentTranslated: null, translatedLangLabel: null }],
    [200, { lessonId: 200, date: "2026-08-18", content: "B original", contentTranslated: "B translated", translatedLangLabel: null }],
    [201, { lessonId: 201, date: "2026-08-20", content: "B english only", contentTranslated: null, translatedLangLabel: null }],
  ]);
  const calls: Array<[number, number]> = [];
  const deps: Deps = {
    studentIdFromRequest: studentIdFromAuthHeader,
    async findOwnEvaluation(studentId, lessonId) {
      calls.push([studentId, lessonId]);
      const s = sessions.find((x) => x.id === lessonId && x.studentId === studentId && x.deletedAt === null);
      return s ? evaluations.get(lessonId) ?? null : null;
    },
  };

  const get = (query: string, headers: Record<string, string> = {}) =>
    handleStudentEvaluationRequest(new Request(`https://admin.example/api/public/classroom/evaluation${query}`, { headers }), deps);
  const bearer = (studentId: number) => ({ authorization: `Bearer ${createStudentApiToken(studentId)}` });

  // ---- 2. authentication ---------------------------------------------------------------------------------------------
  const tokenA = createStudentApiToken(STUDENT_A);
  const [dataPart, sigPart] = tokenA.split(".");
  const flipped = sigPart.slice(0, -1) + (sigPart.endsWith("0") ? "1" : "0");
  const expiredData = Buffer.from(JSON.stringify({ studentId: STUDENT_A, iat: Date.now() - 13 * 3600_000 })).toString("base64url");
  const expiredToken = `${expiredData}.${createHmac("sha256", "unit-test-secret").update(`student-api:${expiredData}`).digest("hex")}`;
  const adminCookieValue = `1.${createHmac("sha256", "unit-test-secret").update("admin:1").digest("hex")}`;
  const teacherCookieValue = `${STUDENT_A}.${createHmac("sha256", "unit-test-secret").update(`teacher:${STUDENT_A}`).digest("hex")}`;
  const studentCookieValue = `${STUDENT_A}.${createHmac("sha256", "unit-test-secret").update(`student:${STUDENT_A}`).digest("hex")}`;
  const unauthenticated: Array<[string, Record<string, string>]> = [
    ["no credentials", {}],
    ["empty bearer", { authorization: "Bearer " }],
    ["garbage bearer", { authorization: "Bearer garbage" }],
    ["tampered signature", { authorization: `Bearer ${dataPart}.${flipped}` }],
    ["expired token (13h old, valid signature)", { authorization: `Bearer ${expiredToken}` }],
    ["admin cookie value used as a bearer", { authorization: `Bearer ${adminCookieValue}` }],
    ["teacher cookie value used as a bearer", { authorization: `Bearer ${teacherCookieValue}` }],
    ["student cookie value used as a bearer", { authorization: `Bearer ${studentCookieValue}` }],
    ["wrong scheme", { authorization: `Basic ${tokenA}` }],
    ["only session cookies, no bearer", { cookie: `admin_session=${adminCookieValue}; teacher_session=${teacherCookieValue}; student_session=${studentCookieValue}` }],
  ];
  for (const [label, headers] of unauthenticated) {
    calls.length = 0;
    const res = await get("?lessonId=100", headers);
    check(`401 for ${label}`, res.status === 401);
    check(`no database lookup for ${label}`, calls.length === 0);
  }

  // ---- 3. input validation (never reaches the database) --------------------------------------------------------------
  for (const q of ["", "?lessonId=", "?lessonId=abc", "?lessonId=-5", "?lessonId=1.5", "?lessonId=0", "?lessonId=99999999999", "?lessonId=1%3B%20drop", "?lessonid=100", "?lessonId=100&lessonId=200", "?lessonId=100&lessonId=200x"]) {
    calls.length = 0;
    const res = await get(q, bearer(STUDENT_A));
    check(`404 for query ${JSON.stringify(q)}`, res.status === 404);
    check(`no database lookup for query ${JSON.stringify(q)}`, calls.length === 0);
  }

  // ---- 4. ownership ----------------------------------------------------------------------------------------------------
  const own = await get("?lessonId=100", bearer(STUDENT_A));
  check("owner reads own evaluation (200)", own.status === 200);
  const ownBody = (await own.json()) as Record<string, unknown>;
  check("body: content", ownBody.content === "A original");
  check("body: translation + label", ownBody.contentTranslated === "A 번역" && ownBody.translatedLangLabel === "한국어");
  check("body: lessonId + date", ownBody.lessonId === 100 && ownBody.date === "2026-08-18");
  check("body: exactly the public fields (no aiDraft/teacherQcDraft or anything else)", JSON.stringify(Object.keys(ownBody).sort()) === JSON.stringify(["content", "contentTranslated", "date", "lessonId", "translatedLangLabel"]));
  check("body never contains the AI draft or Teacher QC text", !JSON.stringify(ownBody).includes("SECRET"));

  const otherStudent = await get("?lessonId=100", bearer(STUDENT_B));
  const missing = await get("?lessonId=999999", bearer(STUDENT_B));
  check("another student's lesson id -> 404", otherStudent.status === 404);
  check("A cannot read B's lesson 200", (await get("?lessonId=200", bearer(STUDENT_A))).status === 404);
  check("B can read B's lesson 200", (await get("?lessonId=200", bearer(STUDENT_B))).status === 200);
  const otherText = await otherStudent.text();
  const missingText = await missing.text();
  check("'not yours' and 'does not exist' are indistinguishable (same body)", otherText === missingText && otherText.includes("not_found"));
  check("completed lesson without a published evaluation -> 404", (await get("?lessonId=101", bearer(STUDENT_A))).status === 404);
  check("soft-deleted session -> 404 even for its owner", (await get("?lessonId=102", bearer(STUDENT_A))).status === 404);
  calls.length = 0;
  await get("?lessonId=200", bearer(STUDENT_A));
  check("the lookup is always scoped by the token's student id", calls.length === 1 && calls[0][0] === STUDENT_A && calls[0][1] === 200);

  // ---- 5. translation policy -------------------------------------------------------------------------------------------
  const noTranslation = (await (await get("?lessonId=201", bearer(STUDENT_B))).json()) as Record<string, unknown>;
  check("no translation -> both translation fields are null (English only)", noTranslation.contentTranslated === null && noTranslation.translatedLangLabel === null && noTranslation.content === "B english only");
  const halfTranslation = (await (await get("?lessonId=200", bearer(STUDENT_B))).json()) as Record<string, unknown>;
  check("translation without a language label is not exposed half-way", halfTranslation.contentTranslated === null && halfTranslation.translatedLangLabel === null);

  // ---- 6. response headers ---------------------------------------------------------------------------------------------
  const withOrigin = await get("?lessonId=100", { ...bearer(STUDENT_A), origin: "https://site.example" });
  check("CORS: allowed origin is echoed", withOrigin.headers.get("access-control-allow-origin") === "https://site.example");
  const badOrigin = await get("?lessonId=100", { ...bearer(STUDENT_A), origin: "https://evil.example" });
  check("CORS: other origins are not echoed", badOrigin.headers.get("access-control-allow-origin") !== "https://evil.example");
  for (const [label, res] of [["200", own], ["404", otherStudent], ["401", await get("?lessonId=100")]] as const) {
    check(`Cache-Control: no-store on ${label}`, res.headers.get("cache-control") === "no-store");
  }

  // ---- 7. the route file itself: student token only, ownership clause present, no admin/teacher auth ---------------------
  const route = fs.readFileSync(path.join(process.cwd(), "src", "app", "api", "public", "classroom", "evaluation", "route.ts"), "utf8");
  check("route authenticates with the student bearer token", route.includes("studentIdFromAuthHeader"));
  check("route scopes the query by the student (classSession.studentId) and the lesson (classSessionId)", /classSessionId:\s*lessonId/.test(route) && /classSession:\s*\{\s*studentId[\s,}]/.test(route));
  check("route hides soft-deleted sessions", /deletedAt:\s*null/.test(route));
  for (const forbidden of ["backofficeAuth", "teacherAuth", "studentAuth", "next/headers", "@/lib/rbac", "requireBackofficeActor", "requireTeacher", "requireStudent", "cookies("]) {
    check(`route does not use ${forbidden}`, !route.includes(forbidden));
  }
  check("route is read-only (no create/update/delete/upsert)", !/\.(create|update|updateMany|delete|deleteMany|upsert)\(/.test(route));
  check("route does not call an AI/translation API", !/translateLessonEvaluation|anthropic/i.test(route));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.log("ERROR:", String(e?.message ?? e).slice(0, 300));
  process.exit(1);
});
