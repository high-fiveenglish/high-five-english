// 수업 생성 CLI — Enrollment 일정으로부터 ClassSession을 만드는 "유일한" 실행 경로(관리자 화면에는 생성 버튼이 없다).
//
// 기본 동작은 미리보기(읽기 전용)다. 쓰기(pilot/full/rollback --apply/release-lock)는 모든 게이트를 통과해야만 실행된다:
//   ALLOW_SESSION_GENERATION=yes · --confirm=GENERATE(롤백은 ROLLBACK) · --expect-db-host · --actor-admin-id ·
//   허용 목록(--enrollment-ids 또는 --approved-file) · --as-of · --expect-plan-hash · --expect-sessions
//
// 사용법(admin 디렉터리, DATABASE_URL은 환경변수로만 전달 — 출력하지 않는다):
//   npx tsx scripts/generate-sessions.ts --mode=preview --enrollment-ids=1,2,3
//   npx tsx scripts/generate-sessions.ts --mode=pilot  --enrollment-ids=... --as-of=<ISO> --expect-plan-hash=<hash> --expect-sessions=<n> \
//        --confirm=GENERATE --expect-db-host=<host> --actor-admin-id=<id>      (ALLOW_SESSION_GENERATION=yes)
//   npx tsx scripts/generate-sessions.ts --rollback=<batchId>                  (대상 목록만 출력)
//   npx tsx scripts/generate-sessions.ts --rollback=<batchId> --apply --confirm=ROLLBACK ...
import fs from "node:fs";
import {
  GenerationGateError,
  GenerationLeaseLostError,
  executeGeneration,
  previewGeneration,
  releaseStaleBatchLock,
  rollbackGeneration,
} from "../src/lib/sessionGeneration";
import { EXCLUSION_REASON_LABEL } from "../src/lib/sessionPlan";
import { createGenerationClient, parseDbUrl } from "./lib/generationClient";
import { checkWriteGates, parseArgs, parseIdList } from "./lib/generationCli";

