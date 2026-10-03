// process-recording-background(Netlify Background Function) 호출 — assemblyai-webhook과
// recover-transcribed-recordings 양쪽에서 같은 방식(서버-서버 비밀값 헤더 포함)으로
// 호출하기 위해 한 곳에 둔다. Background Function은 요청을 받자마자 202를 돌려주고
// 실제 처리는 별도로 진행하므로, 이 fetch를 await해도 호출부가 Claude 처리 시간만큼
// 기다리지 않는다.
import { getRecordingProcessingSecret, RECORDING_PROCESSING_SECRET_HEADER } from "./recordingProcessingAuth";

const TRIGGER_TIMEOUT_MS = 5000;

/** 요청이 수락됐으면(2xx) true. 사이트 URL/비밀값 미설정이나 네트워크 오류는 false —
 * 이 경우 레코드는 TRANSCRIBED에 남고 recoverStuckTranscribedRecordings가 재시도한다. */
export async function triggerRecordingProcessing(audioRecordingId: number): Promise<boolean> {
  const siteUrl = process.env.URL ?? process.env.DEPLOY_URL;
  const secret = getRecordingProcessingSecret();
  if (!siteUrl || !secret) return false;
  try {
    const res = await fetch(`${siteUrl}/.netlify/functions/process-recording-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json", [RECORDING_PROCESSING_SECRET_HEADER]: secret },
      body: JSON.stringify({ audioRecordingId }),
      signal: AbortSignal.timeout(TRIGGER_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
