// 녹음 처리 경로(process-recording-background 호출, AssemblyAI 웹훅 주소)가 "어느 사이트"를 가리키는지 정하는 유일한 곳.
//
// 왜 필요한가: Netlify 함수 런타임에서 읽을 수 있는 제공 변수는 URL(사이트의 메인=운영 주소)뿐이고 DEPLOY_URL은 없다.
// 그래서 예전 코드(URL ?? DEPLOY_URL)는 Deploy Preview에서도 운영 사이트의 처리 함수를 가리킬 수 있었다(미리보기와 운영이
// 같은 DB·같은 비밀값을 공유하던 구성에서는 데이터 노출은 없지만 운영 AI 키 사용과 환경 간 결합이 생긴다).
// 이 모듈은 process.env.URL / DEPLOY_URL 을 읽는 코드베이스 안의 유일한 위치다(정적 테스트가 강제한다).
//
// 규칙(resolveRecordingSite — 순수 함수, 환경 객체를 주입받는다):
//  · APP_ENV(production|preview|development)가 있어야 한다.
//  · RECORDING_SITE_URL 이 있으면 그 값을, 없으면 production 에서만 URL 을 쓴다. 비운영에서는 URL/DEPLOY_URL 로 폴백하지 않는다.
//  · 값은 https 의 순수 origin 이어야 한다(경로·쿼리·해시·사용자 정보 금지, 끝의 "/" 하나만 허용). 호스트 끝의 "."(FQDN 표기)는 없는 것으로 정규화한다.
//  · 운영 origin 집합 = URL 의 origin + https://<SITE_NAME>.netlify.app(기본 도메인) + PRODUCTION_SITE_ORIGIN(쉼표 목록).
//    비운영이 이 집합의 origin 을 가리키면 거부한다. 비운영에서 PRODUCTION_SITE_ORIGIN 에 해석할 수 없는 항목이 있으면
//    "운영 origin 을 다 알 수 없다"는 뜻이므로 거부한다(production_origin_config_invalid) — 조용히 건너뛰지 않는다.
//  · production 이 이 집합 밖의 origin 을 가리키면(RECORDING_SITE_URL 오설정) 거부한다.
//
// 이 규칙이 막는 것은 "설정 실수로 비운영이 운영 처리 함수를 부르는 것"이다. APP_ENV 자체를 속이는(예: Preview 에도 APP_ENV=production 이
// 적용되는) 구성은 이 코드로 막을 수 없다 — APP_ENV 는 배포가 스스로 말하는 값이라 유일한 신뢰 기준이다. 운영 변수의 Scope 는 문서
// (admin/docs/recording-environment-isolation.md)의 점검표를 따른다.
//
// 단계적 도입(RECORDING_TARGET_GUARD — 허용 값은 "observe"(기본)와 "enforce" 둘뿐):
//  · 미설정·빈 문자열·공백 → observe(기본값, 진단 로그 없음).
//  · "observe"/"enforce"(대소문자·앞뒤 공백 무시) → 해당 모드.
//  · 그 밖의 값(예: "enforced" 오타) → observe 로 동작하되 "guard_mode_invalid" 사유를 로그로 남긴다(값 자체는 남기지 않는다).
//    오타가 운영 트리거를 막지 않는 쪽(fail-open)을 택한 것이며, 이 정책(오타 시 막을지)은 오너 결정 사항이다.
// observe — 위 규칙으로 "거부했을 상황"을 사유만 로그로 남기고 동작은 예전 그대로. enforce — 실제로 거부한다.
// APP_ENV 를 빠뜨린 채 enforce 로 가면 운영 트리거가 거부되므로, 운영에서 observe 거부 로그가 0건임을 확인한 뒤 전환한다.
// 로그에는 사유 코드만 남기고 URL·비밀값은 절대 남기지 않는다.

export type EnvLike = Record<string, string | undefined>;
export type AppEnv = "production" | "preview" | "development";
export type GuardMode = "observe" | "enforce";

