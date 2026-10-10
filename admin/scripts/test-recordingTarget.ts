// 녹음 처리 경로의 환경 격리(recordingTarget.ts) 테스트 — DB/네트워크 없음(fetch는 스텁).
//  · resolveRecordingSite 규칙 표(production / preview / development, 운영 origin 차단, 입력 검증)
//  · selectRecordingSite: observe(기본, 예전 동작 유지 + 사유 로그) / enforce(거부), 로그에 URL·비밀값이 없는지
//  · createRecordingTrigger: 거부 시 fetch 호출 0회, 허용 시 URL·헤더 정확
//  · handleProcessRecordingRequest: 비밀값 미설정 503 → 틀린 비밀값 401 → 환경 헤더 누락·불일치 403 / 올바르면 통과
//  · 웹훅 주소(recordingWebhookUrl)에 같은 가드 적용
//  · 정적: URL/DEPLOY_URL 을 읽는 코드는 recordingTarget.ts 한 곳, 기존 호출 경로(웹훅·강사 액션·복구 함수)는 그대로
import fs from "node:fs";
import path from "node:path";
import {
  legacyRecordingSiteUrl,
  parseAppEnv,
  parseHttpsOrigin,
  readGuardMode,
  readRecordingEnvCheck,
  resetRecordingTargetLogDedupe,
  resolveRecordingSite,
  selectRecordingSite,
  verifySourceEnv,
  type EnvLike,
} from "../src/lib/recordingTarget";
import { createRecordingTrigger } from "../src/lib/recordingTrigger";
import { recordingWebhookUrl, isRecordingIntakeAvailable } from "../src/lib/recordingIntakeConfig";
import { handleProcessRecordingRequest, type ProcessRecordingDeps } from "../src/lib/recordingProcessing";
import { RECORDING_PROCESSING_SECRET_HEADER, RECORDING_SOURCE_ENV_HEADER } from "../src/lib/recordingProcessingAuth";

