// 녹음 처리 경로의 환경 격리(recordingTarget.ts) 테스트 — DB/네트워크 없음(fetch는 스텁).
//  · resolveRecordingSite 규칙 표(production / preview / development, 운영 origin 차단, 입력 검증)
//  · selectRecordingSite: observe(기본, 예전 동작 유지 + 사유 로그) / enforce(거부), 로그에 URL·비밀값이 없는지
//  · createRecordingTrigger: 거부 시 fetch 호출 0회, 허용 시 URL·헤더 정확
//  · handleProcessRecordingRequest: 비밀값 미설정 503 → 틀린 비밀값 401 → 환경 헤더 누락·불일치 403 / 올바르면 통과
//  · 웹훅 주소(recordingWebhookUrl)에 같은 가드 적용
//  · 정적: URL/DEPLOY_URL 을 읽는 코드는 recordingTarget.ts 한 곳, 기존 호출 경로(웹훅·강사 액션·복구 함수)는 그대로
// PR #18 리뷰 반영 테스트(끝부분 reviewFixTests): Preview→Production 거부, 구형 호출자, 가드 값 오타, 끝 점·SITE_NAME·잘못된 PRODUCTION_SITE_ORIGIN,
//  리다이렉트(301/307, 로컬 loopback 서버), 함수 모듈 경유 환경 검사, 기본 로그 경로, 설정 오류 시 상태 유지·재시도·복구
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import {
  diagnoseRecordingConfig,
  legacyRecordingSiteUrl,
  parseAppEnv,
  parseHttpsOrigin,
  readGuardMode,
  readGuardModeDetailed,
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
import { recoverStuckTranscribedRecordings, type RecoveryDeps } from "../src/lib/recordingRecovery";
import { confirmTeacherSpeaker, type ConfirmDeps } from "../src/lib/speakerConfirmation";

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
    const cases: { label: string; secret: string | null; headers: Record<string, string>; check: typeof enforce; status: number; touched: boolean }[] = [
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

// ═════════════════════════ PR #18 리뷰 반영 테스트 ═════════════════════════
// 네트워크는 로컬 loopback(127.0.0.1, 포트 0) 서버와 fetch 스텁만 쓴다. 외부 주소·실제 DB·실제 환경변수 값은 쓰지 않는다.
// 먼저 끝난 기존 테스트와 console.warn 패치가 겹치지 않도록 순서대로 실행한다.

/** 호출자(트리거)의 fetch 를 수신 쪽 handleProcessRecordingRequest 로 이어 주는 스텁 — 사이트 주소는 무시하고 요청만 전달한다. */
function bridgeTo(receiver: { secret: string | null; check: ReturnType<typeof readRecordingEnvCheck>; deps: ProcessRecordingDeps }) {
  const seen: { status: number; body: string }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const res = await handleProcessRecordingRequest(new Request(String(url), init), receiver.secret, receiver.deps, receiver.check);
    seen.push({ status: res.status, body: await res.clone().text() });
    return res;
  }) as typeof fetch;
  return { seen, fetchImpl };
}
/** 레코드가 이미 끝난 상태라 처리 진입(= 환경 검사 통과)이 200 으로 보이는 수신 쪽 deps. 읽기 외에는 아무것도 하지 않는다. */
function acceptingDeps(): { deps: ProcessRecordingDeps; reached: () => number } {
  let n = 0;
  const deps = {
    async findRecording(id: number) {
      n++;
      return { id, providerTranscriptId: "t", processingStatus: "NEEDS_REVIEW", confirmedTeacherSpeaker: null, storedUtterances: null, lessonContext: {} };
    },
  } as unknown as ProcessRecordingDeps;
  return { deps, reached: () => n };
}
function captureWarn() {
  const orig = console.warn;
  const lines: string[] = [];
  console.warn = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  return { lines, restore: () => (console.warn = orig) };
}
function listen(handler: http.RequestListener): Promise<{ server: http.Server; origin: string }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
  });
}
const closeServer = (s: http.Server) => new Promise<void>((r) => s.close(() => r()));

