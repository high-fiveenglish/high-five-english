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
//  · 값은 https 의 순수 origin 이어야 한다(경로·쿼리·해시·사용자 정보 금지, 끝의 "/" 하나만 허용).
//  · 운영 origin 집합 = URL 의 origin + PRODUCTION_SITE_ORIGIN(쉼표 목록). 비운영이 이 집합의 origin 을 가리키면 거부한다.
//  · production 이 이 집합 밖의 origin 을 가리키면(RECORDING_SITE_URL 오설정) 거부한다.
//
// 단계적 도입(RECORDING_TARGET_GUARD): 기본 observe — 위 규칙으로 "거부했을 상황"을 사유만 로그로 남기고 동작은 예전 그대로.
// enforce — 실제로 거부한다. APP_ENV 를 빠뜨린 채 enforce 로 가면 운영 트리거가 거부되므로, 운영에서 observe 거부 로그가 0건임을
// 확인한 뒤 전환한다. 로그에는 사유 코드만 남기고 URL·비밀값은 절대 남기지 않는다.

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
  | "production_origin_from_non_production";

export type RecordingSiteResult = { ok: true; origin: string; appEnv: AppEnv } | { ok: false; reason: RecordingSiteDenyReason };

const APP_ENVS: readonly AppEnv[] = ["production", "preview", "development"];

export function parseAppEnv(raw: string | undefined): { ok: true; appEnv: AppEnv } | { ok: false; reason: "app_env_unset" | "app_env_invalid" } {
  const v = raw?.trim().toLowerCase();
  if (!v) return { ok: false, reason: "app_env_unset" };
  return (APP_ENVS as readonly string[]).includes(v) ? { ok: true, appEnv: v as AppEnv } : { ok: false, reason: "app_env_invalid" };
}

/** "enforce"만 enforce, 그 밖(미설정·오타 포함)은 observe — 오타가 운영 트리거를 막지 않게 하는 쪽으로 기운다(오타는 로그로 드러난다). */
export function readGuardMode(env: EnvLike): GuardMode {
  return env.RECORDING_TARGET_GUARD?.trim().toLowerCase() === "enforce" ? "enforce" : "observe";
}

type OriginParse = { ok: true; origin: string } | { ok: false; reason: "site_url_invalid" | "site_url_not_https" | "site_url_has_credentials" | "site_url_not_origin" };

/** https 순수 origin 만 통과시킨다. 반환값은 정규화된 origin(소문자 호스트, 기본 포트 생략, 끝 슬래시 없음). */
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
  return { ok: true, origin: u.origin };
}

function productionOrigins(env: EnvLike): Set<string> {
  const set = new Set<string>();
  const candidates = [env.URL, ...(env.PRODUCTION_SITE_ORIGIN ?? "").split(",")];
  for (const c of candidates) {
    if (!c || !c.trim()) continue;
    const p = parseHttpsOrigin(c);
    if (p.ok) set.add(p.origin);
  }
  return set;
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
    if (prod.size > 0 && !prod.has(parsed.origin)) return { ok: false, reason: "production_target_mismatch" };
  } else if (prod.has(parsed.origin)) {
    return { ok: false, reason: "production_origin_from_non_production" };
  }
  return { ok: true, origin: parsed.origin, appEnv };
}

/** observe 모드에서 예전 동작을 그대로 재현하기 위한 값 — 코드베이스에서 URL/DEPLOY_URL 을 읽는 유일한 자리(이 파일). */
export function legacyRecordingSiteUrl(env: EnvLike): string | undefined {
  return env.URL ?? env.DEPLOY_URL;
}

// ───────────────────────── 로그(사유 코드만, 프로세스당 사유별 1회) ─────────────────────────
export type TargetLog = (message: string, detail: { reason: string; mode: GuardMode }) => void;
const defaultLog: TargetLog = (message, detail) => console.warn(message, JSON.stringify(detail));
const logged = new Set<string>();
/** 테스트에서만 쓴다. */
export function resetRecordingTargetLogDedupe() {
  logged.clear();
}
function logOnce(log: TargetLog, kind: "denied" | "observe", reason: string, mode: GuardMode) {
  const key = `${kind}:${reason}`;
  if (logged.has(key)) return;
  logged.add(key);
  log(kind === "denied" ? "recording-target-denied" : "recording-target-observe", { reason, mode });
}

/**
 * 호출 쪽이 쓸 사이트 주소. null 이면 호출하지 않는다.
 * enforce: 규칙을 통과한 origin 만. observe: 항상 예전 값(URL ?? DEPLOY_URL 원문) — 규칙상 거부였다면 사유만 로그.
 */
export function selectRecordingSite(env: EnvLike, log: TargetLog = defaultLog): string | null {
  const mode = readGuardMode(env);
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
export interface RecordingEnvCheck {
  mode: GuardMode;
  /** 이 배포의 APP_ENV. 유효하지 않으면 null. */
  appEnv: AppEnv | null;
}

export function readRecordingEnvCheck(env: EnvLike): RecordingEnvCheck {
  const parsed = parseAppEnv(env.APP_ENV);
  return { mode: readGuardMode(env), appEnv: parsed.ok ? parsed.appEnv : null };
}

export type SourceEnvVerdict = { ok: true } | { ok: false; status: 403 | 503; body: "environment_mismatch" | "environment_not_configured"; reason: string };

/**
 * 호출자가 보낸 x-recording-source-env 와 이 배포의 APP_ENV 가 같은지 확인한다(비밀값 검사 뒤에 호출한다).
 * enforce: APP_ENV 가 없으면 503(environment_not_configured), 헤더가 없거나 다르면 403(environment_mismatch).
 * observe: 항상 통과, 누락·불일치는 사유만 로그.
 */
export function verifySourceEnv(received: string | null, check: RecordingEnvCheck, log: TargetLog = defaultLog): SourceEnvVerdict {
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