let pass = 0;
let fail = 0;
function assert(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

const PROD = "https://prod.example.com";
const PREVIEW = "https://deploy-preview-9--site.example.com";
const SECRET = "test-processing-secret-0123456789";

// ───────────────────────── parseAppEnv / readGuardMode ─────────────────────────
{
  assert(parseAppEnv("production").ok && parseAppEnv(" Preview ").ok && parseAppEnv("DEVELOPMENT").ok, "APP_ENV: 세 값은 대소문자·공백 무시");
  const un = parseAppEnv(undefined);
  assert(!un.ok && un.reason === "app_env_unset" && !parseAppEnv("  ").ok, "APP_ENV: 미설정/빈 값 → app_env_unset");
  const bad = parseAppEnv("staging");
  assert(!bad.ok && bad.reason === "app_env_invalid", "APP_ENV: 정의되지 않은 값 → app_env_invalid");
  assert(readGuardMode({}) === "observe" && readGuardMode({ RECORDING_TARGET_GUARD: "observe" }) === "observe", "guard mode: 기본/observe");
  assert(readGuardMode({ RECORDING_TARGET_GUARD: "enforce" }) === "enforce" && readGuardMode({ RECORDING_TARGET_GUARD: " ENFORCE " }) === "enforce", "guard mode: enforce(대소문자·공백 무시)");
  assert(readGuardMode({ RECORDING_TARGET_GUARD: "enforced" }) === "observe", "guard mode: 오타는 observe(운영 트리거를 막지 않는다)");
}

// ───────────────────────── parseHttpsOrigin ─────────────────────────
{
  const good: [string, string][] = [
    ["https://a.example.com", "https://a.example.com"],
    ["https://a.example.com/", "https://a.example.com"],
    [" https://A.Example.COM ", "https://a.example.com"],
    ["https://a.example.com:443", "https://a.example.com"],
    ["https://a.example.com:8443", "https://a.example.com:8443"],
  ];
  for (const [raw, origin] of good) {
    const r = parseHttpsOrigin(raw);
    assert(r.ok && r.origin === origin, `origin: "${raw}" → ${origin}`);
  }
  const badCases: [string, string][] = [
    ["", "site_url_invalid"],
    ["not a url", "site_url_invalid"],
    ["a.example.com", "site_url_invalid"],
    ["http://a.example.com", "site_url_not_https"],
    ["ftp://a.example.com", "site_url_not_https"],
    ["https://user@a.example.com", "site_url_has_credentials"],
    ["https://user:pw@a.example.com", "site_url_has_credentials"],
    ["https://a.example.com/path", "site_url_not_origin"],
    ["https://a.example.com//", "site_url_not_origin"],
    ["https://a.example.com/?x=1", "site_url_not_origin"],
    ["https://a.example.com?x=1", "site_url_not_origin"],
    ["https://a.example.com#frag", "site_url_not_origin"],
    ["https://a.example.com/#", "site_url_not_origin"],
    ["https://a.example.com?", "site_url_not_origin"],
  ];
  for (const [raw, reason] of badCases) {
    const r = parseHttpsOrigin(raw);
    assert(!r.ok && r.reason === reason, `origin: "${raw}" → 거부(${reason})`);
  }
}

// ───────────────────────── resolveRecordingSite 규칙 표 ─────────────────────────
type Row = { label: string; env: EnvLike; expect: { ok: true; origin: string } | { ok: false; reason: string } };
const rows: Row[] = [
  { label: "production + URL 폴백", env: { APP_ENV: "production", URL: PROD }, expect: { ok: true, origin: PROD } },
  { label: "production + URL 끝 슬래시", env: { APP_ENV: "production", URL: `${PROD}/` }, expect: { ok: true, origin: PROD } },
  { label: "production + 명시값(운영과 같음)", env: { APP_ENV: "production", URL: PROD, RECORDING_SITE_URL: PROD }, expect: { ok: true, origin: PROD } },
  { label: "production + 명시값이 운영 목록의 별칭(PRODUCTION_SITE_ORIGIN)", env: { APP_ENV: "production", URL: PROD, PRODUCTION_SITE_ORIGIN: "https://www.example.com, https://alias.example.com", RECORDING_SITE_URL: "https://www.example.com" }, expect: { ok: true, origin: "https://www.example.com" } },
  { label: "production + 명시값이 운영이 아닌 origin", env: { APP_ENV: "production", URL: PROD, RECORDING_SITE_URL: PREVIEW }, expect: { ok: false, reason: "production_target_mismatch" } },
  { label: "production + URL 없음 + 명시값 없음", env: { APP_ENV: "production" }, expect: { ok: false, reason: "site_url_unset" } },
  { label: "production + URL 없음 + 명시값(기준 없음)", env: { APP_ENV: "production", RECORDING_SITE_URL: PROD }, expect: { ok: true, origin: PROD } },
  { label: "production + URL 이 http", env: { APP_ENV: "production", URL: "http://prod.example.com" }, expect: { ok: false, reason: "site_url_not_https" } },
  { label: "preview + URL 폴백 금지(운영 URL 만 있음)", env: { APP_ENV: "preview", URL: PROD }, expect: { ok: false, reason: "site_url_unset" } },
  { label: "preview + DEPLOY_URL 폴백 금지", env: { APP_ENV: "preview", URL: PROD, DEPLOY_URL: PREVIEW }, expect: { ok: false, reason: "site_url_unset" } },
  { label: "preview + 운영 origin 명시(URL 기준)", env: { APP_ENV: "preview", URL: PROD, RECORDING_SITE_URL: PROD }, expect: { ok: false, reason: "production_origin_from_non_production" } },
  { label: "preview + 운영 origin 명시(끝 슬래시·대문자)", env: { APP_ENV: "preview", URL: PROD, RECORDING_SITE_URL: "https://PROD.example.com/" }, expect: { ok: false, reason: "production_origin_from_non_production" } },
  { label: "preview + 운영 별칭 origin(PRODUCTION_SITE_ORIGIN)", env: { APP_ENV: "preview", URL: PROD, PRODUCTION_SITE_ORIGIN: "https://www.example.com", RECORDING_SITE_URL: "https://www.example.com" }, expect: { ok: false, reason: "production_origin_from_non_production" } },
  { label: "preview + 운영 origin(URL 없음, PRODUCTION_SITE_ORIGIN 만)", env: { APP_ENV: "preview", PRODUCTION_SITE_ORIGIN: PROD, RECORDING_SITE_URL: PROD }, expect: { ok: false, reason: "production_origin_from_non_production" } },
  { label: "preview + 자기 origin", env: { APP_ENV: "preview", URL: PROD, RECORDING_SITE_URL: PREVIEW }, expect: { ok: true, origin: PREVIEW } },
  { label: "development + 자기 origin", env: { APP_ENV: "development", URL: PROD, RECORDING_SITE_URL: "https://dev.example.com" }, expect: { ok: true, origin: "https://dev.example.com" } },
  { label: "development + 운영 origin", env: { APP_ENV: "development", URL: PROD, RECORDING_SITE_URL: PROD }, expect: { ok: false, reason: "production_origin_from_non_production" } },
  { label: "development + 미설정", env: { APP_ENV: "development", URL: PROD }, expect: { ok: false, reason: "site_url_unset" } },
  { label: "preview + http", env: { APP_ENV: "preview", RECORDING_SITE_URL: "http://dev.example.com" }, expect: { ok: false, reason: "site_url_not_https" } },
  { label: "preview + 경로 포함", env: { APP_ENV: "preview", RECORDING_SITE_URL: "https://dev.example.com/api" }, expect: { ok: false, reason: "site_url_not_origin" } },
  { label: "preview + 쿼리 포함", env: { APP_ENV: "preview", RECORDING_SITE_URL: "https://dev.example.com?x=1" }, expect: { ok: false, reason: "site_url_not_origin" } },
  { label: "preview + 사용자 정보 포함", env: { APP_ENV: "preview", RECORDING_SITE_URL: "https://u:p@dev.example.com" }, expect: { ok: false, reason: "site_url_has_credentials" } },
  { label: "preview + 잘못된 URL", env: { APP_ENV: "preview", RECORDING_SITE_URL: "::::" }, expect: { ok: false, reason: "site_url_invalid" } },
  { label: "APP_ENV 미설정", env: { URL: PROD, RECORDING_SITE_URL: PREVIEW }, expect: { ok: false, reason: "app_env_unset" } },
  { label: "APP_ENV 유효하지 않음", env: { APP_ENV: "staging", URL: PROD }, expect: { ok: false, reason: "app_env_invalid" } },
  { label: "운영 목록의 잘못된 항목은 무시(유효 항목은 유지)", env: { APP_ENV: "preview", PRODUCTION_SITE_ORIGIN: "garbage, http://x.example.com, https://prod2.example.com", RECORDING_SITE_URL: "https://prod2.example.com" }, expect: { ok: false, reason: "production_origin_from_non_production" } },
];
for (const r of rows) {
  const got = resolveRecordingSite(r.env);
  const ok = r.expect.ok ? got.ok && got.origin === r.expect.origin : !got.ok && got.reason === r.expect.reason;
  assert(ok, `resolve: ${r.label} → ${JSON.stringify(r.expect)} (실제 ${JSON.stringify(got)})`);
}
// 순수 함수: 입력 환경 객체를 바꾸지 않는다
{
  const env = { APP_ENV: "preview", URL: PROD, RECORDING_SITE_URL: PREVIEW };
  const snapshot = JSON.stringify(env);
  resolveRecordingSite(env);
  assert(JSON.stringify(env) === snapshot, "resolve: 환경 객체를 변경하지 않음");
}

// ───────────────────────── selectRecordingSite: observe / enforce, 로그 ─────────────────────────
{
  type Entry = { message: string; detail: { reason: string; mode: string } };
  const mk = () => {
    const entries: Entry[] = [];
    return { entries, log: (message: string, detail: { reason: string; mode: "observe" | "enforce" }) => entries.push({ message, detail }) };
  };
  // observe(기본): 예전 값(URL ?? DEPLOY_URL 원문)을 그대로 쓰고, 규칙상 거부였다면 사유만 로그
  resetRecordingTargetLogDedupe();
  let c = mk();
  assert(selectRecordingSite({ URL: PROD }, c.log) === PROD, "observe: URL 폴백 그대로(기존 동작)");
  assert(c.entries.length === 1 && c.entries[0].message === "recording-target-observe" && c.entries[0].detail.reason === "app_env_unset", "observe: APP_ENV 없음 → 사유만 로그");
  assert(selectRecordingSite({ DEPLOY_URL: "https://d.example.com/" }, c.log) === "https://d.example.com/", "observe: DEPLOY_URL 폴백 그대로(원문)");
  assert(selectRecordingSite({}, c.log) === null, "observe: URL/DEPLOY_URL 모두 없음 → null");
  assert(c.entries.length === 1, "observe: 같은 사유는 프로세스당 1회만 로그");
  resetRecordingTargetLogDedupe();
  c = mk();
  assert(selectRecordingSite({ APP_ENV: "preview", URL: PROD }, c.log) === PROD, "observe: 미리보기에서 운영 URL 폴백도 예전 그대로(관찰만)");
  assert(c.entries.some((e) => e.detail.reason === "site_url_unset" && e.detail.mode === "observe"), "observe: 위 경우 거부했을 사유(site_url_unset)를 로그");
  assert(selectRecordingSite({ APP_ENV: "production", URL: PROD, RECORDING_SITE_URL: PREVIEW }, c.log) === PROD, "observe: RECORDING_SITE_URL 을 미리 설정해도 동작은 예전 그대로");
  // enforce
  resetRecordingTargetLogDedupe();
  c = mk();
  assert(selectRecordingSite({ RECORDING_TARGET_GUARD: "enforce", APP_ENV: "production", URL: PROD }, c.log) === PROD, "enforce: production URL 폴백 허용");
  assert(c.entries.length === 0, "enforce: 허용 시 로그 없음");
  assert(selectRecordingSite({ RECORDING_TARGET_GUARD: "enforce", APP_ENV: "preview", URL: PROD }, c.log) === null, "enforce: preview 는 URL 폴백 없음 → null");
  assert(selectRecordingSite({ RECORDING_TARGET_GUARD: "enforce", APP_ENV: "preview", URL: PROD, RECORDING_SITE_URL: PROD }, c.log) === null, "enforce: preview 가 운영 origin → null");
  assert(selectRecordingSite({ RECORDING_TARGET_GUARD: "enforce", APP_ENV: "preview", URL: PROD, RECORDING_SITE_URL: PREVIEW }, c.log) === PREVIEW, "enforce: preview 자기 origin 허용");
  assert(selectRecordingSite({ RECORDING_TARGET_GUARD: "enforce", URL: PROD }, c.log) === null, "enforce: APP_ENV 없음 → null");
  assert(selectRecordingSite({ RECORDING_TARGET_GUARD: "enforce", APP_ENV: "preview", DEPLOY_URL: PREVIEW }, c.log) === null, "enforce: DEPLOY_URL 은 어떤 경우에도 쓰지 않음");
  const reasons = c.entries.map((e) => e.detail.reason);
  assert(reasons.includes("site_url_unset") && reasons.includes("production_origin_from_non_production") && reasons.includes("app_env_unset"), "enforce: 거부 사유 코드가 로그에 남음");
  assert(c.entries.every((e) => e.message === "recording-target-denied" && e.detail.mode === "enforce"), "enforce: 거부 로그 형식");
  const logText = JSON.stringify(c.entries);
  assert(!logText.includes("example.com") && !logText.includes("https://") && !logText.includes(SECRET), "로그에 URL·비밀값이 없다(사유 코드만)");
  assert(legacyRecordingSiteUrl({ URL: "a", DEPLOY_URL: "b" }) === "a" && legacyRecordingSiteUrl({ DEPLOY_URL: "b" }) === "b", "legacy: URL ?? DEPLOY_URL");
}

// ───────────────────────── 트리거: fetch 스텁 ─────────────────────────
type Call = { url: string; init: RequestInit };
function stubFetch(status = 202) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(null, { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}
const headersOf = (c: Call) => c.init.headers as Record<string, string>;
const silent = () => {};

const triggerTests = (async () => {
  // 거부 → fetch 호출 0회
  const deniedEnvs: [string, EnvLike][] = [
    ["preview + 폴백 없음", { RECORDING_TARGET_GUARD: "enforce", APP_ENV: "preview", URL: PROD, RECORDING_PROCESSING_SECRET: SECRET }],
    ["preview + 운영 origin 명시", { RECORDING_TARGET_GUARD: "enforce", APP_ENV: "preview", URL: PROD, RECORDING_SITE_URL: PROD, RECORDING_PROCESSING_SECRET: SECRET }],
    ["APP_ENV 없음", { RECORDING_TARGET_GUARD: "enforce", URL: PROD, RECORDING_PROCESSING_SECRET: SECRET }],
    ["http origin", { RECORDING_TARGET_GUARD: "enforce", APP_ENV: "preview", RECORDING_SITE_URL: "http://dev.example.com", RECORDING_PROCESSING_SECRET: SECRET }],
    ["경로 포함", { RECORDING_TARGET_GUARD: "enforce", APP_ENV: "preview", RECORDING_SITE_URL: "https://dev.example.com/x", RECORDING_PROCESSING_SECRET: SECRET }],
    ["사용자 정보 포함", { RECORDING_TARGET_GUARD: "enforce", APP_ENV: "preview", RECORDING_SITE_URL: "https://u:p@dev.example.com", RECORDING_PROCESSING_SECRET: SECRET }],
  ];
  for (const [label, env] of deniedEnvs) {
    resetRecordingTargetLogDedupe();
    const s = stubFetch();
    const ok = await createRecordingTrigger({ env, fetchImpl: s.fetchImpl, log: silent })(1);
    assert(ok === false && s.calls.length === 0, `trigger(enforce): ${label} → false, fetch 호출 0회`);
  }
  // 비밀값 미설정 → fetch 없음(기존 동작)
  {
    const s = stubFetch();
    const ok = await createRecordingTrigger({ env: { RECORDING_TARGET_GUARD: "enforce", APP_ENV: "production", URL: PROD }, fetchImpl: s.fetchImpl, log: silent })(1);
    assert(ok === false && s.calls.length === 0, "trigger: 비밀값 미설정 → false, fetch 없음");
  }
  // 허용 → URL·헤더 정확
  {
    resetRecordingTargetLogDedupe();
    const s = stubFetch();
    const ok = await createRecordingTrigger({ env: { RECORDING_TARGET_GUARD: "enforce", APP_ENV: "production", URL: `${PROD}/`, RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: s.fetchImpl, log: silent })(42);
    assert(ok === true && s.calls.length === 1, "trigger(enforce): production → 호출 1회, 2xx 면 true");
    const call = s.calls[0];
    assert(call.url === `${PROD}/.netlify/functions/process-recording-background`, "trigger: URL = origin + /.netlify/functions/process-recording-background");
    assert(call.init.method === "POST" && call.init.body === JSON.stringify({ audioRecordingId: 42 }), "trigger: POST + 본문");
    const h = headersOf(call);
    assert(h[RECORDING_PROCESSING_SECRET_HEADER] === SECRET && h[RECORDING_SOURCE_ENV_HEADER] === "production" && h["Content-Type"] === "application/json", "trigger: 비밀값 헤더 + x-recording-source-env=production + Content-Type");
  }
  {
    const s = stubFetch();
    await createRecordingTrigger({ env: { RECORDING_TARGET_GUARD: "enforce", APP_ENV: "preview", URL: PROD, RECORDING_SITE_URL: PREVIEW, RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: s.fetchImpl, log: silent })(7);
    assert(s.calls.length === 1 && s.calls[0].url === `${PREVIEW}/.netlify/functions/process-recording-background` && headersOf(s.calls[0])[RECORDING_SOURCE_ENV_HEADER] === "preview", "trigger(enforce): preview 자기 origin 호출 + 환경 헤더 preview");
  }
  // observe(기본): 예전 동작 그대로 — 운영 URL 폴백, 환경 헤더는 APP_ENV 가 있을 때만 추가
  {
    resetRecordingTargetLogDedupe();
    const s = stubFetch();
    const ok = await createRecordingTrigger({ env: { URL: PROD, RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: s.fetchImpl, log: silent })(5);
    assert(ok && s.calls.length === 1 && s.calls[0].url === `${PROD}/.netlify/functions/process-recording-background`, "trigger(observe, 기본): URL 폴백으로 예전처럼 호출");
    assert(!(RECORDING_SOURCE_ENV_HEADER in headersOf(s.calls[0])), "trigger(observe): APP_ENV 가 없으면 환경 헤더를 보내지 않음");
    const s2 = stubFetch();
    await createRecordingTrigger({ env: { URL: PROD, APP_ENV: "preview", RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: s2.fetchImpl, log: silent })(5);
    assert(s2.calls.length === 1 && headersOf(s2.calls[0])[RECORDING_SOURCE_ENV_HEADER] === "preview", "trigger(observe): APP_ENV=preview 면 환경 헤더 preview 를 보냄(호출 대상은 예전 그대로)");
    const s3 = stubFetch();
    await createRecordingTrigger({ env: { DEPLOY_URL: "https://deploy.example.com", RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: s3.fetchImpl, log: silent })(5);
    assert(s3.calls.length === 1 && s3.calls[0].url === "https://deploy.example.com/.netlify/functions/process-recording-background", "trigger(observe): DEPLOY_URL 폴백도 예전 그대로");
    const none = stubFetch();
    assert((await createRecordingTrigger({ env: { RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: none.fetchImpl, log: silent })(5)) === false && none.calls.length === 0, "trigger(observe): 주소 없음 → false");
  }
  // 응답/오류 처리(기존 계약): 비 2xx → false, 네트워크 오류 → false
  {
    const env: EnvLike = { RECORDING_TARGET_GUARD: "enforce", APP_ENV: "production", URL: PROD, RECORDING_PROCESSING_SECRET: SECRET };
    const bad = stubFetch(403);
    assert((await createRecordingTrigger({ env, fetchImpl: bad.fetchImpl, log: silent })(1)) === false, "trigger: 403 응답 → false(복구 경로가 재시도)");
    const boom = (async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    assert((await createRecordingTrigger({ env, fetchImpl: boom, log: silent })(1)) === false, "trigger: 네트워크 오류 → false");
  }
})();

// ───────────────────────── 처리 함수 진입점 ─────────────────────────
interface Probe {
  deps: ProcessRecordingDeps;
  touched: () => number;
}
function probeDeps(): Probe {
  let n = 0;
  const deps = {
    async findRecording() {
      n++;
      return null; // → processRecording 이 "not_found"(404)
    },
  } as unknown as ProcessRecordingDeps;
  return { deps, touched: () => n };
}
function req(headers: Record<string, string>, body: unknown = { audioRecordingId: 1 }) {
  return new Request("https://example.test/.netlify/functions/process-recording-background", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const handlerTests = (async () => {
  const enforce = readRecordingEnvCheck({ RECORDING_TARGET_GUARD: "enforce", APP_ENV: "production" });
  const observe = readRecordingEnvCheck({ APP_ENV: "production" });
  const enforceNoEnv = readRecordingEnvCheck({ RECORDING_TARGET_GUARD: "enforce" });
  const origWarn = console.warn;
  const warned: string[] = [];
  console.warn = (...a: unknown[]) => void warned.push(a.map(String).join(" "));
  try {
    const cases: { label: string; secret: string | null; headers: Record<string, string>; check?: typeof enforce; status: number; touched: boolean }[] = [
      { label: "enforce: 환경 헤더 일치 → 통과(처리 진입, 레코드 없음 404)", secret: SECRET, headers: { [RECORDING_PROCESSING_SECRET_HEADER]: SECRET, [RECORDING_SOURCE_ENV_HEADER]: "production" }, check: enforce, status: 404, touched: true },
      { label: "enforce: 환경 헤더 대소문자·공백 무시", secret: SECRET, headers: { [RECORDING_PROCESSING_SECRET_HEADER]: SECRET, [RECORDING_SOURCE_ENV_HEADER]: " Production " }, check: enforce, status: 404, touched: true },
      { label: "enforce: 환경 헤더 누락 → 403", secret: SECRET, headers: { [RECORDING_PROCESSING_SECRET_HEADER]: SECRET }, check: enforce, status: 403, touched: false },
      { label: "enforce: 환경 헤더 불일치(preview) → 403", secret: SECRET, headers: { [RECORDING_PROCESSING_SECRET_HEADER]: SECRET, [RECORDING_SOURCE_ENV_HEADER]: "preview" }, check: enforce, status: 403, touched: false },
      { label: "enforce: 환경 헤더 빈 값 → 403", secret: SECRET, headers: { [RECORDING_PROCESSING_SECRET_HEADER]: SECRET, [RECORDING_SOURCE_ENV_HEADER]: "  " }, check: enforce, status: 403, touched: false },
      { label: "enforce: 이 배포의 APP_ENV 없음 → 503(environment_not_configured)", secret: SECRET, headers: { [RECORDING_PROCESSING_SECRET_HEADER]: SECRET, [RECORDING_SOURCE_ENV_HEADER]: "production" }, check: enforceNoEnv, status: 503, touched: false },
      { label: "틀린 비밀값 → 401(환경 헤더가 맞아도, 환경 검사보다 먼저)", secret: SECRET, headers: { [RECORDING_PROCESSING_SECRET_HEADER]: "nope", [RECORDING_SOURCE_ENV_HEADER]: "production" }, check: enforce, status: 401, touched: false },
      { label: "틀린 비밀값 + 환경 헤더 누락 → 401(환경 불일치를 알리지 않음)", secret: SECRET, headers: { [RECORDING_PROCESSING_SECRET_HEADER]: "nope" }, check: enforce, status: 401, touched: false },
      { label: "비밀값 헤더 없음 → 401", secret: SECRET, headers: { [RECORDING_SOURCE_ENV_HEADER]: "production" }, check: enforce, status: 401, touched: false },
      { label: "서버 비밀값 미설정 → 503(기존, 환경 검사보다 먼저)", secret: null, headers: { [RECORDING_PROCESSING_SECRET_HEADER]: SECRET, [RECORDING_SOURCE_ENV_HEADER]: "production" }, check: enforce, status: 503, touched: false },
      { label: "observe: 환경 헤더 누락도 통과(예전 호출자 호환)", secret: SECRET, headers: { [RECORDING_PROCESSING_SECRET_HEADER]: SECRET }, check: observe, status: 404, touched: true },
      { label: "observe: 환경 헤더 불일치도 통과(사유만 로그)", secret: SECRET, headers: { [RECORDING_PROCESSING_SECRET_HEADER]: SECRET, [RECORDING_SOURCE_ENV_HEADER]: "preview" }, check: observe, status: 404, touched: true },
      { label: "envCheck 생략(기존 3인자 호출) → 환경 검사 없음", secret: SECRET, headers: { [RECORDING_PROCESSING_SECRET_HEADER]: SECRET }, check: undefined, status: 404, touched: true },
      { label: "observe: 틀린 비밀값은 여전히 401", secret: SECRET, headers: { [RECORDING_PROCESSING_SECRET_HEADER]: "x".repeat(SECRET.length) }, check: observe, status: 401, touched: false },
    ];
    for (const c of cases) {
      resetRecordingTargetLogDedupe();
      const p = probeDeps();
      const res = await handleProcessRecordingRequest(req(c.headers), c.secret, p.deps, c.check);
      assert(res.status === c.status, `handler: ${c.label} → ${c.status} (실제 ${res.status})`);
      assert((p.touched() > 0) === c.touched, `handler: ${c.label} — deps ${c.touched ? "접근함" : "접근하지 않음"}`);
    }
    // 응답 본문: 환경 불일치는 사유만(요청 내용이나 값을 되돌려주지 않는다)
    resetRecordingTargetLogDedupe();
    const mismatch = await handleProcessRecordingRequest(req({ [RECORDING_PROCESSING_SECRET_HEADER]: SECRET, [RECORDING_SOURCE_ENV_HEADER]: "preview" }), SECRET, probeDeps().deps, enforce);
    assert((await mismatch.text()) === "environment_mismatch", "handler: 403 본문은 environment_mismatch");
    resetRecordingTargetLogDedupe();
    const noenv = await handleProcessRecordingRequest(req({ [RECORDING_PROCESSING_SECRET_HEADER]: SECRET }), SECRET, probeDeps().deps, enforceNoEnv);
    assert((await noenv.text()) === "environment_not_configured", "handler: 503 본문은 environment_not_configured");
    // 로그: 사유 코드만, 비밀값·헤더 값·URL 없음
    const logs = warned.join("\n");
    assert(logs.includes("header_missing") && logs.includes("header_mismatch") && logs.includes("app_env_not_configured"), "handler: 사유 코드 로그(header_missing/header_mismatch/app_env_not_configured)");
    assert(!logs.includes(SECRET) && !logs.includes("https://") && !logs.includes("example.test"), "handler: 로그에 비밀값·URL 없음");
  } finally {
    console.warn = origWarn;
  }
  // verifySourceEnv 단위
  const v1 = verifySourceEnv("production", enforce, silent);
  const v2 = verifySourceEnv(null, enforce, silent);
  assert(v1.ok && !v2.ok && v2.status === 403, "verifySourceEnv: 일치 통과 / 누락 403");
})();

// ───────────────────────── 웹훅 주소 ─────────────────────────
{
  const full = { R2_RECORDINGS_ENDPOINT: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com", R2_RECORDINGS_ACCESS_KEY_ID: "k", R2_RECORDINGS_SECRET_ACCESS_KEY: "s", R2_RECORDINGS_BUCKET_NAME: "test-recordings-bucket", ASSEMBLYAI_API_KEY: "k", ASSEMBLYAI_WEBHOOK_SECRET: "s" };
  resetRecordingTargetLogDedupe();
  assert(recordingWebhookUrl({ URL: PROD }) === `${PROD}/api/public/assemblyai-webhook`, "webhook(observe): URL 폴백 — 기존 계약 그대로");
  assert(recordingWebhookUrl({ DEPLOY_URL: "https://d.example.com/" }) === "https://d.example.com/api/public/assemblyai-webhook" && recordingWebhookUrl({ URL: "http://site.example" }) === null, "webhook(observe): DEPLOY_URL 폴백, http 는 null — 기존 계약 그대로");
  const E = { RECORDING_TARGET_GUARD: "enforce" };
  assert(recordingWebhookUrl({ ...E, APP_ENV: "production", URL: PROD }) === `${PROD}/api/public/assemblyai-webhook`, "webhook(enforce): production URL 폴백");
  assert(recordingWebhookUrl({ ...E, APP_ENV: "preview", URL: PROD }) === null, "webhook(enforce): preview 는 URL 폴백 없음 → null");
  assert(recordingWebhookUrl({ ...E, APP_ENV: "preview", URL: PROD, RECORDING_SITE_URL: PROD }) === null, "webhook(enforce): preview 가 운영 origin → null");
  assert(recordingWebhookUrl({ ...E, APP_ENV: "preview", URL: PROD, DEPLOY_URL: PREVIEW }) === null, "webhook(enforce): DEPLOY_URL 무시");
  assert(recordingWebhookUrl({ ...E, APP_ENV: "preview", URL: PROD, RECORDING_SITE_URL: PREVIEW }) === `${PREVIEW}/api/public/assemblyai-webhook`, "webhook(enforce): preview 자기 origin");
  assert(isRecordingIntakeAvailable({ ...full, ...E, APP_ENV: "preview", URL: PROD }) === false, "intake(enforce): preview 에서 운영으로 향하는 구성이면 업로드 비활성");
  assert(isRecordingIntakeAvailable({ ...full, ...E, APP_ENV: "production", URL: PROD }) === true, "intake(enforce): production 은 사용 가능");
  assert(isRecordingIntakeAvailable({ ...full, URL: PROD }) === true, "intake(observe): 기존 구성(URL 만)은 그대로 사용 가능");
}

// ───────────────────────── 정적 검사 ─────────────────────────
{
  const ADMIN = path.join(__dirname, "..");
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "generated" || e.name === "node_modules" ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]));
  const files = [...walk(path.join(ADMIN, "src")), ...walk(path.join(ADMIN, "netlify"))].filter((f) => /\.(ts|tsx|js|mjs)$/.test(f));
  const readers = files.filter((f) => /\b(process\.env\.(URL|DEPLOY_URL)\b|process\.env\[["'](URL|DEPLOY_URL)["']\]|\benv\.(URL|DEPLOY_URL)\b|\benv\[["'](URL|DEPLOY_URL)["']\])/.test(strip(fs.readFileSync(f, "utf8"))));
  const rel = readers.map((f) => path.relative(ADMIN, f).split(path.sep).join("/"));
  assert(rel.length === 1 && rel[0] === "src/lib/recordingTarget.ts", `정적: URL/DEPLOY_URL 을 읽는 위치는 src/lib/recordingTarget.ts 한 곳(실제 ${JSON.stringify(rel)})`);

  const read = (p: string) => strip(fs.readFileSync(path.join(ADMIN, p), "utf8"));
  assert(/triggerProcessing: triggerRecordingProcessing/.test(read("src/app/api/public/assemblyai-webhook/route.ts")) && /from "@\/lib\/recordingTrigger"/.test(read("src/app/api/public/assemblyai-webhook/route.ts")), "호출 경로 유지: assemblyai-webhook 라우트가 triggerRecordingProcessing 사용");
  assert(/triggerProcessing: triggerRecordingProcessing/.test(read("src/app/teacher/(dashboard)/sessions/[id]/recordingActions.ts")), "호출 경로 유지: 강사 화자 확인 액션이 triggerRecordingProcessing 사용");
  for (const f of ["netlify/functions/recover-awaiting-recordings.ts", "netlify/functions/recover-transcribed-recordings.ts"]) {
    assert(/triggerProcessing: triggerRecordingProcessing/.test(read(f)) && /recordingTrigger/.test(read(f)), `호출 경로 유지: ${f} 가 triggerRecordingProcessing 사용`);
  }
  const fn = read("netlify/functions/process-recording-background.ts");
  assert(/handleProcessRecordingRequest\(req, getRecordingProcessingSecret\(\), prismaDeps, readRecordingEnvCheck\(process\.env\)\)/.test(fn), "처리 함수: 환경 검사를 handleProcessRecordingRequest 4번째 인자로 전달");
  const trig = read("src/lib/recordingTrigger.ts");
  assert(/selectRecordingSite\(/.test(trig) && /RECORDING_SOURCE_ENV_HEADER/.test(trig), "트리거: 해석기 사용 + 환경 헤더 전송");
  assert(/selectRecordingSite\(/.test(read("src/lib/recordingIntakeConfig.ts")), "웹훅 주소: 같은 해석기 사용");
  assert(/export const triggerRecordingProcessing = createRecordingTrigger\(\)/.test(trig), "기존 export 이름(triggerRecordingProcessing)과 (id) => Promise<boolean> 시그니처 유지");
}

Promise.all([triggerTests, handlerTests]).then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
});
