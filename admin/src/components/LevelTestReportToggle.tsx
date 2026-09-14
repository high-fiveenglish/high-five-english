"use client";

import { useState } from "react";
import { LevelTestReportContent } from "./LevelTestReportContent";

// 번역본이 있으면 학생 언어를 기본으로 보여주고, 강사가 쓴 영어 원문도 버튼 하나로
// 바로 전환해 볼 수 있게 한다. 번역본이 없으면(영어권 학생이거나 아직 번역이 안 된
// 경우) 그냥 영어 원문만 보여준다 — 토글 자체를 렌더링하지 않는다.
export function LevelTestReportToggle({
  englishContent,
  translatedContent,
  translatedLangLabel,
}: {
  englishContent: string;
  translatedContent: string | null;
  translatedLangLabel: string | null;
}) {
  const hasTranslation = Boolean(translatedContent && translatedLangLabel);
  const [showEnglish, setShowEnglish] = useState(!hasTranslation);

  if (!hasTranslation) {
    return <LevelTestReportContent content={englishContent} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setShowEnglish(false)}
          className={`rounded-full px-3.5 py-1.5 transition-colors ${
            !showEnglish ? "bg-[#232b26] text-white" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {translatedLangLabel}
        </button>
        <button
          type="button"
          onClick={() => setShowEnglish(true)}
          className={`rounded-full px-3.5 py-1.5 transition-colors ${
            showEnglish ? "bg-[#232b26] text-white" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          English (원문)
        </button>
      </div>
      <LevelTestReportContent content={showEnglish ? englishContent : translatedContent!} />
    </div>
  );
}
