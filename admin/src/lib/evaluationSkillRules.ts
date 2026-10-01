// SOURCE: online-english-feedback (Claude Code plugin skill)
// RUNTIME: Production snapshot — a manual, one-time extraction of the parts of that
// skill a server-side Anthropic API call actually needs, NOT a live/auto-synced copy.
// The source skill lives outside this repo (Claude Desktop plugin skills dir, not
// reachable from the deployed Netlify runtime — see .../skills-plugin/.../skills/
// online-english-feedback/SKILL.md, 443 lines) and the two are not mechanically kept
// in sync: if the source skill changes, this file must be updated by hand to match.
//
// This file is NOT a new evaluation standard — it is an extraction of the parts of
// that skill actually needed by a server-side Anthropic API call. Omitted on purpose:
// Claude-Code-agent-only workflow instructions (read-transcript-first, "ask the user
// which language" — production already knows the language via languageForRegion(),
// "present as two chat blocks without wrapper labels" — production stores into DB
// fields instead of pasting into a chat). The skill's content/structure/tone/grounding
// rules are reproduced here as closely as practical.
//
// Deliberate production-specific overrides from the skill's own text — see each
// constant's comment for exactly what changed and why:
//   1. Talk Time: the skill says to ESTIMATE it from transcript turn length. Production
//      has exact AssemblyAI speaker timestamps, so TALK_TIME_OVERRIDE_RULE replaces the
//      skill's estimation instruction — the measured value is given as fact.
//   2. Output 1 language: the skill writes Output 1 directly in the student's language.
//      Production generates it in English and reuses the existing bilingual pipeline
//      (languageForRegion/shouldTranslate/translateLessonEvaluation) to localize it at
//      publish time — see aiEvaluation.ts.
//   3. Thai (ภาษาไทย) is in the skill's supported-language list but the LMS's
//      ResidenceRegion enum has no Thai equivalent, so it's dropped here — not invented.

export const GROUNDING_RULES = `
Ground everything in the transcript. Never invent vocabulary, corrections, or quotes
that aren't actually there. Never fabricate a number that looks precise when the
transcript doesn't actually give you a clear signal — if a field's evidence is weak or
absent, say so explicitly rather than inventing it. Only create a correction entry for
an error the student actually said, verbatim.
`.trim();

// 수업 중 산만함/불성실 메모(선택) — Skill 원문: 아동/청소년에게만, "지적"이 아니라
// "참고용 안내"로 짧게 프레이밍, 패턴이 아닌 사소한 일회성은 포함하지 않음.
export const ATTITUDE_NOTE_RULE = `
If the transcript shows the student genuinely not following instructions, being
distracted, or otherwise showing a real pattern of poor classroom attitude, you may
include one short, gentle note about it — framed as a helpful heads-up for the parent,
never as a complaint, and only for child/teen learners (never for adult learners).
Don't invent or exaggerate it, and don't include it for minor, normal fidgeting that
isn't actually a pattern. If included, keep it to 1-2 sentences, placed near the end,
right before the closing encouragement.
`.trim();

// ============================================================================
// AGE BAND — PROJECT POLICY, NOT SOURCE SKILL RULE
// ============================================================================
// The skill's own text defines three learner profiles (child/"student"-teen/adult)
// but infers them from TRANSCRIPT CONTENT (textbook vocabulary, "mommy/daddy"
// references, workplace topics, etc.) — it never states a numeric age cutoff
// anywhere in its 443 lines. Production instead has Student.birthDate and computes
// an exact age, so numeric cutoffs are unavoidable to pick an age band — but those
// specific numbers (13, 19) are THIS PROJECT'S decision, not something lifted from
// the skill. Do not describe them to anyone as "the skill's age rule." If this
// project's age policy needs to change, edit AGE_BAND_POLICY below; it is
// deliberately kept separate from the skill-derived constants above/below it.
export const AGE_BAND_POLICY = {
  /** Below this age → "child". Ordinary convention (elementary-age), not from the skill. */
  CHILD_MAX_AGE: 12,
  /** Below this age (and >= CHILD_MAX_AGE+1) → "teen". Not from the skill. */
  TEEN_MAX_AGE: 18,
} as const;

export type AgeBand = "child" | "teen" | "adult" | "unknown";

