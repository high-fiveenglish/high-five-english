import Anthropic from "@anthropic-ai/sdk";

// 학생 거주지역(Student.region, 회원가입/프로필의 "거주 지역")을 레벨테스트 결과
// 번역 언어로 매핑한다. 호주/미국·기타는 이미 영어이므로 번역이 필요 없다(null).
// 거주지역을 아예 입력하지 않은 학생도 마찬가지로 번역하지 않고 강사가 쓴 영어
// 원문만 보여준다 — 어떤 언어로 번역해야 할지 알 수 없기 때문이다.
const REGION_LANGUAGE: Record<string, { code: string; name: string; label: string }> = {
  KOREA: { code: "ko", name: "Korean", label: "한국어" },
  CHINA: { code: "zh", name: "Simplified Chinese", label: "中文" },
  VIETNAM: { code: "vi", name: "Vietnamese", label: "Tiếng Việt" },
  JAPAN: { code: "ja", name: "Japanese", label: "日本語" },
  AUSTRALIA: { code: "en", name: "English", label: "English" },
  USA_OTHER: { code: "en", name: "English", label: "English" },
};

export function languageForRegion(region: string | null): { code: string; name: string; label: string } | null {
  if (!region) return null;
  const lang = REGION_LANGUAGE[region];
  if (!lang || lang.code === "en") return null; // 이미 영어면 번역할 필요가 없다.
  return lang;
}

// LevelTest.resultContentTranslatedLang(언어 코드)로 저장된 값을 화면에 보여줄
// 언어 이름으로 되돌린다 — 토글 버튼 라벨("한국어" 등)에 쓴다.
export function labelForLangCode(code: string | null): string | null {
  if (!code) return null;
  const entry = Object.values(REGION_LANGUAGE).find((l) => l.code === code);
  return entry?.label ?? null;
}

// 레벨테스트 결과 본문에서 그대로 유지해야 하는 구조적 표제/라벨 — 이 문자열들이
// 그대로 남아 있어야 LevelTestReportContent의 파서가 번역문에서도 영역별 색상
// 카드로 인식할 수 있다.
const PRESERVED_HEADINGS = [
  "Teacher Feedback",
  "Actual Utterances & Corrections",
  "Assessment Logic",
  "Path to Growth",
  "Home Connection",
  "Helpful questions include:",
  "Next Goal (Sneak Peek)",
  "Encouragement",
];

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// 강사가 영어로 작성한 레벨테스트 결과를 학생 거주지역 언어로 번역한다. 다음 두
// 가지는 절대 번역하지 않고 원문 그대로 남긴다 — ① 위 PRESERVED_HEADINGS 표제들
// (그래야 화면에서 여전히 영역별로 구조화되어 보인다) ② "Student: ..." /
// "Teacher: ..." 발화·교정 예문 자체(수정 전/후 영어 문장은 학습 내용 그 자체라
// 번역하면 학습 목적이 사라진다 — 이 부분만은 학생이 영어 그대로 읽어야 한다).
// API 호출이 실패하면(키 미설정, 네트워크 오류 등) null을 반환해 "번역 없음, 영어
// 원문만 표시"로 조용히 폴백한다 — 번역 실패가 결과 저장 자체를 막아서는 안 된다.
export async function translateLevelTestResult(content: string, targetLanguageName: string): Promise<string | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      system:
        `You translate an English-language English-tutoring progress report into ${targetLanguageName} for the student's family to read.\n\n` +
        `Rules:\n` +
        `1. Keep these exact section headings unchanged, verbatim, in English (do not translate or reformat them): ${PRESERVED_HEADINGS.map((h) => `"${h}"`).join(", ")}.\n` +
        `2. Keep any line starting with "Student:" or "Teacher:" completely unchanged in English, including the label itself — these are the student's actual English sentences and the teacher's corrections, which must stay in English for the student to study.\n` +
        `3. Translate everything else (narrative paragraphs, the quoted home-practice questions) into natural, warm ${targetLanguageName}, as if written by a caring teacher — not a literal word-for-word translation.\n` +
        `4. Preserve the original paragraph structure exactly: same blank-line breaks between paragraphs, same line breaks within a paragraph (e.g. between quoted questions, or between Student:/Teacher: pairs).\n` +
        `5. Output only the translated report text, nothing else — no preamble, no explanation.`,
      messages: [{ role: "user", content }],
    });
    const text = message.content.find((b) => b.type === "text");
    return text && text.type === "text" ? text.text.trim() : null;
  } catch {
    return null;
  }
}