async function reviewFixTests() {
  // ── (1)(2)(3) Preview/Production/구형 호출자 ↔ 운영 수신 함수(enforce) ──
  {
    const receiverEnv: EnvLike = { RECORDING_TARGET_GUARD: "enforce", APP_ENV: "production", RECORDING_PROCESSING_SECRET: SECRET };
    const mkReceiver = () => {
      const a = acceptingDeps();
      return { a, receiver: { secret: SECRET, check: readRecordingEnvCheck(receiverEnv, silent), deps: a.deps } };
    };
    // (1) Preview 호출자(observe 라서 예전처럼 운영 URL 로 향함, 헤더 preview) → 운영 수신(enforce): 403, 처리에 진입하지 않음
    {
      resetRecordingTargetLogDedupe();
      const { a, receiver } = mkReceiver();
      const b = bridgeTo(receiver);
      const ok = await createRecordingTrigger({ env: { APP_ENV: "preview", URL: PROD, RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: b.fetchImpl, log: silent })(11);
      assert(ok === false && b.seen.length === 1 && b.seen[0].status === 403 && b.seen[0].body === "environment_mismatch", "E2E(1): Preview 호출자 → 운영 수신(enforce) = 403 environment_mismatch");
      assert(a.reached() === 0, "E2E(1): 거부된 요청은 DB(deps)에 접근하지 않음");
    }
    // (2) Production 호출자(enforce) → 운영 수신(enforce): 통과
    {
      resetRecordingTargetLogDedupe();
      const { a, receiver } = mkReceiver();
      const b = bridgeTo(receiver);
      const ok = await createRecordingTrigger({ env: { RECORDING_TARGET_GUARD: "enforce", APP_ENV: "production", URL: PROD, RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: b.fetchImpl, log: silent })(12);
      assert(ok === true && b.seen[0].status === 200 && a.reached() === 1, "E2E(2): Production 호출자 → 운영 수신(enforce) = 통과(처리 진입 1회)");
    }
    // (3) 환경 헤더를 모르는 구형 호출자(APP_ENV 없음 → 헤더 없음, 비밀값은 맞음) → 운영 수신(enforce): 403
    {
      resetRecordingTargetLogDedupe();
      const { a, receiver } = mkReceiver();
      const b = bridgeTo(receiver);
      const ok = await createRecordingTrigger({ env: { URL: PROD, RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: b.fetchImpl, log: silent })(13);
      assert(ok === false && b.seen[0].status === 403 && a.reached() === 0, "E2E(3): 헤더 없는 구형 호출자 → 운영 수신(enforce) = 403(전환 전 모든 호출자가 헤더를 보내야 함)");
      // 같은 호출자 → 수신이 observe 이면 예전처럼 통과(단계적 도입)
      const a2 = acceptingDeps();
      const b2 = bridgeTo({ secret: SECRET, check: readRecordingEnvCheck({ APP_ENV: "production" }, silent), deps: a2.deps });
      const ok2 = await createRecordingTrigger({ env: { URL: PROD, RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: b2.fetchImpl, log: silent })(13);
      assert(ok2 === true && a2.reached() === 1, "E2E(3): 같은 구형 호출자 → 운영 수신(observe) = 통과(관찰 단계에서는 호환)");
    }
    // 환경 헤더는 인증이 아니다: 비밀값을 가진 호출자가 production 이라고 적으면 통과한다(실제 방어선은 enforce 수신 + 환경별 서로 다른 비밀값).
    {
      const { a, receiver } = mkReceiver();
      const spoof = await handleProcessRecordingRequest(req({ [RECORDING_PROCESSING_SECRET_HEADER]: SECRET, [RECORDING_SOURCE_ENV_HEADER]: "production" }), receiver.secret, receiver.deps, receiver.check);
      assert(spoof.status === 200 && a.reached() === 1, "문서화된 한계: 비밀값을 아는 쪽이 헤더를 production 으로 쓰면 환경 검사는 통과한다(헤더는 인증이 아님)");
      const otherSecret = await handleProcessRecordingRequest(req({ [RECORDING_PROCESSING_SECRET_HEADER]: "another-env-secret-0123456789ab", [RECORDING_SOURCE_ENV_HEADER]: "production" }), receiver.secret, receiver.deps, receiver.check);
      assert(otherSecret.status === 401, "환경별로 비밀값이 다르면 헤더를 속여도 401(실제 방어선)");
    }
  }

  // ── (4) RECORDING_TARGET_GUARD 값: 허용 값·기본값·오타·빈 문자열 ──
  {
    const modeCases: [string | undefined, "observe" | "enforce", boolean][] = [
      [undefined, "observe", false],
      ["", "observe", false],
      ["   ", "observe", false],
      ["observe", "observe", false],
      ["OBSERVE", "observe", false],
      ["enforce", "enforce", false],
      [" Enforce ", "enforce", false],
      ["enforced", "observe", true],
      ["enforce1", "observe", true],
      ["enfroce", "observe", true],
      ["true", "observe", true],
      ["1", "observe", true],
      ["on", "observe", true],
      ["off", "observe", true],
    ];
    for (const [raw, mode, invalid] of modeCases) {
      const got = readGuardModeDetailed({ RECORDING_TARGET_GUARD: raw });
      assert(got.mode === mode && got.invalid === invalid, `guard 값 ${JSON.stringify(raw)} → ${mode}${invalid ? " + 오타 진단" : ""} (실제 ${JSON.stringify(got)})`);
    }
    // 오타는 observe 로 동작하되 사유 코드를 로그로 남긴다(값은 남기지 않는다). 빈 문자열·미설정은 로그가 없다.
    for (const [raw, expectLog] of [["enforced", true], ["", false], [undefined, false], ["observe", false], ["enforce", false]] as [string | undefined, boolean][]) {
      resetRecordingTargetLogDedupe();
      const entries: { message: string; reason: string }[] = [];
      const log = (message: string, d: { reason: string }) => entries.push({ message, reason: d.reason });
      selectRecordingSite({ RECORDING_TARGET_GUARD: raw, APP_ENV: "production", URL: PROD }, log);
      const cfg = entries.filter((e) => e.message === "recording-target-config" && e.reason === "guard_mode_invalid");
      assert(cfg.length === (expectLog ? 1 : 0), `guard 값 ${JSON.stringify(raw)}: 설정 오류 로그 ${expectLog ? "있음" : "없음"} (실제 ${cfg.length}건)`);
      assert(!JSON.stringify(entries).includes("enforced"), `guard 값 ${JSON.stringify(raw)}: 로그에 입력 값을 남기지 않음`);
    }
    // 오타여도 운영 트리거는 막히지 않고(fail-open = observe), 조용히 꺼지지도 않는다(로그)
    resetRecordingTargetLogDedupe();
    const logs: string[] = [];
    const typoSite = selectRecordingSite({ RECORDING_TARGET_GUARD: "enforced", APP_ENV: "production", URL: PROD }, (m, d) => logs.push(`${m} ${d.reason}`));
    assert(typoSite === PROD && logs.includes("recording-target-config guard_mode_invalid"), "guard 오타(enforced) + production: 운영 호출은 그대로 허용되고 진단 로그가 남는다");
    // 비어 있지 않은 오타인데 수신 쪽: 헤더가 없어도 observe 로 통과하고 진단 로그가 남는다
    resetRecordingTargetLogDedupe();
    const w = captureWarn();
    let typoCheck;
    try {
      typoCheck = readRecordingEnvCheck({ RECORDING_TARGET_GUARD: "enforced", APP_ENV: "production" });
    } finally {
      w.restore();
    }
    assert(typoCheck.mode === "observe" && w.lines.some((l) => l.includes("recording-target-config") && l.includes("guard_mode_invalid")) && !w.lines.join("").includes("enforced"), "수신 쪽 readRecordingEnvCheck: 오타 → observe + 진단 로그(값 없음)");
    assert(JSON.stringify(diagnoseRecordingConfig({ RECORDING_TARGET_GUARD: "enforced" })) === JSON.stringify(["guard_mode_invalid"]) && diagnoseRecordingConfig({ RECORDING_TARGET_GUARD: "" }).length === 0, "diagnoseRecordingConfig: 오타만 보고, 빈 문자열은 보고하지 않음");
  }

  // ── (5) 끝 점(FQDN)·사용자 정의 도메인·SITE_NAME 기본 도메인 ──
  {
    const eq = (raw: string) => {
      const r = parseHttpsOrigin(raw);
      return r.ok ? r.origin : `ERR:${r.reason}`;
    };
    assert(eq("https://prod.example.com.") === PROD && eq("https://PROD.example.com.:443/") === PROD && eq("https://prod.example.com..") === PROD, "끝 점 정규화: prod.example.com. / 대문자·기본 포트 / 점 여러 개 → 같은 origin");
    assert(eq("https://prod.example.com.:8443") === "https://prod.example.com:8443" && eq("https://prod.example.com:8443") !== PROD, "끝 점 정규화는 포트를 건드리지 않음(포트가 다르면 다른 origin)");
    for (const other of ["https://prod.example.com.evil.com", "https://xprod.example.com", "https://prod.example.org", "https://prod.example.com.evil.com.", "https://sub.prod.example.com"]) {
      assert(eq(other) !== PROD, `다른 호스트는 같은 origin 으로 취급하지 않음: ${other}`);
    }
    assert(eq("https://.") .startsWith("ERR:") && eq("https://..").startsWith("ERR:"), "호스트가 점뿐이면 거부");
    // 끝 점으로 운영 호스트를 가리켜도 비운영은 거부(리뷰에서 재현했던 우회)
    for (const spelled of ["https://prod.example.com.", "https://PROD.EXAMPLE.COM./", "https://prod.example.com.:443"]) {
      const r = resolveRecordingSite({ APP_ENV: "preview", URL: PROD, RECORDING_SITE_URL: spelled });
      assert(!r.ok && r.reason === "production_origin_from_non_production", `preview → ${spelled}: 운영 origin 거부`);
    }
    // 운영 쪽 설정(URL/PRODUCTION_SITE_ORIGIN)에 끝 점이 있어도 같은 origin 으로 비교
    const r2 = resolveRecordingSite({ APP_ENV: "preview", URL: "https://prod.example.com.", RECORDING_SITE_URL: PROD });
    assert(!r2.ok && r2.reason === "production_origin_from_non_production", "URL 에 끝 점이 있어도 같은 origin 으로 비교");
    // 사용자 정의 도메인: URL=사용자 정의 도메인(운영 메인), 별칭=www/기본 도메인
    const custom: EnvLike = { URL: "https://www.hifive.example", PRODUCTION_SITE_ORIGIN: "https://hifive.example, https://site-name.netlify.app" };
    assert(resolveRecordingSite({ ...custom, APP_ENV: "production", RECORDING_SITE_URL: "https://hifive.example" }).ok === true, "사용자 정의 도메인: production → 별칭(apex) 허용");
    for (const t of ["https://www.hifive.example", "https://hifive.example", "https://site-name.netlify.app"]) {
      const r = resolveRecordingSite({ ...custom, APP_ENV: "preview", RECORDING_SITE_URL: t });
      assert(!r.ok && r.reason === "production_origin_from_non_production", `사용자 정의 도메인: preview → ${t} 거부`);
    }
    assert(resolveRecordingSite({ ...custom, APP_ENV: "preview", RECORDING_SITE_URL: "https://deploy-preview-9--site-name.netlify.app" }).ok === true, "preview 자기 주소(deploy-preview-9--site-name.netlify.app)는 허용");
    // SITE_NAME 기반 기본 도메인: PRODUCTION_SITE_ORIGIN 에 없어도 운영 별칭으로 인식
    const siteName: EnvLike = { URL: "https://www.hifive.example", SITE_NAME: "site-name" };
    const sn = resolveRecordingSite({ ...siteName, APP_ENV: "preview", RECORDING_SITE_URL: "https://site-name.netlify.app" });
    assert(!sn.ok && sn.reason === "production_origin_from_non_production", "SITE_NAME: preview → https://<SITE_NAME>.netlify.app 거부(운영 기본 도메인)");
    assert(resolveRecordingSite({ ...siteName, APP_ENV: "preview", RECORDING_SITE_URL: "https://SITE-NAME.netlify.app." }).ok === false, "SITE_NAME: 대문자·끝 점으로 써도 거부");
    assert(resolveRecordingSite({ ...siteName, APP_ENV: "production", RECORDING_SITE_URL: "https://site-name.netlify.app" }).ok === true, "SITE_NAME: production 은 자기 기본 도메인을 가리킬 수 있음");
    assert(resolveRecordingSite({ ...siteName, SITE_NAME: " Site-Name ", APP_ENV: "preview", RECORDING_SITE_URL: "https://site-name.netlify.app" }).ok === false, "SITE_NAME: 공백·대문자 정규화");
    assert(resolveRecordingSite({ ...siteName, APP_ENV: "preview", RECORDING_SITE_URL: "https://other-site.netlify.app" }).ok === true, "SITE_NAME: 다른 사이트의 기본 도메인은 허용(운영 별칭이 아님)");
    assert(resolveRecordingSite({ APP_ENV: "preview", RECORDING_SITE_URL: "https://site-name.netlify.app" }).ok === true, "SITE_NAME 이 없으면 기본 도메인 별칭을 만들지 않음(기존 동작)");
    // 유효하지 않은 SITE_NAME 은 별칭으로 쓰지 않고 진단만 남긴다
    for (const bad of ["bad name", "a.b", "-x", "x-", "a/b", "x".repeat(64), "한글"]) {
      assert(resolveRecordingSite({ ...siteName, SITE_NAME: bad, APP_ENV: "preview", RECORDING_SITE_URL: "https://site-name.netlify.app" }).ok === true, `SITE_NAME ${JSON.stringify(bad)}: 별칭을 만들지 않음`);
      assert(diagnoseRecordingConfig({ SITE_NAME: bad }).includes("site_name_invalid"), `SITE_NAME ${JSON.stringify(bad)}: site_name_invalid 진단`);
    }
    assert(diagnoseRecordingConfig({ SITE_NAME: "site-name" }).length === 0 && diagnoseRecordingConfig({}).length === 0, "정상/미설정 SITE_NAME 은 진단 없음");
  }

  // ── (6) 잘못된 PRODUCTION_SITE_ORIGIN 은 조용히 무시되지 않는다 ──
  {
    const target = "https://deploy-preview-9--site.example.com";
    const base: EnvLike = { URL: PROD, RECORDING_SITE_URL: target };
    for (const bad of ["garbage", "http://www.example.com", "https://www.example.com/path", "https://u:p@www.example.com", "https://www.example.com?x=1"]) {
      const r = resolveRecordingSite({ ...base, APP_ENV: "preview", PRODUCTION_SITE_ORIGIN: bad });
      assert(!r.ok && r.reason === "production_origin_config_invalid", `비운영 + PRODUCTION_SITE_ORIGIN=${JSON.stringify(bad)} → 안전하게 거부(production_origin_config_invalid)`);
      const rd = resolveRecordingSite({ ...base, APP_ENV: "development", PRODUCTION_SITE_ORIGIN: bad });
      assert(!rd.ok && rd.reason === "production_origin_config_invalid", `development + ${JSON.stringify(bad)} → 거부`);
      assert(diagnoseRecordingConfig({ PRODUCTION_SITE_ORIGIN: bad }).includes("production_site_origin_entry_invalid"), `PRODUCTION_SITE_ORIGIN=${JSON.stringify(bad)}: 진단 코드`);
    }
    const mixed = resolveRecordingSite({ ...base, APP_ENV: "preview", PRODUCTION_SITE_ORIGIN: "https://ok.example.com, nonsense" });
    assert(!mixed.ok && mixed.reason === "production_origin_config_invalid", "유효 항목 + 잘못된 항목 혼합 → 거부(잘못된 항목을 건너뛰고 통과시키지 않음)");
    // 빈 항목(끝 쉼표·공백)은 잘못된 것이 아니다
    for (const ok of ["https://ok.example.com,", " https://ok.example.com , ", ",", ""]) {
      const r = resolveRecordingSite({ ...base, APP_ENV: "preview", PRODUCTION_SITE_ORIGIN: ok });
      assert(r.ok === true && diagnoseRecordingConfig({ PRODUCTION_SITE_ORIGIN: ok }).length === 0, `PRODUCTION_SITE_ORIGIN=${JSON.stringify(ok)}: 빈 항목은 허용`);
    }
    // 운영은 설정 오타로 막지 않는다(진단 로그만) — 운영 origin 목록은 거부 사유가 아니라 "허용 범위"이기 때문
    const prodOk = resolveRecordingSite({ APP_ENV: "production", URL: PROD, PRODUCTION_SITE_ORIGIN: "nonsense" });
    assert(prodOk.ok === true && prodOk.origin === PROD, "production + 잘못된 PRODUCTION_SITE_ORIGIN: 운영 트리거는 막지 않음(진단 로그는 남김)");
    // 로그: enforce 에서는 거부 사유가, 어느 모드든 설정 진단이 로그로 드러난다
    resetRecordingTargetLogDedupe();
    const msgs: string[] = [];
    const log = (m: string, d: { reason: string; mode: string }) => msgs.push(`${m}|${d.reason}|${d.mode}`);
    const denied = selectRecordingSite({ ...base, APP_ENV: "preview", RECORDING_TARGET_GUARD: "enforce", PRODUCTION_SITE_ORIGIN: "nonsense" }, log);
    assert(denied === null, "enforce + preview + 잘못된 PRODUCTION_SITE_ORIGIN → 호출하지 않음");
    assert(msgs.includes("recording-target-denied|production_origin_config_invalid|enforce") && msgs.includes("recording-target-config|production_site_origin_entry_invalid|enforce"), "enforce: 거부 사유 + 설정 진단 로그");
    resetRecordingTargetLogDedupe();
    msgs.length = 0;
    const observed = selectRecordingSite({ ...base, URL: PROD, APP_ENV: "preview", PRODUCTION_SITE_ORIGIN: "nonsense" }, log);
    assert(observed === PROD && msgs.includes("recording-target-config|production_site_origin_entry_invalid|observe") && msgs.includes("recording-target-observe|production_origin_config_invalid|observe"), "observe: 동작은 예전 그대로 + 거부했을 사유·설정 진단이 로그에 드러남");
    assert(!msgs.join("").includes("nonsense"), "로그에 잘못된 입력 값을 남기지 않음");
  }

  // ── (7) 리다이렉트: 따라가지 않고 비밀값 헤더를 다른 origin 으로 보내지 않는다(로컬 loopback 서버) ──
  {
    const hits: { server: string; method?: string; secret: string | null; env: string | null }[] = [];
    const B = await listen((rq, rs) => {
      hits.push({ server: "B", method: rq.method, secret: (rq.headers["x-recording-processing-secret"] as string) ?? null, env: (rq.headers["x-recording-source-env"] as string) ?? null });
      rs.statusCode = 202;
      rs.end();
    });
    const A = await listen((rq, rs) => {
      hits.push({ server: "A", method: rq.method, secret: (rq.headers["x-recording-processing-secret"] as string) ?? null, env: (rq.headers["x-recording-source-env"] as string) ?? null });
      const code = Number(new URL(rq.url ?? "/", "http://x").searchParams.get("code") ?? 0);
      if (rq.url?.includes("/ok")) {
        rs.statusCode = 202;
        return void rs.end();
      }
      rs.statusCode = code || 307;
      rs.setHeader("location", `${B.origin}/target`);
      rs.end();
    });
    try {
      // 로컬 loopback 은 http 이므로 observe(기본, 예전 값 그대로)로 호출한다 — 리다이렉트 처리는 모드와 무관하다.
      for (const code of [301, 302, 303, 307, 308]) {
        hits.length = 0;
        resetRecordingTargetLogDedupe();
        const logs: string[] = [];
        const env: EnvLike = { APP_ENV: "production", URL: `${A.origin}`, RECORDING_PROCESSING_SECRET: SECRET };
        // 경로에 code 를 싣기 위해 한 번만 감싸서 호출(대상 경로는 /.netlify/functions/... 뒤에 쿼리를 붙일 수 없으므로 fetch 를 감싼다)
        const wrapped = ((url: string | URL | Request, init?: RequestInit) => fetch(`${String(url)}?code=${code}`, init)) as typeof fetch;
        const ok = await createRecordingTrigger({ env, fetchImpl: wrapped, log: (m, d) => logs.push(`${m}|${d.reason}`) })(7);
        assert(ok === false, `redirect ${code}: 성공으로 처리하지 않음(false)`);
        assert(hits.filter((h) => h.server === "B").length === 0, `redirect ${code}: 다른 origin(B)으로 요청이 가지 않음 → 비밀값 헤더 미전달`);
        const a = hits.filter((h) => h.server === "A");
        assert(a.length === 1 && a[0].method === "POST" && a[0].secret === SECRET && a[0].env === "production", `redirect ${code}: 지정한 주소(A)에는 정확히 1회 POST + 헤더`);
        const redirectLogs = logs.filter((l) => l.startsWith("recording-trigger-redirect"));
        assert(redirectLogs.length === 1 && redirectLogs[0] === "recording-trigger-redirect|redirect_not_followed", `redirect ${code}: 사유 코드만 로그(${JSON.stringify(logs)})`);
        assert(!logs.join("").includes("127.0.0.1") && !logs.join("").includes(SECRET), `redirect ${code}: 로그에 목적지·비밀값 없음`);
      }
      // 정상 2xx 는 그대로 true, 기존 계약(비 2xx → false)도 유지
      hits.length = 0;
      const okWrapped = ((url: string | URL | Request, init?: RequestInit) => fetch(`${String(url)}/ok`, init)) as typeof fetch;
      assert((await createRecordingTrigger({ env: { APP_ENV: "production", URL: A.origin, RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: okWrapped, log: silent })(7)) === true, "redirect 아닌 202 응답 → true(기존 계약)");
    } finally {
      await closeServer(A.server);
      await closeServer(B.server);
    }
    // 스텁: redirect 옵션이 manual 로 전달되고, 3xx 스텁 응답은 실패
    for (const code of [301, 307]) {
      resetRecordingTargetLogDedupe();
      const calls: Call[] = [];
      const f = (async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(null, { status: code, headers: { location: "https://elsewhere.example/x" } });
      }) as typeof fetch;
      const ok = await createRecordingTrigger({ env: { RECORDING_TARGET_GUARD: "enforce", APP_ENV: "production", URL: PROD, RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: f, log: silent })(1);
      assert(ok === false && calls.length === 1 && calls[0].init.redirect === "manual", `stub ${code}: redirect:"manual" 로 호출하고 3xx 는 false`);
    }
    {
      const s = stubFetch(202);
      await createRecordingTrigger({ env: { RECORDING_TARGET_GUARD: "enforce", APP_ENV: "production", URL: PROD, RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: s.fetchImpl, log: silent })(1);
      assert(s.calls[0].init.redirect === "manual" && s.calls[0].init.signal instanceof AbortSignal, "정상 호출도 redirect:manual + 5초 타임아웃 신호 유지");
    }
  }

  // ── (8) 실제 Netlify 함수 모듈을 통과하는 환경 검사 ──
  {
    const keys = ["DATABASE_URL", "RECORDING_PROCESSING_SECRET", "APP_ENV", "RECORDING_TARGET_GUARD"] as const;
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    const w = captureWarn();
    try {
      // DB 연결은 만들지 않는다(이 요청들은 모두 DB 접근 전에 거절된다). 로컬 더미 주소로 모듈 로드만 가능하게 한다.
      process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://dummy:dummy@127.0.0.1:1/dummy";
      process.env.RECORDING_PROCESSING_SECRET = SECRET;
      const mod = await import("../netlify/functions/process-recording-background");
      const call = (headers: Record<string, string>) => mod.default(req({ ...headers }));
      const withSecret = { [RECORDING_PROCESSING_SECRET_HEADER]: SECRET };

      process.env.APP_ENV = "production";
      process.env.RECORDING_TARGET_GUARD = "enforce";
      resetRecordingTargetLogDedupe();
      let res = await call({ ...withSecret, [RECORDING_SOURCE_ENV_HEADER]: "preview" });
      assert(res.status === 403 && (await res.text()) === "environment_mismatch", "함수 모듈(enforce, production): preview 헤더 → 403");
      res = await call({ ...withSecret });
      assert(res.status === 403, "함수 모듈(enforce, production): 헤더 없음 → 403");
      res = await call({ [RECORDING_PROCESSING_SECRET_HEADER]: "wrong", [RECORDING_SOURCE_ENV_HEADER]: "production" });
      assert(res.status === 401, "함수 모듈: 틀린 비밀값 → 401(환경 검사보다 먼저)");
      delete process.env.APP_ENV;
      res = await call({ ...withSecret, [RECORDING_SOURCE_ENV_HEADER]: "production" });
      assert(res.status === 503 && (await res.text()) === "environment_not_configured", "함수 모듈(enforce, APP_ENV 없음): 503 environment_not_configured");
      // 환경변수는 요청마다 읽는다(모듈 로드 시점에 굳지 않음): enforce 를 끄고 APP_ENV 가 없으면 observe — 거부하지 않고 처리에 진입하려 한다
      // (진입하면 DB 를 부르므로 여기서는 호출하지 않는다. 대신 거부되지 않는 모드 판정만 readRecordingEnvCheck 로 확인.)
      process.env.RECORDING_TARGET_GUARD = "observe";
      assert(readRecordingEnvCheck(process.env, silent).mode === "observe", "함수 모듈 환경 읽기: RECORDING_TARGET_GUARD 변경이 반영됨(요청마다 읽음)");
    } finally {
      w.restore();
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
    assert(w.lines.every((l) => !l.includes(SECRET)), "함수 모듈 경유 로그에 비밀값 없음");
  }

  // ── (9) 기본 로그 경로(log 옵션 없음)가 URL·비밀값을 노출하지 않는다 ──
  {
    resetRecordingTargetLogDedupe();
    const w = captureWarn();
    try {
      const s = stubFetch(202);
      // observe + preview 에서 운영 URL 폴백 + guard 오타 + 잘못된 별칭 + 잘못된 SITE_NAME
      await createRecordingTrigger({
        env: { RECORDING_TARGET_GUARD: "enforced", APP_ENV: "preview", URL: PROD, PRODUCTION_SITE_ORIGIN: "nonsense", SITE_NAME: "bad name", RECORDING_PROCESSING_SECRET: SECRET },
        fetchImpl: s.fetchImpl,
      })(1);
      // enforce 거부
      await createRecordingTrigger({ env: { RECORDING_TARGET_GUARD: "enforce", APP_ENV: "preview", URL: PROD, RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: s.fetchImpl })(1);
      // 리다이렉트
      const redirecting = (async () => new Response(null, { status: 307, headers: { location: "https://elsewhere.example/x" } })) as unknown as typeof fetch;
      await createRecordingTrigger({ env: { RECORDING_TARGET_GUARD: "enforce", APP_ENV: "production", URL: PROD, RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: redirecting })(1);
    } finally {
      w.restore();
    }
    const text = w.lines.join("\n");
    for (const code of ["site_url_unset", "guard_mode_invalid", "production_site_origin_entry_invalid", "site_name_invalid", "redirect_not_followed", "recording-target-observe", "recording-target-denied", "recording-target-config"]) {
      assert(text.includes(code), `기본 로그 경로: ${code} 기록됨`);
    }
    assert(!text.includes(SECRET) && !text.includes("example.com") && !text.includes("elsewhere") && !text.includes("https://") && !text.includes("nonsense") && !text.includes("bad name") && !text.includes("enforced"), "기본 로그 경로: 비밀값·URL·입력 값이 로그에 없음");
    assert(w.lines.every((l) => /^recording-(target|trigger)-[a-z]+ \{"reason":"[a-z_]+","mode":"(observe|enforce)"\}$/.test(l)), "기본 로그 형식: 메시지 + {reason, mode} JSON 한 줄뿐");
  }

  // ── (10) 설정 오류로 처리 요청이 거절될 때: 상태 유지 · 재시도 · 24h 한계 · 복구 ──
  {
    type Rec = { id: number; status: "TRANSCRIBED" | "TEACHER_SPEAKER_CONFIRMED" | "ANALYSIS_FAILED"; updatedAt: Date };
    const now = new Date("2026-01-10T12:00:00Z");
    const mkDb = (status: Rec["status"], ageMs: number) => {
      const rec: Rec = { id: 1, status, updatedAt: new Date(now.getTime() - ageMs) };
      const exhaustedCalls: number[] = [];
      const deps = (trigger: (id: number) => Promise<boolean>): RecoveryDeps => ({
        async findStuckTranscribed(olderThan) {
          return (rec.status === "TRANSCRIBED" || rec.status === "TEACHER_SPEAKER_CONFIRMED") && rec.updatedAt < olderThan ? [{ id: rec.id, updatedAt: rec.updatedAt }] : [];
        },
        async markRecoveryExhausted(id) {
          exhaustedCalls.push(id);
          if (rec.status === "TRANSCRIBED" || rec.status === "TEACHER_SPEAKER_CONFIRMED") rec.status = "ANALYSIS_FAILED";
        },
        triggerProcessing: trigger,
        async findStuckAnalyzing() {
          return [];
        },
        async markAnalysisAbandoned() {
          return false;
        },
      });
      return { rec, exhaustedCalls, deps };
    };
    const HOUR = 3600 * 1000;
    const goodReceiver = () => acceptingDeps();
    const productionReceiver = (a: ReturnType<typeof acceptingDeps>) => ({ secret: SECRET, check: readRecordingEnvCheck({ RECORDING_TARGET_GUARD: "enforce", APP_ENV: "production" }, silent), deps: a.deps });

    for (const startStatus of ["TRANSCRIBED", "TEACHER_SPEAKER_CONFIRMED"] as const) {
      // 보내는 쪽 설정 오류(enforce + APP_ENV 없음 → 호출 자체를 하지 않음)
      {
        resetRecordingTargetLogDedupe();
        const db = mkDb(startStatus, 30 * 60 * 1000);
        const s = stubFetch();
        const badSender = createRecordingTrigger({ env: { RECORDING_TARGET_GUARD: "enforce", URL: PROD, RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: s.fetchImpl, log: silent });
        const report = await recoverStuckTranscribedRecordings(db.deps(badSender), now);
        assert(report.triggerFailed.join() === "1" && report.retriggered.length === 0 && db.rec.status === startStatus && db.exhaustedCalls.length === 0 && s.calls.length === 0, `${startStatus}: 보내는 쪽 설정 오류 → 호출 0회, 레코드 상태 유지, 실패로 확정하지 않음, 다음 주기에 재시도`);
        // 설정을 고친 뒤 다음 주기: 다시 시도되어 수락됨 → 상태는 유지된 채 처리 진입
        const a = goodReceiver();
        const fixed = createRecordingTrigger({ env: { RECORDING_TARGET_GUARD: "enforce", APP_ENV: "production", URL: PROD, RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: bridgeTo(productionReceiver(a)).fetchImpl, log: silent });
        const report2 = await recoverStuckTranscribedRecordings(db.deps(fixed), now);
        assert(report2.retriggered.join() === "1" && a.reached() === 1, `${startStatus}: 설정을 고친 뒤 다음 복구 주기에 정상 처리 진입(재시도 성공)`);
      }
      // 받는 쪽 거절(403 environment_mismatch) → 같은 효과
      {
        resetRecordingTargetLogDedupe();
        const db = mkDb(startStatus, 30 * 60 * 1000);
        const a = goodReceiver();
        const b = bridgeTo(productionReceiver(a));
        const previewSender = createRecordingTrigger({ env: { APP_ENV: "preview", URL: PROD, RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: b.fetchImpl, log: silent });
        const report = await recoverStuckTranscribedRecordings(db.deps(previewSender), now);
        assert(report.triggerFailed.join() === "1" && b.seen[0].status === 403 && db.rec.status === startStatus && db.exhaustedCalls.length === 0 && a.reached() === 0, `${startStatus}: 수신 쪽 403 거절 → 레코드 상태 유지, 처리 미진입, 재시도 대상으로 남음`);
      }
      // 24시간이 지나도록 고치지 못하면 복구가 포기하고 ANALYSIS_FAILED 로 확정한다(문서화된 한계)
      {
        resetRecordingTargetLogDedupe();
        const db = mkDb(startStatus, 25 * HOUR);
        const badSender = createRecordingTrigger({ env: { RECORDING_TARGET_GUARD: "enforce", URL: PROD, RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: stubFetch().fetchImpl, log: silent });
        const report = await recoverStuckTranscribedRecordings(db.deps(badSender), now);
        assert(report.exhausted.join() === "1" && db.rec.status === "ANALYSIS_FAILED", `${startStatus}: 24시간 이상 처리 요청이 거절되면 ANALYSIS_FAILED 로 확정(그 전에 설정을 고쳐야 함)`);
      }
    }
    // 강사 화자 확인 직후 트리거가 거절되면: 확인은 저장된 채 triggered=false, 같은 선택을 다시 누르면 재트리거
    {
      let status: string = "NEEDS_SPEAKER_CONFIRMATION";
      const utter = [{ speaker: "A", start: 0, end: 1000, text: "hello there my friend" }, { speaker: "B", start: 1000, end: 2000, text: "hi teacher how are you" }];
      const mkConfirm = (trigger: (id: number) => Promise<boolean>): ConfirmDeps => ({
        async findSession() {
          return { sessionTeacherId: 5, recording: { id: 1, processingStatus: status, confirmedTeacherSpeaker: status === "TEACHER_SPEAKER_CONFIRMED" ? "A" : null, utterances: utter } };
        },
        async markConfirmed() {
          if (status !== "NEEDS_SPEAKER_CONFIRMATION") return false;
          status = "TEACHER_SPEAKER_CONFIRMED";
          return true;
        },
        triggerProcessing: trigger,
      });
      resetRecordingTargetLogDedupe();
      const badSender = createRecordingTrigger({ env: { RECORDING_TARGET_GUARD: "enforce", APP_ENV: "preview", URL: PROD, RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: stubFetch().fetchImpl, log: silent });
      const first = await confirmTeacherSpeaker(mkConfirm(badSender), { teacherId: 5, sessionId: 1, label: "A" });
      assert(first.ok && first.state === "confirmed" && first.triggered === false && status === "TEACHER_SPEAKER_CONFIRMED", "강사 화자 확인: 처리 요청이 거절돼도 확인은 저장되고 triggered=false(상태 TEACHER_SPEAKER_CONFIRMED 유지)");
      const a = goodReceiver();
      const okSender = createRecordingTrigger({ env: { RECORDING_TARGET_GUARD: "enforce", APP_ENV: "production", URL: PROD, RECORDING_PROCESSING_SECRET: SECRET }, fetchImpl: bridgeTo(productionReceiver(a)).fetchImpl, log: silent });
      const again = await confirmTeacherSpeaker(mkConfirm(okSender), { teacherId: 5, sessionId: 1, label: "A" });
      assert(again.ok && again.state === "already_confirmed" && again.triggered === true && a.reached() === 1, "강사가 같은 화자를 다시 확인하면 재트리거되어 처리 진입(수동 복구 경로)");
    }
    // 코드 사실: 예약 복구 함수는 TEACHER_SPEAKER_CONFIRMED 도 대상으로 포함한다(리뷰 전제와 다름 — 문서에 사실대로 기록)
    const rec = fs.readFileSync(path.join(__dirname, "..", "netlify/functions/recover-transcribed-recordings.ts"), "utf8");
    assert(/processingStatus: \{ in: \["TRANSCRIBED", "TEACHER_SPEAKER_CONFIRMED"\] \}/.test(rec), "정적: recover-transcribed-recordings 는 TRANSCRIBED 와 TEACHER_SPEAKER_CONFIRMED 를 함께 재트리거 대상으로 삼음");
  }

  // ── (F7) envCheck 는 필수 인자: 시그니처에서 ? 가 없어야 하고, 함수 진입점이 4번째 인자로 넘긴다 ──
  {
    const src = fs.readFileSync(path.join(__dirname, "..", "src/lib/recordingProcessing.ts"), "utf8");
    const sig = /export async function handleProcessRecordingRequest\(([\s\S]*?)\): Promise<Response>/.exec(src);
    assert(!!sig && /envCheck: RecordingEnvCheck,?\s*$/.test(sig[1].trim()) && !/envCheck\?/.test(sig[1]), "정적: handleProcessRecordingRequest 의 envCheck 는 필수(선택 인자 아님)");
    assert(!/if \(envCheck\)/.test(src), "정적: envCheck 유무에 따라 검사를 건너뛰는 분기가 없음");
  }
}

Promise.all([triggerTests, handlerTests])
  .then(() => reviewFixTests())
  .then(() => {
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
