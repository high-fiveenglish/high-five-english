// process-recording-background(Netlify Background Function) 호출 — assemblyai-webhook과
// recover-transcribed-recordings 양쪽에서 같은 방식(서버-서버 비밀값 헤더 포함)으로
// 호출하기 위해 한 곳에 둔다. Background Function은 요청을 받자마자 202를 돌려주고
// 실제 처리는 별도로 진행하므로, 이 fetch를 await해도 호출부가 Claude 처리 시간만큼
// 기다리지 않는다.
//
// 호출 대상 사이트는 recordingTarget.ts 가 정한다(비운영이 운영 처리 함수를 부르지 않도록 — 그쪽 설명 참고).
// 호출에는 비밀값 헤더와 함께 이 배포의 환경(APP_ENV)을 알리는 x-recording-source-env 를 싣는다.
import { getRecordingProcessingSecret, RECORDING_PROCESSING_SECRET_HEADER, RECORDING_SOURCE_ENV_HEADER } from "./recordingProcessingAuth";
import { parseAppEnv, selectRecordingSite, type EnvLike, type TargetLog } from "./recordingTarget";

const TRIGGER_TIMEOUT_MS = 5000;

export interface RecordingTriggerOptions {
  env?: EnvLike;
  fetchImpl?: typeof fetch;
  log?: TargetLog;
}

/** 요청이 수락됐으면(2xx) true. 사이트 URL/비밀값 미설정, 가드 거부, 네트워크 오류는 false —
 * 이 경우 레코드는 TRANSCRIBED에 남고 recoverStuckTranscribedRecordings가 재시도한다. */
export function createRecordingTrigger(options: RecordingTriggerOptions = {}): (audioRecordingId: number) => Promise<boolean> {
  return async (audioRecordingId: number) => {
    const env = options.env ?? process.env;
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
      });
      return res.ok;
    } catch {
      return false;
    }
  };
}

export const triggerRecordingProcessing = createRecordingTrigger();
