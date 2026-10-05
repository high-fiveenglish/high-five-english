// generate-sessions CLI의 인자 파싱과 쓰기 게이트 판정(순수 함수 — DB 접근 없음, 오프라인 테스트 대상).
export type CliMode = "preview" | "pilot" | "full" | "rollback" | "release-lock";

export interface CliArgs {
  mode: CliMode;
  enrollmentIds: number[] | null;
  approvedFile: string | null;
  asOf: string | null;
  expectPlanHash: string | null;
  expectSessions: number | null;
  confirm: string | null;
  expectDbHost: string | null;
  actorAdminId: number | null;
  actorLabel: string;
  rollbackBatchId: string | null;
  releaseLockBatchId: string | null;
  apply: boolean;
  continueOnError: boolean;
  unknown: string[];
}

const MODES: CliMode[] = ["preview", "pilot", "full", "rollback", "release-lock"];

export function parseIdList(text: string): number[] {
  const ids = text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((t) => (/^[1-9][0-9]{0,9}$/.test(t) ? Number(t) : NaN));
  if (ids.some((n) => !Number.isInteger(n))) throw new Error(`수강 id 목록에 올바르지 않은 값이 있습니다: ${text.slice(0, 80)}`);
  return ids;
}

export function parseArgs(argv: string[]): CliArgs {
  const kv = new Map<string, string>();
  const flags = new Set<string>();
  const unknown: string[] = [];
  for (const a of argv) {
    const m = a.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (!m) {
      unknown.push(a);
      continue;
    }
    if (m[2] === undefined) flags.add(m[1]);
    else kv.set(m[1], m[2]);
  }
  const known = new Set(["mode", "enrollment-ids", "as-of", "expect-plan-hash", "expect-sessions", "confirm", "expect-db-host", "actor-admin-id", "actor-label", "rollback", "release-lock", "apply", "continue-on-error", "approved-file"]);
  for (const k of [...kv.keys(), ...flags]) if (!known.has(k)) unknown.push(`--${k}`);

  let mode = (kv.get("mode") ?? "preview") as CliMode;
  if (kv.has("rollback")) mode = "rollback";
  if (kv.has("release-lock")) mode = "release-lock";
  if (!MODES.includes(mode)) unknown.push(`--mode=${mode}`);

  const num = (v: string | undefined) => (v !== undefined && /^[0-9]{1,10}$/.test(v) ? Number(v) : null);
  return {
    mode,
    enrollmentIds: kv.has("enrollment-ids") ? parseIdList(kv.get("enrollment-ids")!) : null,
    approvedFile: kv.get("approved-file") ?? null,
    asOf: kv.get("as-of") ?? null,
    expectPlanHash: kv.get("expect-plan-hash") ?? null,
    expectSessions: num(kv.get("expect-sessions")),
    confirm: kv.get("confirm") ?? null,
    expectDbHost: kv.get("expect-db-host") ?? null,
    actorAdminId: num(kv.get("actor-admin-id")),
    actorLabel: kv.get("actor-label") ?? "cli",
    rollbackBatchId: kv.get("rollback") ?? null,
    releaseLockBatchId: kv.get("release-lock") ?? null,
    apply: flags.has("apply"),
    continueOnError: flags.has("continue-on-error"),
    unknown,
  };
}

/**
 * 쓰기가 일어나는 실행(pilot/full/rollback --apply/release-lock)에 필요한 게이트를 전부 점검한다.
 * 하나라도 빠지면 쓰기를 하지 않는다 — 반환값은 "빠진/틀린 게이트" 목록(비어 있어야 실행 가능).
 */
export function checkWriteGates(args: CliArgs, env: Record<string, string | undefined>, dbHost: string): string[] {
  const missing: string[] = [];
  const writes = args.mode === "pilot" || args.mode === "full" || args.mode === "release-lock" || (args.mode === "rollback" && args.apply);
  if (!writes) return missing;

  if (env.ALLOW_SESSION_GENERATION !== "yes") missing.push("환경변수 ALLOW_SESSION_GENERATION=yes");
  const expectedConfirm = args.mode === "rollback" ? "ROLLBACK" : args.mode === "release-lock" ? "RELEASE" : "GENERATE";
  if (args.confirm !== expectedConfirm) missing.push(`--confirm=${expectedConfirm}`);
  if (!args.expectDbHost) missing.push("--expect-db-host=<DB 호스트명>");
  else if (args.expectDbHost !== dbHost) missing.push("--expect-db-host가 DATABASE_URL의 호스트와 다름");
  if (args.actorAdminId === null) missing.push("--actor-admin-id=<관리자 id>");

  if (args.mode === "pilot" || args.mode === "full") {
    if (!args.enrollmentIds || args.enrollmentIds.length === 0) missing.push("--enrollment-ids=<허용 목록>");
    if (!args.asOf || Number.isNaN(new Date(args.asOf).getTime())) missing.push("--as-of=<미리보기 기준 시각 ISO>");
    if (!args.expectPlanHash || !/^[0-9a-f]{64}$/.test(args.expectPlanHash)) missing.push("--expect-plan-hash=<64자 hex>");
    if (args.expectSessions === null) missing.push("--expect-sessions=<예상 생성 세션 수>");
  }
  if (args.mode === "rollback" && !args.rollbackBatchId) missing.push("--rollback=<batchId>");
  if (args.mode === "release-lock" && !args.releaseLockBatchId) missing.push("--release-lock=<batchId>");
  return missing;
}
