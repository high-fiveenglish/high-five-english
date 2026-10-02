// assemblyai.ts의 순수 파싱 함수(parseTranscriptWebhookPayload) 단위 테스트 —
// 네트워크를 전혀 사용하지 않는다(실제 submitTranscript/fetchTranscript는 API 키가
// 있어야 호출되므로 여기서 테스트하지 않음).
import fs from "node:fs";
import path from "node:path";
import { ASSEMBLYAI_SPEECH_MODELS, buildTranscriptRequestBody, parseTranscriptWebhookPayload } from "../src/lib/assemblyai";

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

// 전사 요청 본문 — 모델은 Universal-2로 고정, speaker_labels는 유지(Talk Time에 필수).
// 환경변수로 모델을 바꿀 수 없다(비용 정책) — 어떤 값이 들어와도 무시되어야 한다.
const savedModels = process.env.ASSEMBLYAI_SPEECH_MODELS;
const body = buildTranscriptRequestBody("https://example.com/a.mp3");
assertEqual(body.speech_models, ["universal-2"], "요청 본문: speech_models=[universal-2]");
assertEqual(body.speaker_labels, true, "요청 본문: speaker_labels=true 유지");
assertEqual("speech_model" in body, false, "요청 본문: deprecated 단수 speech_model 미사용");
assertEqual(body.audio_url, "https://example.com/a.mp3", "요청 본문: audio_url 전달");
assertEqual("webhook_url" in body, false, "webhook 미지정 시 webhook 필드 없음");
const withHook = buildTranscriptRequestBody("https://example.com/a.mp3", { webhookUrl: "https://example.com/hook", webhookSecret: "test-secret" });
assertEqual(
  [withHook.webhook_url, withHook.webhook_auth_header_name, withHook.speaker_labels, withHook.speech_models],
  ["https://example.com/hook", "X-Webhook-Secret", true, ["universal-2"]],
  "webhook 지정 시에도 모델·speaker_labels 유지",
);
const hookNoSecret = buildTranscriptRequestBody("u", { webhookUrl: "https://example.com/hook" });
assertEqual(
  ["webhook_auth_header_value" in hookNoSecret, hookNoSecret.speaker_labels, hookNoSecret.speech_models],
  [false, true, ["universal-2"]],
  "webhook secret 없이도 모델·speaker_labels 유지",
);
for (const bad of ["universal-3-pro", "universal-3-5-pro,universal-2", "bad model!", ""]) {
  process.env.ASSEMBLYAI_SPEECH_MODELS = bad;
  assertEqual(buildTranscriptRequestBody("u").speech_models, ["universal-2"], `환경변수 ASSEMBLYAI_SPEECH_MODELS="${bad}" 는 무시되고 Universal-2 유지`);
}
if (savedModels === undefined) delete process.env.ASSEMBLYAI_SPEECH_MODELS;
else process.env.ASSEMBLYAI_SPEECH_MODELS = savedModels;
const first = buildTranscriptRequestBody("u").speech_models as string[];
first.push("universal-3-pro");
assertEqual(buildTranscriptRequestBody("u").speech_models, ["universal-2"], "반환된 배열을 바꿔도 다음 요청에 영향 없음");
assertEqual(Object.isFrozen(ASSEMBLYAI_SPEECH_MODELS), true, "모델 상수는 동결됨");

// secret 노출 방지 — 요청 본문 외의 곳(소스 로그, 에러 메시지)에 secret이 새지 않는다.
const src = fs.readFileSync(path.join(__dirname, "../src/lib/assemblyai.ts"), "utf8");
assertEqual(/console\.(log|error|warn|info|debug)/.test(src), false, "assemblyai.ts에 console 출력 없음(API key·secret 로그 방지)");
assertEqual(/process\.env\.ASSEMBLYAI_SPEECH/.test(src), false, "assemblyai.ts가 모델 환경변수를 읽지 않음");
assertEqual(/process\.env\./.test(src.replace(/process\.env\.ASSEMBLYAI_API_KEY/g, "")), false, "assemblyai.ts가 읽는 환경변수는 API key 하나뿐");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