function maskHost(host: string): string {
  return host.length <= 14 ? host : `${host.slice(0, 6)}…${host.slice(-18)}`;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.unknown.length > 0) {
    console.error(`알 수 없는 인자: ${args.unknown.join(" ")}`);
    return 2;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL 환경변수가 필요합니다(출력하지 않음).");
    return 2;
  }
  const parsed = parseDbUrl(url);

  if (args.approvedFile) {
    const text = fs.readFileSync(args.approvedFile, "utf8");
    args.enrollmentIds = parseIdList(text.replace(/[[\]"]/g, " "));
  }

  const missing = checkWriteGates(args, process.env, parsed.host);
  if (missing.length > 0) {
    console.error(`쓰기 게이트 미충족 — 아무것도 실행하지 않았습니다. 필요/불일치: \n  - ${missing.join("\n  - ")}`);
    return 2;
  }

  const db = createGenerationClient(url);
  try {
    console.log(`DB 호스트: ${maskHost(parsed.host)} · 모드: ${args.mode}${args.apply ? " --apply" : ""}`);

    if (args.mode === "rollback") {
      const r = await rollbackGeneration(db, { batchId: args.rollbackBatchId!, apply: args.apply, actorLabel: args.actorLabel, actorAdminId: args.actorAdminId });
      console.log(`배치 ${r.batchId} 롤백 ${r.apply ? "실행" : "미리보기"}: 전체 ${r.total} · 삭제 가능 ${r.deletable} · 남김 ${r.kept} · 삭제됨 ${r.deleted} · 상태 ${r.status}`);
      const kept = r.candidates.filter((c) => !c.deletable);
      for (const c of kept.slice(0, 50)) console.log(`  남김 세션 #${c.sessionId} (수강 #${c.enrollmentId}): ${c.reasons.join(",")}`);
      if (kept.length > 50) console.log(`  … 외 ${kept.length - 50}건`);
      if (!r.apply) console.log("실제로 지우려면 --apply --confirm=ROLLBACK (+ 다른 게이트)가 필요합니다.");
      return 0;
    }

    if (args.mode === "release-lock") {
      const r = await releaseStaleBatchLock(db, { batchId: args.releaseLockBatchId! });
      console.log(r.released ? `해제됨: ${r.reason}` : `해제하지 않음: ${r.reason}`);
      return r.released ? 0 : 1;
    }

    // preview / pilot / full
    if (!args.enrollmentIds || args.enrollmentIds.length === 0) {
      console.error("미리보기에도 허용 목록이 필요합니다: --enrollment-ids=1,2,3 또는 --approved-file=<경로>");
      return 2;
    }
    const mode = args.mode === "pilot" ? "PILOT" : "FULL";

    if (args.mode === "preview") {
      const asOf = args.asOf ? new Date(args.asOf) : new Date();
      const p = await previewGeneration(db, { mode: "FULL", enrollmentIds: args.enrollmentIds, asOf });
      console.log(`기준 시각(asOf): ${asOf.toISOString()}  (KST 기준일 ${p.population.todayKst})`);
      console.log(`전체 ACTIVE ${p.population.totalActive} · 생성 가능 ${p.population.eligible} · 충돌 ${p.population.conflict} · 제외 ${p.population.excluded} · 오류 ${p.population.errors} · 시각 미검증 보류 ${p.population.timeUnverifiedEnrollments}`);
      console.log("허용 목록 범위:");
      for (const r of p.scopeRows) {
        const why = r.generationEligible ? "" : r.outcome === "ELIGIBLE" ? " [시각 미검증]" : ` [${r.outcome} ${[...r.reasons.map((x) => EXCLUSION_REASON_LABEL[x]), ...r.errors.map((e) => e.code)].join("; ")}]`;
        console.log(`  수강 #${r.enrollmentId}: ${r.generationEligible ? "생성 대상" : "생성 안 함"} · 예정 ${r.plannedSessions.length}건 · ${r.timeVerification}${why}`);
      }
      console.log(`planHash=${p.planHash}`);
      console.log(`expectedSessions=${p.expectedSessions}`);
      console.log(`as-of=${asOf.toISOString()}`);
      console.log("\n검토 후 실행(예: pilot) — 허용 목록 전체와 위 세 값을 그대로 넣어야 합니다:");
      console.log(`  ALLOW_SESSION_GENERATION=yes npx tsx scripts/generate-sessions.ts --mode=pilot --enrollment-ids=${args.enrollmentIds.join(",")} --as-of=${asOf.toISOString()} --expect-plan-hash=${p.planHash} --expect-sessions=${p.expectedSessions} --confirm=GENERATE --expect-db-host=<host> --actor-admin-id=<id>`);
      return 0;
    }

    const r = await executeGeneration(db, {
      mode,
      enrollmentIds: args.enrollmentIds,
      asOf: new Date(args.asOf!),
      expectedPlanHash: args.expectPlanHash!,
      expectedSessions: args.expectSessions!,
      actorLabel: args.actorLabel,
      actorAdminId: args.actorAdminId,
      stopOnError: !args.continueOnError,
    });
    console.log(`배치 ${r.batchId} ${r.mode} → ${r.status}: 생성 ${r.createdSessions}/${r.expectedSessions}건`);
    for (const it of r.items) console.log(`  수강 #${it.enrollmentId}: ${it.outcome}${it.reasons.length ? ` (${it.reasons.join(",")})` : ""} · 예정 ${it.plannedCount} · 생성 ${it.createdCount}`);
    if (r.failureReason) console.log(`사유: ${r.failureReason}`);
    return r.status === "SUCCEEDED" ? 0 : 1;
  } catch (e) {
    if (e instanceof GenerationGateError) {
      console.error(`중단(${e.code}): ${e.message}  — 아무것도 쓰지 않았습니다.`);
      return 2;
    }
    if (e instanceof GenerationLeaseLostError) {
      console.error(`중단(LEASE_LOST): ${e.message} 이 실행기가 회수 전에 만든 세션 ${e.createdSessions}건은 배치 기록에 집계되어 있습니다.`);
      return 1;
    }
    console.error(`오류: ${(e instanceof Error ? e.message : String(e)).replace(/postgres(ql)?:\/\/\S+/gi, "<url>")}`);
    return 1;
  } finally {
    await db.$disconnect();
  }
}

main().then((code) => process.exit(code));