// LevelTest(resultContent)와 LessonEvaluation(content) 양쪽 저장 액션이 동일하게 쓰는
// "번역을 다시 생성해야 하는가" 판단 — 원문이 실제로 바뀌었거나, 캐시된 번역의 언어가
// 지금 필요한 대상 언어와 다를 때만 다시 번역한다(그 외엔 API를 부르지 않고 기존 캐시를
// 그대로 유지). targetLangCode가 null이면(영어권이거나 거주지역 미입력) 애초에
// 번역하지 않는다.
export function shouldTranslate(params: {
  newContent: string;
  targetLangCode: string | null;
  previousContent: string | null;
  previousTranslatedLangCode: string | null;
}): boolean {
  if (!params.newContent || !params.targetLangCode) return false;
  return params.newContent !== params.previousContent || params.previousTranslatedLangCode !== params.targetLangCode;
}

// 데일리 평가서(LessonEvaluation.content)는 레벨테스트와 같은 이모지 서식
// (📘/📝/💬/✅/🌟, "- " 목록, ①②③ 교정 번호, ❌/✅)을 쓰지만 고정된 영어 표제 목록이
// 없다 — 강사가 이모지 뒤에 자유롭게 제목을 붙인다(admin/src/components/EvaluationContent.tsx
// 렌더러는 이모지 문자 자체로만 헤더를 인식하므로, 표제 "텍스트"는 번역해도 되고
// 이모지·기호만 줄 맨 앞에 그대로 남기면 된다). 그래서 PRESERVED_HEADINGS 같은 고정
// 표제 목록 대신 "이 마커들은 줄 맨 앞에 그대로 둔 채 뒤따르는 텍스트만 번역하라"는
// 규칙을 쓴다 — Student:/Teacher: 줄을 통째로 보존하는 규칙은 레벨테스트와 동일하다.
export async function translateLessonEvaluation(content: string, targetLanguageName: string): Promise<string | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      system:
        `You translate an English-language daily English-tutoring lesson evaluation into ${targetLanguageName} for the student's family to read.\n\n` +
        `Rules:\n` +
        `1. Keep any line starting with "Student:" or "Teacher:" completely unchanged in English, including the label itself — these are the student's actual English sentences and the teacher's corrections, which must stay in English for the student to study.\n` +
        `2. Some lines start with a fixed marker: an emoji section header (📘 📝 💬 🌟, or ✅/❌ used as a header), a "- " list bullet, a circled number (① ② ③ ④ ⑤ ⑥ ⑦ ⑧ ⑨ ⑩), or a ❌/✅ mark. Keep that marker exactly as-is at the start of the line, and translate only the text that follows it.\n` +
        `3. Translate everything else (narrative feedback, comments, instructions) into natural, warm ${targetLanguageName}, as if written by a caring teacher — not a literal word-for-word translation.\n` +
        `4. Preserve the original paragraph structure exactly: same blank-line breaks between paragraphs, same line breaks within a paragraph.\n` +
        `5. Output only the translated evaluation text, nothing else — no preamble, no explanation.`,
      messages: [{ role: "user", content }],
    });
    const text = message.content.find((b) => b.type === "text");
    return text && text.type === "text" ? text.text.trim() : null;
  } catch {
    return null;
  }
}
