// assemblyai.ts의 순수 함수(parseTranscriptWebhookPayload, buildTranscriptRequestBody)
// 단위 테스트 — 네트워크를 전혀 사용하지 않는다(실제 submitTranscript/fetchTranscript는
// API 키가 있어야 호출되므로 여기서 테스트하지 않음).
import {
  DEFAULT_ASSEMBLYAI_SPEECH_MODEL,
  buildTranscriptRequestBody,
  getSpeechModel,
  parseTranscriptWebhookPayload,
} from "../src/lib/assemblyai";

let pass = 0;
let fail = 0;

function assertEqual(actual: unknown, expected: unknown, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

assertEqual(
  parseTranscriptWebhookPayload({ transcript_id: "abc123", status: "completed" }),
  { transcriptId: "abc123", status: "completed" },
  "정상 payload 파싱",
);
assertEqual(parseTranscriptWebhookPayload({ status: "completed" }), null, "transcript_id 누락 -> null");
assertEqual(parseTranscriptWebhookPayload({ transcript_id: "abc" }), null, "status 누락 -> null");
assertEqual(parseTranscriptWebhookPayload(null), null, "null body -> null");
assertEqual(parseTranscriptWebhookPayload("not an object"), null, "문자열 body -> null");
assertEqual(parseTranscriptWebhookPayload({ transcript_id: 123, status: "completed" }), null, "transcript_id가 숫자 -> null");

// 전사 요청 본문: 저비용 모델(Universal-2) 명시 + speaker_labels 유지.
delete process.env.ASSEMBLYAI_SPEECH_MODEL;
assertEqual(DEFAULT_ASSEMBLYAI_SPEECH_MODEL, "universal-2", "기본 speech model = universal-2");
assertEqual(getSpeechModel(), "universal-2", "env 없음 -> universal-2");
assertEqual(
  buildTranscriptRequestBody("https://example.com/a.mp3"),
  { audio_url: "https://example.com/a.mp3", speech_models: ["universal-2"], speaker_labels: true },
  "webhook 없는 요청 본문",
);
assertEqual(
  buildTranscriptRequestBody("https://example.com/a.mp3", { webhookUrl: "https://hook", webhookSecret: "s" }),
  {
    audio_url: "https://example.com/a.mp3",
    speech_models: ["universal-2"],
    speaker_labels: true,
    webhook_url: "https://hook",
    webhook_auth_header_name: "X-Webhook-Secret",
    webhook_auth_header_value: "s",
  },
  "webhook + secret 요청 본문",
);
process.env.ASSEMBLYAI_SPEECH_MODEL = "   ";
assertEqual(getSpeechModel(), "universal-2", "공백 env -> 기본값 유지");
process.env.ASSEMBLYAI_SPEECH_MODEL = "universal-3-pro";
assertEqual(buildTranscriptRequestBody("u").speech_models, ["universal-3-pro"], "env로 모델 덮어쓰기");
assertEqual(buildTranscriptRequestBody("u").speaker_labels, true, "모델을 바꿔도 speaker_labels 유지");
delete process.env.ASSEMBLYAI_SPEECH_MODEL;

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
