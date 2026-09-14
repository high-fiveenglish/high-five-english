// 레벨테스트 결과 서술(resultContent)을 정해진 8개 항목(Teacher Feedback /
// Actual Utterances & Corrections / Assessment Logic / Path to Growth /
// Home Connection(+Helpful questions include:) / Next Goal (Sneak Peek) /
// Encouragement) 구조로 파싱해 영역별 색상 카드로 나눠 보여준다 — admin(성장 리포트
// 디자인)의 LevelTestReportContent와 정확히 같은 파서/색상을 쓴다. 강사가 이 8개
// 표제를 그대로 문단 제목으로 입력하는 것을 전제로 하며, 표제가 안 보이면 그 문단은
// 통째로 "Teacher Feedback" 아래 본문으로 들어가고, 인식 못한 줄 구성도 평문으로만
// 표시될 뿐 깨지지 않는다.

type Block =
  | { type: "p"; text: string }
  | { type: "label"; text: string }
  | { type: "list"; items: string[] }
  | { type: "pairs"; pairs: { student: string; teacher: string }[] };

export type LevelTestReportSection = {
  key: string;
  title: string;
  color: string;
  blocks: Block[];
};

const SECTION_DEFS: { key: string; title: string; color: string; match: RegExp }[] = [
  { key: "feedback", title: "Teacher Feedback", color: "#3462a3", match: /^teacher feedback$/i },
  { key: "utterances", title: "Actual Utterances & Corrections", color: "#c1554a", match: /^actual utterances\s*(&|and)\s*corrections$/i },
  { key: "logic", title: "Assessment Logic", color: "#6b5b95", match: /^assessment logic$/i },
  { key: "growth", title: "Path to Growth", color: "#4b7a51", match: /^path to growth$/i },
  { key: "home", title: "Home Connection", color: "#b4693e", match: /^home connection$/i },
  { key: "next", title: "Next Goal (Sneak Peek)", color: "#3d8fa0", match: /^next goal(\s*\(sneak peek\))?$/i },
  { key: "encouragement", title: "Encouragement", color: "#c98a2a", match: /^encouragement$/i },
];

function isQuotedLine(line: string): boolean {
  return /^[“"'][\s\S]*[”"']$/.test(line.trim());
}

function stripQuotes(line: string): string {
  return line.trim().replace(/^[“"']/, "").replace(/[”"']$/, "");
}

export function parseLevelTestReport(content: string): LevelTestReportSection[] {
  const paragraphs = content
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0);

  const sections: LevelTestReportSection[] = [];
  let current: LevelTestReportSection | null = null;
  let expectingList = false;

  function ensureCurrent(): LevelTestReportSection {
    if (!current) {
      current = { key: "feedback", title: "Teacher Feedback", color: "#3462a3", blocks: [] };
      sections.push(current);
    }
    return current;
  }

  for (const lines of paragraphs) {
    if (lines.length === 1) {
      const def = SECTION_DEFS.find((d) => d.match.test(lines[0]));
      if (def) {
        current = { key: def.key, title: def.title, color: def.color, blocks: [] };
        sections.push(current);
        expectingList = false;
        continue;
      }
      if (/^helpful questions include:?$/i.test(lines[0])) {
        ensureCurrent().blocks.push({ type: "label", text: "Helpful questions include:" });
        expectingList = true;
        continue;
      }
    }

    if (expectingList) {
      ensureCurrent().blocks.push({ type: "list", items: lines.map(isQuotedLine).some(Boolean) ? lines.map(stripQuotes) : lines });
      expectingList = false;
      continue;
    }

    if (lines.length >= 2 && lines.every((l) => /^(student|teacher)\s*:/i.test(l))) {
      const pairs: { student: string; teacher: string }[] = [];
      for (let i = 0; i < lines.length - 1; i += 2) {
        pairs.push({
          student: lines[i].replace(/^student\s*:\s*/i, ""),
          teacher: (lines[i + 1] ?? "").replace(/^teacher\s*:\s*/i, ""),
        });
      }
      ensureCurrent().blocks.push({ type: "pairs", pairs });
      continue;
    }

    ensureCurrent().blocks.push({ type: "p", text: lines.join(" ") });
  }

  return sections;
}

export function LevelTestResultContent({ content }: { content: string }) {
  const sections = parseLevelTestReport(content);
  if (sections.length === 0) return null;

  return (
    <div className="flex flex-col">
      {sections.map((sec, i) => {
        const isLast = sec.key === "encouragement";
        return (
          <div
            key={i}
            className={
              isLast
                ? "-mx-5 mt-1 grid grid-cols-1 gap-3 rounded-b-2xl bg-amber-50 px-5 py-6 sm:mx-0 sm:grid-cols-[168px_1fr] sm:gap-6 sm:rounded-2xl"
                : "grid grid-cols-1 gap-3 border-t border-slate-100 py-5 first:border-0 first:pt-0 sm:grid-cols-[168px_1fr] sm:gap-6"
            }
          >
            <div className="flex items-start gap-2.5">
              <span className="mt-1.5 h-2 w-2 flex-none rounded-full" style={{ backgroundColor: sec.color }} />
              <h3 className="text-[14.5px] font-bold leading-snug text-slate-900">{sec.title}</h3>
            </div>
            <div className="flex flex-col gap-2.5">
              {sec.blocks.map((b, bi) => {
                if (b.type === "p") {
                  return (
                    <p key={bi} className={`text-[14.5px] leading-relaxed ${isLast ? "font-medium text-amber-950" : "text-slate-700"}`}>
                      {b.text}
                    </p>
                  );
                }
                if (b.type === "label") {
                  return (
                    <p key={bi} className="text-[11px] font-bold uppercase tracking-wide" style={{ color: sec.color }}>
                      {b.text}
                    </p>
                  );
                }
                if (b.type === "list") {
                  return (
                    <ul key={bi} className="flex flex-col gap-1.5 pl-4">
                      {b.items.map((item, ii) => (
                        <li key={ii} className="list-disc text-[14.5px] leading-relaxed text-slate-700">
                          {item}
                        </li>
                      ))}
                    </ul>
                  );
                }
                if (b.type === "pairs") {
                  return (
                    <div key={bi} className="flex flex-col gap-2">
                      {b.pairs.map((p, pi) => (
                        <div key={pi} className="rounded-lg bg-slate-50 px-3 py-2 text-[13.5px] leading-relaxed">
                          <span className="text-rose-500 line-through decoration-rose-300">{p.student}</span>
                          <span className="mx-1.5 text-slate-400">→</span>
                          <span className="font-semibold text-emerald-700">{p.teacher}</span>
                        </div>
                      ))}
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
