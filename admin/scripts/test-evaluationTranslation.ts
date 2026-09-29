// 번역 캐시 판단 로직(languageForRegion/shouldTranslate)에 대한 순수 함수 단위
// 테스트 — admin 앱엔 별도 테스트 러너(vitest/jest)가 없어, 이 저장소의 다른
// admin/scripts/* 스크립트들과 같은 방식(수동 assert + PASS/FAIL 출력)으로
// 작성한다. DB/네트워크를 전혀 건드리지 않는 순수 함수만 검증한다 — 실제
// translateLevelTestResult/translateLessonEvaluation은 Anthropic API 키가 있어야
// 호출되므로(키 미설정 시 null 반환) 여기서는 그 앞단 판단 로직만 검증한다.
import { languageForRegion, shouldTranslate } from "../src/lib/levelTestTranslation";

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

// --- languageForRegion: Student.region -> 언어 코드 매핑 ---
assertEqual(languageForRegion("KOREA")?.code, "ko", "languageForRegion(KOREA) -> ko");
assertEqual(languageForRegion("CHINA")?.code, "zh", "languageForRegion(CHINA) -> zh");
assertEqual(languageForRegion("VIETNAM")?.code, "vi", "languageForRegion(VIETNAM) -> vi");
assertEqual(languageForRegion("JAPAN")?.code, "ja", "languageForRegion(JAPAN) -> ja");
assertEqual(languageForRegion("AUSTRALIA"), null, "languageForRegion(AUSTRALIA) -> null (English, skip)");
assertEqual(languageForRegion("USA_OTHER"), null, "languageForRegion(USA_OTHER) -> null (English, skip)");
assertEqual(languageForRegion(null), null, "languageForRegion(null) -> null (거주지역 미입력)");

// --- shouldTranslate: 재번역 여부 판단 (LevelTest/LessonEvaluation 공용) ---

// 1. 신규 저장(이전 원문/번역 없음) -> 번역 시도
assertEqual(
  shouldTranslate({ newContent: "Great job today!", targetLangCode: "ko", previousContent: null, previousTranslatedLangCode: null }),
  true,
  "신규 저장 (KOREA) -> 번역 시도",
);

// 2. content 변경 없음, 언어도 동일 -> 재번역 안 함(캐시 유지)
assertEqual(
  shouldTranslate({
    newContent: "Great job today!",
    targetLangCode: "ko",
    previousContent: "Great job today!",
    previousTranslatedLangCode: "ko",
  }),
  false,
  "content unchanged, 같은 언어 -> 번역 API 재호출 없음",
);

// 3. content가 바뀜 -> 재번역
assertEqual(
  shouldTranslate({
    newContent: "Great job today! You improved a lot.",
    targetLangCode: "ko",
    previousContent: "Great job today!",
    previousTranslatedLangCode: "ko",
  }),
  true,
  "content changed -> 재번역",
);

// 4. 대상 언어가 바뀜(예: 학생 거주지역 변경) -> 재번역
assertEqual(
  shouldTranslate({
    newContent: "Great job today!",
    targetLangCode: "zh",
    previousContent: "Great job today!",
    previousTranslatedLangCode: "ko",
  }),
  true,
  "target language changed(ko->zh) -> 재번역",
);

// 5. 대상 언어가 영어(null, AUSTRALIA/USA_OTHER) -> 번역하지 않음
assertEqual(
  shouldTranslate({ newContent: "Great job today!", targetLangCode: null, previousContent: null, previousTranslatedLangCode: null }),
  false,
  "target language = English(null) -> 번역하지 않음",
);

// 6. 빈 content -> 번역하지 않음
assertEqual(
  shouldTranslate({ newContent: "", targetLangCode: "ko", previousContent: "Great job today!", previousTranslatedLangCode: "ko" }),
  false,
  "빈 content -> 번역하지 않음",
);

// 7. CHINA/VIETNAM 학생 대상 신규 평가 저장
assertEqual(
  shouldTranslate({ newContent: "Nice pronunciation.", targetLangCode: "zh", previousContent: null, previousTranslatedLangCode: null }),
  true,
  "신규 저장 (CHINA) -> 번역 시도",
);
assertEqual(
  shouldTranslate({ newContent: "Nice pronunciation.", targetLangCode: "vi", previousContent: null, previousTranslatedLangCode: null }),
  true,
  "신규 저장 (VIETNAM) -> 번역 시도",
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
