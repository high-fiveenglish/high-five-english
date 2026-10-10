// process-recording-background(Netlify Background Function) 호출 — assemblyai-webhook과
// recover-transcribed-recordings 양쪽에서 같은 방식(서버-서버 비밀값 헤더 포함)으로
// 호출하기 위해 한 곳에 둔다. Background Function은 요청을 받자마자 202를 돌려주고
// 실제 처리는 별도로 진행하므로, 이 fetch를 await해도 호출부가 Claude 처리 시간만큼
// 기다리지 않는다.
//
// 호출 대상 사이트는 recordingTarget.ts 가 정한다(비운영이 운영 처리 함수를 부르지 않도록 — 그쪽 설명 참고).
// 호출에는 비밀값 헤더와 함께 이 배포의 환경(APP_ENV)을 알리는 x-recording-source-env 를 싣는다.
import { getRecordingProcessingSecret, RECORDING_PROCESSING_SECRET_HEADER, RECORDING_SOURCE_ENV_HEADER } from "./recordingProcessingAuth";
import { defaultTargetLog, logEffectiveGuardMode, logTargetEventOnce, parseAppEnv, readGuardMode, selectRecordingSite, type EnvLike, type TargetLog } from "./recordingTarget";

const TRIGGER_TIMEOUT_MS = 5000;

export interface RecordingTriggerOptions {
  env?: EnvLike;
  fetchImpl?: typeof fetch;
  log?: TargetLog;
}

/** 요청이 수락됐으면(2xx) true. 사이트 URL/비밀값 미설정, 가드 거부, 리다이렉트(3xx), 네트워크 오류는 false —
 * 이 경우 레코드는 TRANSCRIBED에 남고 recoverStuckTranscribedRecordings가 재시도한다.
 *
 * redirect: "manual" — 비밀값 헤더(x-recording-processing-secret)는 표준 보안 헤더가 아니어서 fetch 가 cross-origin 리다이렉트를
 * 따라가며 그대로 다시 보낸다(307/308 은 POST·본문 유지, 301/302 는 GET 으로 바뀌지만 헤더는 유지). 정해진 처리 함수 주소 외의
 * 곳으로 비밀값이 새지 않도록 리다이렉트는 따라가지 않고 실패로 처리한다. */
export function createRecordingTrigger(options: RecordingTriggerOptions = {}): (audioRecordingId: number) => Promise<boolean> {
  return async (audioRecordingId: number) => {
    const env = options.env ?? process.env;
    logEffectiveGuardMode(env, options.log ?? defaultTargetLog);
    const siteUrl = selectRecordingSite(env, options.log);
    const secret = getRecordingProcessingSecret(env);
    if (!siteUrl || !secret) return false;
    const appEnv = parseAppEnv(env.APP_ENV);
    const doFetch = options.fetchImpl ?? fetch;
    try {
      const res = await doFetch(`${siteUrl}/.netlify/functions/process-recording-background`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [RECORDING_PROCESSING_SECRET_HEADER]: secret,
          ...(appEnv.ok ? { [RECORDING_SOURCE_ENV_HEADER]: appEnv.appEnv } : {}),
        },
        body: JSON.stringify({ audioRecordingId }),
        signal: AbortSignal.timeout(TRIGGER_TIMEOUT_MS),
        redirect: "manual",
      });
      // 3xx(또는 manual 모드의 opaqueredirect)는 어떤 경우에도 성공이 아니다. 목적지는 기록하지 않는다(사유 코드만).
      if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
        logTargetEventOnce(options.log ?? defaultTargetLog, "recording-trigger-redirect", "redirect_not_followed", readGuardMode(env));
        return false;
      }
      return res.ok;
    } catch {
      return false;
    }
  };
}

export const triggerRecordingProcessing = createRecordingTrigger();
