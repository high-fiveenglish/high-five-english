// process-recording-background(Netlify Background Function)를 호출할 수 있는 쪽은
// 우리 서버 코드(assemblyai-webhook 라우트, recover-transcribed-recordings Scheduled
// Function) 뿐이다 — 이 함수는 AssemblyAI/Anthropic 비용이 드는 작업과 DB 쓰기를
// 하므로 외부에서 임의로 호출할 수 있으면 안 된다. assemblyai-webhook의
// X-Webhook-Secret과 같은 "공유 비밀값 헤더 + timing-safe 비교" 방식이다(호출자가
// 우리 서버 하나뿐이라 서명 발급/검증의 비대칭성이 필요 없다). 비밀값은 서버 환경변수
// (RECORDING_PROCESSING_SECRET)에만 있고 클라이언트 번들로 나가지 않는다
// (NEXT_PUBLIC_ 접두사 없음).
import { timingSafeEqual } from "crypto";

export const RECORDING_PROCESSING_SECRET_HEADER = "x-recording-processing-secret";

// 호출한 배포의 환경(APP_ENV)을 알리는 헤더 — 처리 함수가 자기 환경과 다르면 거부한다(recordingTarget.ts).
// 비밀값이 우연히 같아도 미리보기→운영 호출을 막는 두 번째 방어선이다. 비밀이 아니다.
export const RECORDING_SOURCE_ENV_HEADER = "x-recording-source-env";

export function getRecordingProcessingSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.RECORDING_PROCESSING_SECRET || null;
}

/** 비밀값이 서버에 설정되지 않았으면(expected 없음) 항상 false — "미설정 = 전부 허용"이
 * 되지 않도록 한다. */
export function isAuthorizedProcessingRequest(received: string | null, expected: string | null): boolean {
  if (!expected || !received) return false;
  const bufA = Buffer.from(received);
  const bufB = Buffer.from(expected);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
