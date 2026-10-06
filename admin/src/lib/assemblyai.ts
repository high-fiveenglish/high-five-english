// AssemblyAI REST API 연동. 전용 SDK는 설치하지 않고(package.json에 없음) fetch로
// 직접 호출한다 — 이 파일은 Google Drive에 의존하지 않는다: submitTranscript는
// audioUrl을 그냥 입력값으로 받을 뿐, 그 URL이 어디서 왔는지는 모른다(나중에 Drive
// 연동 시 호출부에서 Drive의 다운로드 URL을 넘기기만 하면 된다 — recordingStorage.ts
// 참고). API 키가 없으면(아직 발급 전) null을 반환해 "아직 설정되지 않음"을 호출부가
// 구분할 수 있게 한다(에러로 던지지 않음 — levelTestTranslation.ts의 getClient()와
// 동일한 관례).
const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";
// 응답이 멈춘 요청이 background function 시간(최대 15분)을 통째로 잡아먹지 않게 한다.
const REQUEST_TIMEOUT_MS = 30_000;

function getApiKey(): string | null {
  return process.env.ASSEMBLYAI_API_KEY ?? null;
}

/** 운영 음성 인식 모델 — 비용 정책상 Universal-2로 고정한다. AssemblyAI의 기본값
 * (["universal-3-5-pro", "universal-2"])을 그대로 두면 상위 모델로 과금될 수 있다.
 * 환경변수로 바꿀 수 없게 한 것은 의도적이다: 환경변수 하나로 고비용 모델로 조용히
 * 바뀌는 사고를 구조적으로 막는다. 모델을 바꾸려면 이 상수를 코드 리뷰를 거쳐 수정한다.
 * 모델 선택은 이 파일 한 곳에서만 관리한다 — 호출부에서 모델명을 직접 쓰지 않는다. */
export const ASSEMBLYAI_SPEECH_MODELS: readonly string[] = Object.freeze(["universal-2"]);

/** POST /v2/transcript 요청 본문. speaker_labels는 항상 true — Talk Time Ratio 계산(talkTime.ts)에 필수. */
export function buildTranscriptRequestBody(audioUrl: string, options: SubmitTranscriptOptions = {}): Record<string, unknown> {
  return {
    audio_url: audioUrl,
    speech_models: [...ASSEMBLYAI_SPEECH_MODELS],
    speaker_labels: true,
    ...(options.webhookUrl
      ? {
          webhook_url: options.webhookUrl,
          ...(options.webhookSecret
            ? { webhook_auth_header_name: "X-Webhook-Secret", webhook_auth_header_value: options.webhookSecret }
            : {}),
        }
      : {}),
  };
}

export interface SubmitTranscriptOptions {
  /** AssemblyAI가 처리 완료 시 POST할 webhook URL. 생략하면 polling으로 결과를 받아야 한다. */
  webhookUrl?: string;
  /** webhook 요청에 실릴 커스텀 인증 헤더 값 — 우리 webhook 핸들러가 이 값으로 요청 출처를 검증한다. */
  webhookSecret?: string;
}

export interface SubmitTranscriptResult {
  id: string;
  status: string;
}

/** 녹음 파일의 공개 다운로드 가능 URL(audioUrl)을 AssemblyAI에 제출해 전사를 요청한다. */
export async function submitTranscript(
  audioUrl: string,
  options: SubmitTranscriptOptions = {},
): Promise<SubmitTranscriptResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const res = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(buildTranscriptRequestBody(audioUrl, options)),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { id: string; status: string };
  return { id: data.id, status: data.status };
}

export interface AssemblyAIUtterance {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

export interface AssemblyAITranscriptResult {
  id: string;
  status: "completed" | "error" | "processing" | "queued";
  text: string | null;
  utterances: AssemblyAIUtterance[] | null;
  audio_duration: number | null;
  error?: string;
}

export async function fetchTranscript(transcriptId: string, options: { timeoutMs?: number } = {}): Promise<AssemblyAITranscriptResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const res = await fetch(`${ASSEMBLYAI_BASE}/transcript/${transcriptId}`, {
    headers: { Authorization: apiKey },
    signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  return (await res.json()) as AssemblyAITranscriptResult;
}

/** AssemblyAI webhook 요청 본문에서 필요한 최소 정보만 안전하게 뽑아낸다 — 형식이
 * 예상과 다르면(필드 누락 등) null을 반환해 호출부가 400으로 거절하게 한다. */
export function parseTranscriptWebhookPayload(body: unknown): { transcriptId: string; status: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const transcriptId = b.transcript_id;
  const status = b.status;
  if (typeof transcriptId !== "string" || typeof status !== "string") return null;
  return { transcriptId, status };
}
