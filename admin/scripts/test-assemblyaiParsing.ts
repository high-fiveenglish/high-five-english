// assemblyai.ts의 순수 파싱 함수(parseTranscriptWebhookPayload) 단위 테스트 —
// 네트워크를 전혀 사용하지 않는다(실제 submitTranscript/fetchTranscript는 API 키가
// 있어야 호출되므로 여기서 테스트하지 않음).
import { parseTranscriptWebhookPayload } from "../src/lib/assemblyai";

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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