export type RecordingSiteDenyReason =
  | "app_env_unset"
  | "app_env_invalid"
  | "site_url_unset"
  | "site_url_invalid"
  | "site_url_not_https"
  | "site_url_has_credentials"
  | "site_url_not_origin"
  | "production_target_mismatch"
  | "production_origin_from_non_production"
  | "production_origin_config_invalid";

export type RecordingSiteResult = { ok: true; origin: string; appEnv: AppEnv } | { ok: false; reason: RecordingSiteDenyReason };

const APP_ENVS: readonly AppEnv[] = ["production", "preview", "development"];

export function parseAppEnv(raw: string | undefined): { ok: true; appEnv: AppEnv } | { ok: false; reason: "app_env_unset" | "app_env_invalid" } {
  const v = raw?.trim().toLowerCase();
  if (!v) return { ok: false, reason: "app_env_unset" };
  return (APP_ENVS as readonly string[]).includes(v) ? { ok: true, appEnv: v as AppEnv } : { ok: false, reason: "app_env_invalid" };
}

/** RECORDING_TARGET_GUARD 해석. invalid=true 는 "비어 있지 않은데 observe/enforce 가 아닌 값"(오타) — 이때 mode 는 observe. */
export function readGuardModeDetailed(env: EnvLike): { mode: GuardMode; invalid: boolean } {
  const v = env.RECORDING_TARGET_GUARD?.trim().toLowerCase();
  if (!v) return { mode: "observe", invalid: false };
  if (v === "enforce") return { mode: "enforce", invalid: false };
  if (v === "observe") return { mode: "observe", invalid: false };
  return { mode: "observe", invalid: true };
}

export function readGuardMode(env: EnvLike): GuardMode {
  return readGuardModeDetailed(env).mode;
}

type OriginParse = { ok: true; origin: string } | { ok: false; reason: "site_url_invalid" | "site_url_not_https" | "site_url_has_credentials" | "site_url_not_origin" };