/** AI가 transcript만 보고 나이를 추측하지 않도록, 코드가 Student.birthDate로 계산한
 * 결과를 prompt에 "주어진 사실"로 전달하기 위한 함수. 숫자 기준은 AGE_BAND_POLICY
 * 참고(skill 규칙 아님). */
export function ageBandFromBirthDate(birthDate: Date | null, now: Date = new Date()): AgeBand {
  if (!birthDate) return "unknown";
  let age = now.getFullYear() - birthDate.getFullYear();
  const beforeBirthdayThisYear =
    now.getMonth() < birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() && now.getDate() < birthDate.getDate());
  if (beforeBirthdayThisYear) age -= 1;
  if (age <= AGE_BAND_POLICY.CHILD_MAX_AGE) return "child";
  if (age <= AGE_BAND_POLICY.TEEN_MAX_AGE) return "teen";
  return "adult";
}

export function ageToneInstruction(band: AgeBand): string {
  switch (band) {
    case "child":
      return `Learner profile: CHILD (elementary-age). Write Output 1 in 3rd person about the
child, addressed to the parent, in the register of a teacher's progress note to a
fellow adult — not baby-talk, not written as if speaking to the child. Specific and
factual, not cutesy or over-exclaimed.`;
    case "teen":
      return `Learner profile: TEEN. Write Output 1 still addressed to the parent, 3rd person,
same professional progress-note register as for a child, but achievement-framed
(study habits, areas to reinforce) rather than playful.`;
    case "adult":
      return `Learner profile: ADULT. Write Output 1 addressed directly to the learner, 2nd
person, professional-warm. Do not use any parent-addressed framing.`;
    case "unknown":
      // Skill 원문의 공식 fallback: "신호가 불명확하면 학습자를 주 대상으로(성인 방식,
      // 직접 호칭) 취급하고, 그 가정을 (리포트 밖에서) 짧게 알린다" — age band가
      // unknown일 때도 동일하게 적용한다.
      return `Learner profile: UNKNOWN (no birthDate on file). Default to ADULT-style direct
address (2nd person, no parent framing) per the skill's own fallback rule for
ambiguous cases. This is an assumption, not a confirmed fact.`;
  }
}

// Talk Time — Skill의 "turn length로 estimate" 지시를 production에서는 명시적으로
// 대체한다. 애플리케이션이 AssemblyAI 화자 타임스탬프로 계산한 값을 사실로 전달한다.
export function talkTimeOverrideBlock(params: {
  teacherSeconds: number;
  teacherPercentage: number;
  studentSeconds: number;
  studentPercentage: number;
}): string {
  return `
SYSTEM-MEASURED TALK TIME (do not estimate or recalculate):
Teacher: ${params.teacherSeconds}s (${params.teacherPercentage}%)
Student: ${params.studentSeconds}s (${params.studentPercentage}%)
These values were calculated by the application from speaker timestamps. Treat them as
authoritative facts and use them as-is wherever Output 1 or Output 2 needs a talk-time
figure. Do not estimate, recompute, or second-guess them from the transcript text.

Note for Output 2 only: the mapping of "speaker A/B" to "teacher/student" used to
produce these numbers is an UNVERIFIED HEURISTIC (first speaker assumed to be the
teacher) pending real-recording validation — if anything in the transcript suggests
the mapping looks backwards, say so explicitly in Output 2's Pacing & Engagement
section rather than silently trusting or silently ignoring it.
`.trim();
}

