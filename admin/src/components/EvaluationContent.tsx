// 평가서 본문을 문단 단위(빈 줄 구분)로 나눠 형식에 맞게 꾸며 보여준다. 강사가 작성하는
// 평가서는 이모지로 시작하는 제목/섹션 헤더(📘/📝/💬/✅/🌟), "- " 목록, 원문자 번호
// (①②③...)로 구분된 오류 교정 항목, ❌/✅로 대비되는 오답/정답 쌍이라는 정해진 형식을
// 따르므로, 이를 인식해 단순 줄바꿈 텍스트보다 읽기 좋게 렌더링한다. 이 형식과 다른
// 평가서(예전 데이터, 다른 강사가 자유롭게 쓴 글)가 와도 각 줄이 일반 문단으로만
// 표시될 뿐 깨지지는 않는다.
// 데일리 평가서(LessonEvaluation)뿐 아니라 레벨테스트 결과(LevelTest.resultContent)
// 등, 같은 이모지 서식을 쓰는 다른 결과 화면에서도 재사용한다.

const HEADER_EMOJIS = ["📘", "📝", "💬", "✅", "🌟"];
const CIRCLED_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

function startsWithAny(line: string, prefixes: string[]): boolean {
  return prefixes.some((p) => line.startsWith(p));
}

function BodyLine({ line }: { line: string }) {
  if (line.startsWith("- ")) {
    return <li className="ml-4 list-disc text-sm text-slate-700">{line.slice(2)}</li>;
  }
  if (startsWithAny(line, CIRCLED_NUMBERS)) {
    return <p className="mt-3 text-sm font-bold text-slate-900">{line}</p>;
  }
  if (line.startsWith("❌")) {
    return <p className="mt-1 text-sm text-red-600">{line}</p>;
  }
  if (line.startsWith("✅")) {
    return <p className="mt-1 text-sm text-emerald-600">{line}</p>;
  }
  if (line.startsWith("왜")) {
    return <p className="mt-1 text-sm italic text-slate-500">{line}</p>;
  }
  return <p className="text-sm leading-relaxed text-slate-700">{line}</p>;
}

function Paragraph({ lines, isFirst }: { lines: string[]; isFirst: boolean }) {
  const [first, ...rest] = lines;

  // 최상단 문단의 첫 줄(📘 제목)은 본문과 구분되는 큰 제목으로 표시한다.
  if (isFirst) {
    return <h2 className="text-base font-bold text-slate-900">{first}</h2>;
  }

  // 이모지로 시작하는 첫 줄은 섹션 헤더로 취급한다(❌는 오답 표시이므로 헤더 후보에서 제외).
  const isHeader = startsWithAny(first, HEADER_EMOJIS) && !first.startsWith("❌");
  const bodyLines = isHeader ? rest : lines;
  const listItems = bodyLines.filter((l) => l.startsWith("- "));
  const nonListLines = bodyLines.filter((l) => !l.startsWith("- "));

  return (
    <div className={isHeader ? "mt-5" : "mt-3"}>
      {isHeader && <p className="mb-2 text-sm font-bold text-slate-900">{first}</p>}
      {listItems.length > 0 && <ul className="flex flex-col gap-1">{listItems.map((l, i) => <BodyLine key={i} line={l} />)}</ul>}
      {nonListLines.map((l, i) => (
        <BodyLine key={i} line={l} />
      ))}
    </div>
  );
}

export function EvaluationContent({ content }: { content: string }) {
  const paragraphs = content
    .split(/\n\s*\n/)
    .map((p) => p.split("\n").filter((l) => l.trim() !== ""))
    .filter((lines) => lines.length > 0);

  if (paragraphs.length === 0) return null;

  return (
    <div className="flex flex-col">
      {paragraphs.map((lines, i) => (
        <Paragraph key={i} lines={lines} isFirst={i === 0} />
      ))}
    </div>
  );
}
