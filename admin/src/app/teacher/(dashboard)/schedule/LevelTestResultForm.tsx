"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { saveLevelTestResult } from "./levelTestActions";

const MAX_LENGTH = 4000;

const PLACEHOLDER_TEMPLATE = `Write a short opening paragraph about the student's overall performance today...

Actual Utterances & Corrections

Student: I go to school yesterday.
Teacher: I went to school yesterday.

Assessment Logic

Explain why you're recommending this level...

Path to Growth

What you'll focus on next...

Home Connection

How the family can help at home...

Helpful questions include:

"What did you do after school?"
"Did you watch anything fun yesterday?"

Next Goal (Sneak Peek)

A short teaser of what's coming next...

Encouragement

A warm closing note to the student...`;

export type LevelTestResultDefaults = {
  recommendedLevel: string;
  recommendedTextbook: string;
  scoreListening: number | null;
  scoreSpeakingFluency: number | null;
  scoreSpeakingGrammar: number | null;
  scoreVocabulary: number | null;
  scoreCompletion: number | null;
  resultContent: string;
};

export function LevelTestResultForm({
  levelTestId,
  defaults,
  onSaved,
}: {
  levelTestId: number;
  defaults: LevelTestResultDefaults;
  onSaved?: () => void;
}) {
  const action = saveLevelTestResult.bind(null, levelTestId);
  const [state, formAction, pending] = useActionState(action, undefined);
  const [content, setContent] = useState(defaults.resultContent);
  const [listening, setListening] = useState(defaults.scoreListening);
  const [fluency, setFluency] = useState(defaults.scoreSpeakingFluency);
  const [grammar, setGrammar] = useState(defaults.scoreSpeakingGrammar);
  const [vocabulary, setVocabulary] = useState(defaults.scoreVocabulary);

  // 완성도/이해도는 강사가 따로 매기지 않고, 나머지 네 영역(듣기/말하기-유창성/
  // 말하기-문법/단어)의 평균을 자동으로 계산해 쓴다 — 넷 중 하나라도 비어 있으면
  // 아직 계산할 수 없으므로 null(레이더 차트에서도 이 값이 없으면 통째로 숨김).
  const completion = useMemo(() => {
    const scores = [listening, fluency, grammar, vocabulary];
    if (scores.some((s) => s == null)) return null;
    const sum = scores.reduce<number>((acc, s) => acc + s!, 0);
    return Math.round(sum / scores.length);
  }, [listening, fluency, grammar, vocabulary]);

  const overLimit = content.length > MAX_LENGTH;

  useEffect(() => {
    if (state?.success) onSaved?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-slate-600">Recommended Level (e.g. Lv3)</span>
          <input name="recommendedLevel" defaultValue={defaults.recommendedLevel} placeholder="Lv3" className="input" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-medium text-slate-600">Recommended Textbook</span>
          <input
            name="recommendedTextbook"
            defaultValue={defaults.recommendedTextbook}
            placeholder="OXFORD DISCOVER 2, 2ND EDITION"
            className="input"
          />
        </label>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-slate-600">Assessment scores (1~5)</p>
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
          <ScoreSelect name="scoreListening" label="Listening" value={listening} onChange={setListening} />
          <ScoreSelect name="scoreSpeakingFluency" label="Speaking Fluency" value={fluency} onChange={setFluency} />
          <ScoreSelect name="scoreSpeakingGrammar" label="Speaking Grammar" value={grammar} onChange={setGrammar} />
          <ScoreSelect name="scoreVocabulary" label="Vocabulary" value={vocabulary} onChange={setVocabulary} />
          <div className="flex flex-col gap-1 text-xs">
            <span className="font-medium text-slate-600">Completion (auto)</span>
            <div className="input flex items-center bg-slate-50 text-slate-500">{completion ?? "-"}</div>
          </div>
        </div>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-slate-600">Result notes</span>
        <p className="text-xs text-slate-400">
          Use these exact section headings (each on its own line, blank line before/after) so the result page can format
          them automatically: <strong>Teacher Feedback</strong> (opening paragraph, no heading needed),{" "}
          <strong>Actual Utterances &amp; Corrections</strong> (as <code>Student: ...</code> / <code>Teacher: ...</code>{" "}
          line pairs), <strong>Assessment Logic</strong>, <strong>Path to Growth</strong>, <strong>Home Connection</strong>{" "}
          (optionally followed by a <strong>Helpful questions include:</strong> line and a list of quoted questions),{" "}
          <strong>Next Goal (Sneak Peek)</strong>, <strong>Encouragement</strong>.
        </p>
        <textarea
          name="resultContent"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={14}
          placeholder={PLACEHOLDER_TEMPLATE}
          className={`w-full rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed outline-none focus:border-slate-500 ${
            overLimit ? "border-red-400" : "border-slate-300"
          }`}
        />
      </label>
      <p className={`text-right text-xs ${overLimit ? "font-semibold text-red-600" : "text-slate-400"}`}>
        {content.length} / {MAX_LENGTH} chars
      </p>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && !onSaved && <p className="text-sm font-semibold text-emerald-600">Saved.</p>}

      <button
        type="submit"
        disabled={pending || overLimit}
        className="w-fit rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}

function ScoreSelect({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-slate-600">{label}</span>
      <select
        name={name}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="input"
      >
        <option value="">-</option>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