/** https 순수 origin 만 통과시킨다. 반환값은 정규화된 origin(소문자 호스트, 호스트 끝 "." 제거, 기본 포트 생략, 끝 슬래시 없음). */
export function parseHttpsOrigin(raw: string): OriginParse {
  const text = raw.trim();
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return { ok: false, reason: "site_url_invalid" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "site_url_not_https" };
  if (u.username || u.password) return { ok: false, reason: "site_url_has_credentials" };
  // 경로는 "/"(= 입력의 끝 슬래시)만, 쿼리·해시는 없어야 한다. new URL 은 경로가 비어 있어도 "/"로 정규화한다.
  if (u.pathname !== "/" || u.search || u.hash || /[?#]/.test(text)) return { ok: false, reason: "site_url_not_origin" };
  // "prod.example.com." 은 prod.example.com 과 같은 호스트지만 new URL 이 origin 에 점을 그대로 남긴다 → 같은 origin 으로 비교되도록 정규화.
  // (호스트 이름만 바꾸므로 서로 다른 호스트·다른 포트는 그대로 다른 origin 이다.)
  const host = u.hostname.replace(/\.+$/, "");
  if (!host) return { ok: false, reason: "site_url_invalid" };
  return { ok: true, origin: `https://${host}${u.port ? `:${u.port}` : ""}` };
}

const DNS_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** SITE_NAME(Netlify 가 함수 런타임에 제공하는 사이트 이름) → 기본 도메인 origin. 유효한 DNS 라벨이 아니면 null. */
function netlifyDefaultOrigin(env: EnvLike): { origin: string | null; invalid: boolean } {
  const name = env.SITE_NAME?.trim().toLowerCase();
  if (!name) return { origin: null, invalid: false };
  if (!DNS_LABEL.test(name)) return { origin: null, invalid: true };
  return { origin: `https://${name}.netlify.app`, invalid: false };
}

function productionOrigins(env: EnvLike): { set: Set<string>; invalidAliasCount: number } {
  const set = new Set<string>();
  let invalidAliasCount = 0;
  const add = (c: string | undefined, countInvalid: boolean) => {
    if (!c || !c.trim()) return;
    const p = parseHttpsOrigin(c);
    if (p.ok) set.add(p.origin);
    else if (countInvalid) invalidAliasCount++;
  };
  add(env.URL, false);
  for (const c of (env.PRODUCTION_SITE_ORIGIN ?? "").split(",")) add(c, true);
  const def = netlifyDefaultOrigin(env);
  if (def.origin) set.add(def.origin);
  return { set, invalidAliasCount };
}

export function resolveRecordingSite(env: EnvLike): RecordingSiteResult {
  const parsedEnv = parseAppEnv(env.APP_ENV);
  if (!parsedEnv.ok) return { ok: false, reason: parsedEnv.reason };
  const appEnv = parsedEnv.appEnv;

  const explicit = env.RECORDING_SITE_URL?.trim();
  let raw: string | undefined;
  if (explicit) raw = explicit;
  else if (appEnv === "production") raw = env.URL?.trim() || undefined;
  if (!raw) return { ok: false, reason: "site_url_unset" };

  const parsed = parseHttpsOrigin(raw);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const prod = productionOrigins(env);
  if (appEnv === "production") {
    // 운영은 자기 자신(운영 origin)만 가리킬 수 있다. 기준이 되는 운영 origin 이 하나도 없으면 명시값을 그대로 쓴다.
    // (운영에서 PRODUCTION_SITE_ORIGIN 의 잘못된 항목은 거부 사유로 쓰지 않는다 — 운영 트리거를 설정 오타로 막지 않기 위해. 진단 로그는 남긴다.)
    if (prod.set.size > 0 && !prod.set.has(parsed.origin)) return { ok: false, reason: "production_target_mismatch" };
  } else {
    if (prod.set.has(parsed.origin)) return { ok: false, reason: "production_origin_from_non_production" };
    // 운영 origin 목록을 해석할 수 없는 항목이 있으면, 이 origin 이 운영의 별칭이 아니라고 단정할 수 없다 → 안전하게 거부.
    if (prod.invalidAliasCount > 0) return { ok: false, reason: "production_origin_config_invalid" };
  }
  return { ok: true, origin: parsed.origin, appEnv };
}

/** 설정 자체의 문제(값은 남기지 않고 코드만). 모드와 무관하게 로그로만 드러난다. */
export type RecordingConfigIssue = "guard_mode_invalid" | "production_site_origin_entry_invalid" | "site_name_invalid";

export function diagnoseRecordingConfig(env: EnvLike): RecordingConfigIssue[] {
  const issues: RecordingConfigIssue[] = [];
  if (readGuardModeDetailed(env).invalid) issues.push("guard_mode_invalid");
  if (productionOrigins(env).invalidAliasCount > 0) issues.push("production_site_origin_entry_invalid");
  if (netlifyDefaultOrigin(env).invalid) issues.push("site_name_invalid");
  return issues;
}

/** observe 모드에서 예전 동작을 그대로 재현하기 위한 값 — 코드베이스에서 URL/DEPLOY_URL 을 읽는 유일한 자리(이 파일). */
export function legacyRecordingSiteUrl(env: EnvLike): string | undefined {
  return env.URL ?? env.DEPLOY_URL;
}

// ───────────────────────── 로그(사유 코드만, 프로세스당 사유별 1회) ─────────────────────────
export type TargetLog = (message: string, detail: { reason: string; mode: GuardMode }) => void;
export const defaultTargetLog: TargetLog = (message, detail) => console.warn(message, JSON.stringify(detail));
const logged = new Set<string>();
/** 테스트에서만 쓴다. */
export function resetRecordingTargetLogDedupe() {
  logged.clear();
}
/** 같은 (message, reason) 은 프로세스(함수 인스턴스)당 한 번만 남긴다. 사유 코드와 모드만 기록한다. */
export function logTargetEventOnce(log: TargetLog, message: string, reason: string, mode: GuardMode) {
  const key = `${message}:${reason}`;
  if (logged.has(key)) return;
  logged.add(key);
  log(message, { reason, mode });
}
function logOnce(log: TargetLog, kind: "denied" | "observe", reason: string, mode: GuardMode) {
  logTargetEventOnce(log, kind === "denied" ? "recording-target-denied" : "recording-target-observe", reason, mode);
}
function logConfigIssues(env: EnvLike, log: TargetLog, mode: GuardMode) {
  for (const issue of diagnoseRecordingConfig(env)) logTargetEventOnce(log, "recording-target-config", issue, mode);
}

/**
 * 호출 쪽이 쓸 사이트 주소. null 이면 호출하지 않는다.
 * enforce: 규칙을 통과한 origin 만. observe: 항상 예전 값(URL ?? DEPLOY_URL 원문) — 규칙상 거부였다면 사유만 로그.
 * 설정 문제(RECORDING_TARGET_GUARD 오타, PRODUCTION_SITE_ORIGIN 의 잘못된 항목, SITE_NAME 형식)는 모드와 무관하게 사유 코드로 로그.
 */
export function selectRecordingSite(env: EnvLike, log: TargetLog = defaultTargetLog): string | null {
  const mode = readGuardMode(env);
  logConfigIssues(env, log, mode);
  const strict = resolveRecordingSite(env);
  if (mode === "enforce") {
    if (strict.ok) return strict.origin;
    logOnce(log, "denied", strict.reason, mode);
    return null;
  }
  if (!strict.ok) logOnce(log, "observe", strict.reason, mode);
  return legacyRecordingSiteUrl(env) ?? null;
}

// ───────────────────────── 처리 함수 쪽: 환경 헤더 검사 ─────────────────────────
//
// x-recording-source-env 는 "호출자가 자기 환경을 스스로 밝히는" 헤더다 — 인증이 아니라 설정 실수를 잡는 일관성 검사다.
// 비밀값(x-recording-processing-secret)을 가진 호출자는 이 헤더도 마음대로 쓸 수 있다. 실제 방어선은
//  (1) 수신 쪽(운영 처리 함수)이 enforce 로 헤더를 요구하고, (2) 환경(컨텍스트)마다 서로 다른 비밀값을 쓰는 것이다.
export interface RecordingEnvCheck {
  mode: GuardMode;
  /** 이 배포의 APP_ENV. 유효하지 않으면 null. */
  appEnv: AppEnv | null;
}

export function readRecordingEnvCheck(env: EnvLike, log: TargetLog = defaultTargetLog): RecordingEnvCheck {
  const parsed = parseAppEnv(env.APP_ENV);
  const { mode, invalid } = readGuardModeDetailed(env);
  if (invalid) logTargetEventOnce(log, "recording-target-config", "guard_mode_invalid", mode);
  return { mode, appEnv: parsed.ok ? parsed.appEnv : null };
}

export type SourceEnvVerdict = { ok: true } | { ok: false; status: 403 | 503; body: "environment_mismatch" | "environment_not_configured"; reason: string };

/**
 * 호출자가 보낸 x-recording-source-env 와 이 배포의 APP_ENV 가 같은지 확인한다(비밀값 검사 뒤에 호출한다).
 * enforce: APP_ENV 가 없으면 503(environment_not_configured), 헤더가 없거나 다르면 403(environment_mismatch).
 * observe: 항상 통과, 누락·불일치는 사유만 로그.
 */
export function verifySourceEnv(received: string | null, check: RecordingEnvCheck, log: TargetLog = defaultTargetLog): SourceEnvVerdict {
  const header = received?.trim().toLowerCase() || null;
  let reason: string | null = null;
  let notConfigured = false;
  if (!check.appEnv) {
    reason = "app_env_not_configured";
    notConfigured = true;
  } else if (!header) reason = "header_missing";
  else if (header !== check.appEnv) reason = "header_mismatch";
  if (!reason) return { ok: true };
  if (check.mode === "enforce") {
    logOnce(log, "denied", reason, check.mode);
    return notConfigured
      ? { ok: false, status: 503, body: "environment_not_configured", reason }
      : { ok: false, status: 403, body: "environment_mismatch", reason };
  }
  logOnce(log, "observe", reason, check.mode);
  return { ok: true };
}
