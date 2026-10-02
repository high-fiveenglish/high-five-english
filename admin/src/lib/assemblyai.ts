// AssemblyAI REST API 연동. 전용 SDK는 설치하지 않고(package.json에 없음) fetch로
// 직접 호출한다 — 이 파일은 Google Drive에 의존하지 않는다: submitTranscript는
// audioUrl을 그냥 입력값으로 받을 뿐, 그 URL이 어디서 왔는지는 모른다(나중에 Drive
// 연동 시 호출부에서 Drive의 다운로드 URL을 넘기기만 하면 된다 — recordingStorage.ts
// 참고). API 키가 없으면(아직 발급 전) null을 반환해 "아직 설정되지 않음"을 호출부가
// 구분할 수 있게 한다(에러로 던지지 않음 — levelTestTranslation.ts의 getClient()와
// 동일한 관례).
const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

function getApiKey(): string | null {
  return process.env.ASSEMBLYAI_API_KEY ?? null;
}

/** Production 전사 모델 — 프로젝트의 저비용 정책에 따라 Universal-2를 명시한다(계정/API
 * 기본값이 바뀌어도 비용·품질이 따라 바뀌지 않도록). 모델 선택은 이 파일 한 곳에서만
 * 결정한다: 필요하면 서버 전용 env ASSEMBLYAI_SPEECH_MODEL로 덮어쓸 수 있다. */
export const DEFAULT_ASSEMBLYAI_SPEECH_MODEL = "universal-2";

export function getSpeechModel(): string {
  const override = process.env.ASSEMBLYAI_SPEECH_MODEL?.trim();
  return override ? override : DEFAULT_ASSEMBLYAI_SPEECH_MODEL;
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

/** POST /v2/transcript 요청 본문 — 순수 함수라 네트워크 없이 테스트한다.
 * speaker_labels는 항상 true — Talk Time Ratio 계산(talkTime.ts)에 필수. */
export function buildTranscriptRequestBody(audioUrl: string, options: SubmitTranscriptOptions = {}) {
  return {
    audio_url: audioUrl,
    speech_models: [getSpeechModel()],
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

export async function fetchTranscript(transcriptId: string): Promise<AssemblyAITranscriptResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const res = await fetch(`${ASSEMBLYAI_BASE}/transcript/${transcriptId}`, {
    headers: { Authorization: apiKey },
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