// Output 1 — 학생/학부모용. Skill의 섹션 구조·문체 규칙 그대로(날짜/언어 선택 관련
// 지시는 production 쪽에서 이미 결정되므로 제외). Canonical 언어는 영어(아래 참고).
export const STUDENT_FEEDBACK_RULES = `
Write Output 1: a parent/student-facing daily feedback report, in English (English is
the canonical draft language regardless of the student's eventual display language —
the existing LMS translation pipeline localizes it after publish, not this step).

Tone: warm but professional — a tutor's progress note to an adult (the parent, or the
adult learner), never baby-talk. Reference specific things the student actually said
or did. Avoid generic praise ("good job!") without a specific moment backing it up.
Never reuse a fixed, template-sounding opening or closing line — each report's
opening/closing should be freshly grounded in this specific transcript.

Use plain text only — no markdown (no **bold**, no # headers, no tables). Use emojis
only as section markers (📘 📝 💬 ✅ 🌟), one per section line.

Structure, in this exact order:

📘 [Date] Today's Class Feedback — [Topic]
[3-5 sentences, scaled to class length: open with a specific detail from this class
(not a generic scene-setter), cover the lesson's main topic/goal and what the student
actually practiced, so the reader gets a sense of the whole class.]

📝 Today's Lesson Content
- [Activity/segment — one line each, 2-5 lines depending on class length, the
  specific things actually done, not a generic label]

💬 Key Expressions Covered
- [Word/Phrase] — [meaning]
  Example: [student's own example sentence, or the tutor's model if the student
  didn't produce one]
  [One specific line on how well the student understood/used it — vary this per
  item, don't praise every item identically]
(3-7 items depending on class length)

✅ A Few Things to Polish
[One sentence normalizing these as a natural part of learning.]
① [short label for the error type]: [original] → [corrected]
❌ [student's original sentence, verbatim from the transcript]
✅ [corrected sentence]
Why this happened:
[Plain-language grammar explanation. When the error is a pattern the student will
hit again (subject-verb agreement, tense, articles, word order, etc.), show the
pattern explicitly — e.g. a short person-by-person or tense comparison — not just
"this is wrong." If a second, smaller error is bundled into the same sentence, note
it in the same explanation rather than as a separate numbered item.]
(2-4 items, only genuine ones from the transcript — depth over count)

🌟 What [Student] Really Nailed Today
[Quote a specific thing the student produced spontaneously — their own attempt at
expressing an idea, not just a correct textbook answer. Explain concretely why that
attempt matters. Acknowledge any grammar issues in the quoted attempt honestly, but
frame the attempt itself as the win. Close with one concrete, small practice
suggestion tied to today's actual mistakes. 2-4 sentences.]
`.trim();

// Output 2 — 강사 QC 평가. 항상 영어, 학생에게 노출되지 않음.
export const TEACHER_QC_RULES = `
Write Output 2: a Teacher QC / Evaluation report, always in English, addressed
directly to the tutor ("you") — a frank performance evaluation, not encouragement.
Tone: professional, objective, improvement-focused, but frame issues as constructive
coaching. No emojis, no markdown.

Structure, in this exact order:

Tutor Evaluation — [Date] — [Tutor name if known, else "Tutor"]

1. Talk Time Ratio: Teacher [X]% / Student [Y]% (use the SYSTEM-MEASURED value given
   to you — do not estimate)
2. Pacing & Engagement: [on-time start, awkward silences, interruptions, time lost to
   non-lesson activity — Pass or Needs Review, with a specific reason. Don't penalize
   genuinely productive free-talk/warm-up time; only flag it if it was unproductive
   filler that didn't teach anything.]
3. Teaching Quality: [1-5] / 5
   - Rationale: [2-3 specific sentences on questioning technique and feedback style,
     citing what actually happened. 5 = open-ended questions, specific in-the-moment
     corrective feedback, adapts to the student, natural pacing. 3-4 = solid but some
     missed correction opportunities or generic questioning. 1-2 = minimal engagement,
     mostly closed yes/no questions, missed obvious errors. Don't default to 5 out of
     politeness — use the full range honestly based on transcript evidence.]
4. Student Participation: [full sentences vs. one-word answers, initiated topics,
   asked questions, tried the target language unprompted — cite specific moments]
5. Error Correction: [did the tutor catch and correct errors in the moment, or let
   them slide? Were corrections clear, did the tutor confirm understanding? Note any
   missed correction opportunities.]
6. Questioning & Interaction: [open-ended vs. closed questions, follow-up questions,
   wait time given, whether the tutor built on what the student said]
7. Lesson Structure: [warm-up / main material / wrap-up organization, smoothness of
   transitions, sensible time allocation]
8. Strengths: [1-3 specific things the tutor did well, citing what actually happened]
9. Areas for Improvement: [1-3 concrete, specific issues — include at least one even
   for a strong lesson, unless the lesson is genuinely flawless]
10. Recommended Follow-up Actions: [1-3 concrete next steps for the tutor]
`.trim();
