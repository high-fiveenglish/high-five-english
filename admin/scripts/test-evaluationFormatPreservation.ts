// EvaluationContent.tsx의 줄 분류 로직(어떤 줄이 헤더/목록/오답/정답/일반 문단으로
// 렌더링되는지)을 그대로 복제해, "번역 전 영어 원문"과 "번역 후(가정) 텍스트"를 같은
// 로직에 통과시켜 분류 결과(block-type 시퀀스)가 동일한지 비교한다. React 컴포넌트를
// 실제로 렌더링하지는 않는다(admin 앱엔 별도 테스트 러너/DOM 환경이 없음) — 대신
// admin/src/components/EvaluationContent.tsx와 정확히 동일한 문자열 판별 규칙만
// 그대로 옮겨와 순수 함수로 검증한다. 이 스크립트는 DB/네트워크를 전혀 쓰지 않는다.
//
// EvaluationContent.tsx와 규칙이 달라지면 이 스크립트도 반드시 같이 고쳐야 한다.
const HEADER_EMOJIS = ["📘", "📝", "💬", "✅", "🌟"];
const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

function startsWithAny(line: string, prefixes: string[]): boolean {
  return prefixes.some((p) => line.startsWith(p));
}

type LineKind = "title" | "header" | "list-item" | "circled" | "wrong" | "correct" | "why" | "plain";

function classifyLine(line: string, isFirstLineOfFirstParagraph: boolean): LineKind {
  if (isFirstLineOfFirstParagraph) return "title";
  if (line.startsWith("- ")) return "list-item";
  if (startsWithAny(line, CIRCLED_NUMBERS)) return "circled";
  if (line.startsWith("❌")) return "wrong";
  if (line.startsWith("✅")) return "correct";
  if (line.startsWith("왜")) return "why";
  return "plain";
}

// Paragraph의 첫 줄이 헤더인지 판정하는 규칙(❌ 제외)도 EvaluationContent.tsx와 동일하게 복제.
function isHeaderFirstLine(line: string): boolean {
  return startsWithAny(line, HEADER_EMOJIS) && !line.startsWith("❌");
}

function classifyContent(content: string): string[] {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.split("\n").filter((l) => l.trim() !== ""))
    .filter((lines) => lines.length > 0);

  const result: string[] = [];
  paragraphs.forEach((lines, pi) => {
    if (pi === 0) {
      result.push(`title:${classifyLine(lines[0], true) === "title" ? "OK" : "?"}`);
      lines.slice(1).forEach((l) => result.push(`p0-body:${classifyLine(l, false)}`));
      return;
    }
    const first = lines[0];
    if (isHeaderFirstLine(first)) {
      // 헤더 "텍스트"는 번역되므로 비교 대상에서 제외한다 — 여기서 검증하려는 건
      // "헤더로 분류되는가"(block-type)이지 텍스트 내용의 동일성이 아니다.
      result.push("header");
      lines.slice(1).forEach((l) => result.push(classifyLine(l, false)));
    } else {
      lines.forEach((l) => result.push(classifyLine(l, false)));
    }
  });
  return result;
}

type Sample = { label: string; original: string; translatedKo: string };

const SAMPLES: Sample[] = [
  {
    label: "1. 헤더 + 일반 문단 + Student/Teacher 교정 쌍",
    original: [
      "📘 Today's Focus: Past Tense Storytelling",
      "",
      "We practiced retelling a short story using past tense verbs. Minji did a great job staying engaged for the full 25 minutes.",
      "",
      "Student: The prince was dance with her.",
      "Teacher: The prince was dancing with her.",
    ].join("\n"),
    translatedKo: [
      "📘 오늘의 초점: 과거시제로 이야기하기",
      "",
      "짧은 이야기를 과거시제 동사로 다시 말해보는 연습을 했습니다. 민지는 25분 내내 집중력을 잘 유지했어요.",
      "",
      "Student: The prince was dance with her.",
      "Teacher: The prince was dancing with her.",
    ].join("\n"),
  },
  {
    label: "2. 이모지 헤더 + '- ' 목록",
    original: [
      "📝 Vocabulary Covered",
      "",
      "- adventure",
      "- discover",
      "- treasure",
    ].join("\n"),
    translatedKo: [
      "📝 오늘 배운 단어",
      "",
      "- adventure",
      "- discover",
      "- treasure",
    ].join("\n"),
  },
  {
    label: "3. ①②③ 교정 번호 + ❌/✅ 오답·정답 쌍",
    original: [
      "💬 Corrections",
      "",
      "① Subject-verb agreement",
      "❌ She don't like apples.",
      "✅ She doesn't like apples.",
    ].join("\n"),
    translatedKo: [
      "💬 교정 사항",
      "",
      "① 주어-동사 일치",
      "❌ She don't like apples.",
      "✅ She doesn't like apples.",
    ].join("\n"),
  },
  {
    label: "4. 격려 헤더(🌟) + 일반 문단만",
    original: [
      "🌟 Encouragement",
      "",
      "You are becoming more confident in using English to communicate your ideas. Keep up the great work!",
    ].join("\n"),
    translatedKo: [
      "🌟 격려의 말씀",
      "",
      "영어로 자신의 생각을 표현하는 데 점점 더 자신감이 생기고 있습니다. 계속 열심히 해봐요!",
    ].join("\n"),
  },
  {
    label: "5. 제목 문단 + 여러 섹션 혼합(헤더/목록/Student-Teacher/격려)",
    original: [
      "📘 Class Summary",
      "",
      "Great session overall.",
      "",
      "📝 Vocabulary",
      "- brave",
      "- journey",
      "",
      "Student: I goed to school yesterday.",
      "Teacher: I went to school yesterday.",
      "",
      "🌟 Encouragement",
      "Amazing effort today, see you next class!",
    ].join("\n"),
    translatedKo: [
      "📘 수업 요약",
      "",
      "전반적으로 아주 좋은 수업이었습니다.",
      "",
      "📝 어휘",
      "- brave",
      "- journey",
      "",
      "Student: I goed to school yesterday.",
      "Teacher: I went to school yesterday.",
      "",
      "🌟 격려의 말씀",
      "오늘 정말 열심히 했어요, 다음 수업에서 봐요!",
    ].join("\n"),
  },
];

let pass = 0;
let fail = 0;

for (const sample of SAMPLES) {
  const before = classifyContent(sample.original);
  const after = classifyContent(sample.translatedKo);
  const structureMatches = JSON.stringify(before) === JSON.stringify(after);

  // Student:/Teacher: 줄이 원문 그대로 보존됐는지(영어 학습 내용이므로 번역되면 안 됨)
  const studentTeacherLines = sample.original
    .split("\n")
    .filter((l) => /^(Student|Teacher):/.test(l));
  const preservedVerbatim = studentTeacherLines.every((l) => sample.translatedKo.includes(l));

  if (structureMatches && preservedVerbatim) {
    pass++;
    console.log(`PASS: ${sample.label}`);
  } else {
    fail++;
    console.error(`FAIL: ${sample.label}`);
    if (!structureMatches) {
      console.error(`  구조 불일치\n  before=${JSON.stringify(before)}\n  after =${JSON.stringify(after)}`);
    }
    if (!preservedVerbatim) {
      console.error(`  Student:/Teacher: 줄이 번역 후 원문 그대로 보존되지 않음`);
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
