import { ALL_INTEREST_TOPIC_OPTIONS, TERMINAL_PROGRESS_STATUSES } from "@/lib/levelTestOptions";
import { LevelTestReportToggle } from "./LevelTestReportToggle";
import { LevelTestRadarChart, LevelTestRadarLegend } from "./LevelTestRadarChart";

const INTEREST_TOPIC_LABEL: Record<string, string> = Object.fromEntries(
  ALL_INTEREST_TOPIC_OPTIONS.map((o) => [o.value, o.label]),
);

function attendanceLabel(progressStatus: string | null): string {
  if (progressStatus === "수업완료") return "출석";
  if (progressStatus === "결석") return "결석";
  if ((TERMINAL_PROGRESS_STATUSES as readonly string[]).includes(progressStatus ?? "")) return progressStatus!;
  return "테스트 전";
}

export type LevelTestResultData = {
  name: string;
  englishName: string | null;
  testDate: string | null;
  teacherName: string | null;
  progressStatus: string | null;
  interestTopic: string | null;
  recommendedLevel: string | null;
  recommendedTextbook: string | null;
  scoreListening: number | null;
  scoreSpeakingFluency: number | null;
  scoreSpeakingGrammar: number | null;
  scoreVocabulary: number | null;
  scoreCompletion: number | null;
  resultContent: string | null;
  resultContentTranslated: string | null;
  translatedLangLabel: string | null;
};

// 레벨테스트 결과 화면 본문 — 관리자용 미리보기와 학생용 실제 화면이 완전히 같은
// 레이아웃을 쓰도록 공용 컴포넌트로 뺐다(둘이 달라지면 "미리보기"라는 말이 거짓이 된다).
// "성장 리포트" 시안 — 진한 헤더 밴드 + 추천 레벨/교재 타일 + 레이더 차트 + 영역별
// 색상 코드 리포트 순서로 구성한다.
export function LevelTestResultView({ data }: { data: LevelTestResultData }) {
  const scores =
    data.scoreListening != null &&
    data.scoreSpeakingFluency != null &&
    data.scoreSpeakingGrammar != null &&
    data.scoreVocabulary != null &&
    data.scoreCompletion != null
      ? {
          listening: data.scoreListening,
          speakingFluency: data.scoreSpeakingFluency,
          speakingGrammar: data.scoreSpeakingGrammar,
          vocabulary: data.scoreVocabulary,
          completion: data.scoreCompletion,
        }
      : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-6 bg-[#232b26] px-6 py-8 text-[#f2f4f0] sm:px-10">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9fb0a3]">Level Test Result</span>
          <h2 className="font-display text-3xl font-semibold text-balance">
            {data.name}
            {data.englishName && <span className="ml-2 text-lg font-normal text-[#c7d2c9]">({data.englishName})</span>}
          </h2>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <BandMeta label="테스트일" value={data.testDate ?? "-"} />
          <BandMeta label="담당 강사" value={data.teacherName ?? "-"} />
          <BandMeta label="출석" value={attendanceLabel(data.progressStatus)} />
          <BandMeta
            label="관심분야"
            value={data.interestTopic ? (INTEREST_TOPIC_LABEL[data.interestTopic] ?? data.interestTopic) : "-"}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 divide-y divide-slate-100 border-b border-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <div className="px-6 py-5 sm:px-10">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#3462a3]">추천 레벨</p>
          <p className="font-display text-2xl font-semibold text-[#1c2a3d]">{data.recommendedLevel || "미정"}</p>
        </div>
        <div className="px-6 py-5 sm:px-10">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#8a5a1f]">추천 교재</p>
          <p className="text-[17px] font-semibold text-[#2f2417]">{data.recommendedTextbook || "미정"}</p>
        </div>
      </div>

      {scores && (
        <div className="grid grid-cols-1 items-center gap-8 border-b border-slate-100 px-6 py-8 sm:grid-cols-[220px_1fr] sm:px-10">
          <LevelTestRadarChart scores={scores} />
          <LevelTestRadarLegend scores={scores} vertical />
        </div>
      )}

      <div className="px-6 py-6 sm:px-10">
        {data.resultContent ? (
          <LevelTestReportToggle
            englishContent={data.resultContent}
            translatedContent={data.resultContentTranslated}
            translatedLangLabel={data.translatedLangLabel}
          />
        ) : (
          <p className="text-sm text-slate-400">아직 작성된 결과가 없습니다.</p>
        )}
      </div>
    </div>
  );
}

function BandMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] uppercase tracking-wider text-[#9fb0a3]">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}
