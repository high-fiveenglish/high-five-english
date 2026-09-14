// 레벨테스트 결과의 영역별 평가(듣기/말하기-유창성/말하기-문법/단어/완성도-이해도, 1~5점)를
// 오각형 레이더 차트로 보여준다 — admin(성장 리포트 디자인)과 정확히 같은 색상·좌표
// 계산을 쓴다(admin/src/components/LevelTestRadarChart.tsx와 동일하게 유지할 것).
// 다섯 값을 모두 받아야 하고, 하나라도 없으면 호출부에서 아예 렌더링하지 않는다.

export type LevelTestScores = {
  listening: number;
  speakingFluency: number;
  speakingGrammar: number;
  vocabulary: number;
  completion: number;
};

const AXES: { key: keyof LevelTestScores; label: string; color: string }[] = [
  { key: "listening", label: "듣기", color: "#3462a3" },
  { key: "speakingFluency", label: "말하기\n유창성", color: "#2f6b45" },
  { key: "speakingGrammar", label: "말하기\n문법", color: "#6b5b95" },
  { key: "vocabulary", label: "단어", color: "#b4693e" },
  { key: "completion", label: "완성도\n이해도", color: "#c98a2a" },
];

const SIZE = 280;
const CENTER = SIZE / 2;
const MAX_R = 95;
const MAX_SCORE = 5;

function vertex(index: number, radius: number) {
  const angle = (-90 + index * (360 / AXES.length)) * (Math.PI / 180);
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
}

function polygonPoints(radiusPerAxis: number[]) {
  return radiusPerAxis.map((r, i) => vertex(i, r)).map((p) => `${p.x},${p.y}`).join(" ");
}

export function LevelTestRadarChart({ scores }: { scores: LevelTestScores }) {
  const gridLevels = [1, 2, 3, 4, 5];
  const dataRadii = AXES.map((axis) => (scores[axis.key] / MAX_SCORE) * MAX_R);

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto w-full max-w-[320px]">
      {gridLevels.map((level) => (
        <polygon
          key={level}
          points={polygonPoints(AXES.map(() => (level / MAX_SCORE) * MAX_R))}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={1}
        />
      ))}
      {AXES.map((_, i) => {
        const p = vertex(i, MAX_R);
        return <line key={i} x1={CENTER} y1={CENTER} x2={p.x} y2={p.y} stroke="#e2e8f0" strokeWidth={1} />;
      })}

      <polygon points={polygonPoints(dataRadii)} fill="#3462a3" fillOpacity={0.18} stroke="#3462a3" strokeWidth={2.25} />
      {AXES.map((axis, i) => {
        const p = vertex(i, (scores[axis.key] / MAX_SCORE) * MAX_R);
        return <circle key={axis.key} cx={p.x} cy={p.y} r={4} fill={axis.color} />;
      })}

      {AXES.map((axis, i) => {
        const labelPos = vertex(i, MAX_R + 26);
        return (
          <text
            key={axis.key}
            x={labelPos.x}
            y={labelPos.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={12}
            fontWeight={700}
            fill="#475569"
          >
            {axis.label.split("\n").map((line, li) => (
              <tspan key={li} x={labelPos.x} dy={li === 0 ? 0 : 13}>
                {line}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}

// 결과 화면 상단에 함께 쓰는 범례 — vertical이면 차트 옆에 세로로 나란히 두는 성장
// 리포트 레이아웃용, 아니면 가로로 줄바꿈되는 기본형.
export function LevelTestRadarLegend({ scores, vertical }: { scores: LevelTestScores; vertical?: boolean }) {
  if (vertical) {
    return (
      <div className="flex flex-col gap-2.5">
        {AXES.map((axis) => (
          <div key={axis.key} className="flex items-center gap-2 text-sm text-slate-700">
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ backgroundColor: axis.color }} />
            <span>{axis.label.replace("\n", " ")}</span>
            <span className="ml-auto font-bold tabular-nums text-slate-900">{scores[axis.key]}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5">
      {AXES.map((axis) => (
        <div key={axis.key} className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: axis.color }} />
          {axis.label.replace("\n", " ")} <span className="font-bold text-slate-900">{scores[axis.key]}</span>
        </div>
      ))}
    </div>
  );
}
