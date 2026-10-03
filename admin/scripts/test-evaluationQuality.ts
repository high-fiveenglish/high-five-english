// Regression tests for the AI evaluation quality work (speaker-labeled input, grounding validators, regeneration).
// No network, no database: the Anthropic call is replaced by an injected fake. The lesson below is SYNTHETIC — it
// reproduces the failure patterns seen in real-audio testing (read-aloud passage, invented quote, invented
// duration, duplicated report, "you" in a teen report, a teacher quote that mentions a month) without any real data.
import crypto from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { generateAIEvaluationDraft, type CreateMessageFn } from "../src/lib/aiEvaluation";
import { processRecording, type ProcessRecordingDeps } from "../src/lib/recordingProcessing";
import {
  buildProjectRules,
  checkNoUngroundedHistoricalClaims,
  classLengthProfile,
  talkTimeOverrideBlock,
} from "../src/lib/projectEvaluationRules";
import {
  checkLearnerAddressing,
  checkNoDuplicateStructure,
  checkQuotesAndReading,
  checkSkillStructureLimits,
  checkStudentReportHygiene,
  checkTutorStudentTimestamps,
  checkTalkTimeFigures,
  checkTimeGrounding,
  validateEvaluationOutput,
  type ValidationContext,
} from "../src/lib/evaluationValidation";
import { describeSpeakerMapping, formatTimestamp, renderSpeakerTranscript, toRoleUtterances } from "../src/lib/speakerTranscript";
import { computeTalkTime, guessTeacherSpeakerLabel, type Utterance } from "../src/lib/talkTime";
import { ONLINE_ENGLISH_FEEDBACK_SKILL, ONLINE_ENGLISH_FEEDBACK_SKILL_META } from "../src/lib/skill/onlineEnglishFeedbackSkill";

let pass = 0;
let fail = 0;
function assert(cond: boolean, label: string) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}
const has = (issues: string[], re: RegExp) => issues.some((i) => re.test(i));

// ── synthetic lesson ──────────────────────────────────────────────────────────
const mmss = (m: number, s: number) => (m * 60 + s) * 1000;
const UTTS: Utterance[] = [
  { speaker: "A", start: mmss(0, 3), end: mmss(0, 12), text: "Good evening, how was your first day back at school today?" },
  { speaker: "B", start: mmss(0, 20), end: mmss(0, 34), text: "It was actually better than I expected because I met my friends again." },
  { speaker: "A", start: mmss(0, 45), end: mmss(0, 55), text: "Nice. Do you think the heat will be gone in September?" },
  { speaker: "B", start: mmss(1, 5), end: mmss(1, 15), text: "I think it will still be hot, but maybe a little better." },
  { speaker: "A", start: mmss(8, 22), end: mmss(8, 29), text: "Okay, now we're just gonna read the first paragraph, please start." },
  {
    speaker: "B",
    start: mmss(8, 31),
    end: mmss(9, 5),
    text: "If you get regular headaches, you're not alone. A new report says half of us suffer from them. Researchers from the university studied thousands of people in many countries.",
  },
  { speaker: "A", start: mmss(9, 10), end: mmss(9, 20), text: "Good reading. Why do you think they studied rich countries?" },
  {
    speaker: "B",
    start: mmss(9, 25),
    end: mmss(9, 50),
    text: "I think that since we use both like energy in fans and also air conditioners, it is better to use the air conditioner.",
  },
  { speaker: "A", start: mmss(10, 0), end: mmss(10, 10), text: "So you think the air conditioner is better. Tell me about your evening." },
  { speaker: "B", start: mmss(10, 20), end: mmss(10, 40), text: "Yesterday I go to my academy and I eat dinner at seven." },
  { speaker: "A", start: mmss(24, 59), end: mmss(25, 10), text: "Great job as always. We will continue next time. Bye." },
];
const TEACHER = guessTeacherSpeakerLabel(UTTS)!;
const TALK = computeTalkTime(UTTS, TEACHER);
const ROLES = toRoleUtterances(UTTS, TEACHER);
const CTX: ValidationContext = { roles: ROLES, lessonDateISO: "2026-10-02", lessonDurationMinutes: 25, ageBand: "teen", talkTime: TALK };
const T = TALK.teacherTalkPercentage;
const S = TALK.studentTalkPercentage;

const READING_LINE = "If you get regular headaches, you're not alone.";
const SPONTANEOUS_ERROR = "Yesterday I go to my academy and I eat dinner at seven.";
const OPINION = "I think that since we use both like energy in fans and also air conditioners, it is better to use the air conditioner.";

const BLOCK = {
  title: `📘 October 2, 2026 Today's Class Feedback — School life and a reading about headaches`,
  summary: `The student opened with a concrete detail: meeting friends again on the first day back at school. The class then moved to reading the first paragraph of an article about headaches and a short discussion about energy use at home. The student produced full opinions about air conditioners and fans, and the tutor kept the conversation going.`,
  content: `📝 Today's Lesson Content\n- Warm-up conversation about the first day back at school\n- Reading the first paragraph of an article about headaches\n- Discussion about using fans or air conditioners`,
  expressions: `💬 Key Expressions Covered\n- Regular headaches — headaches that happen often\n  Example: "${READING_LINE}"\n  The student read this clearly and understood the meaning.`,
  polish: `✅ A Few Things to Polish\nEvery learner works on small things like these.\n\n① Past tense: I go → I went\n❌ ${SPONTANEOUS_ERROR}\n✅ Yesterday I went to my academy and I ate dinner at seven.\nWhy this happened:\nThe sentence describes a finished event, so both verbs need the past form.`,
  standout: `🌟 What the Student Really Nailed Today\nThe student shared an opinion without being prompted: "${OPINION}" The idea is clear and the attempt matters more than the small slips. A short daily practice of past-tense sentences, about 5 minutes, would help.`,
};
const feedback = (b = BLOCK) => [b.title, "", b.summary, "", b.content, "", b.expressions, "", b.polish, "", b.standout].join("\n");
const GOOD_FEEDBACK = feedback();

const qcLines = (extra: { item3?: string; item5?: string } = {}) =>
  [
    "Tutor Evaluation — October 2, 2026 — Tutor",
    "",
    `1. Talk Time Ratio: Teacher ${T}% / Student ${S}%`,
    `2. Pacing & Engagement: Pass. This was a 25-minute lesson that moved from a warm-up to reading and discussion. The speaker roles come from an unverified heuristic.`,
    `3. Teaching Quality: 4 / 5`,
    `   - Rationale: ${extra.item3 ?? `The tutor asked an open question, "Why do you think they studied rich countries?", and built on the answer.`}`,
    `4. Student Participation: The student answered in full sentences and gave an unprompted opinion at 09:25.`,
    `5. Error Correction: ${extra.item5 ?? `A missed correction: the student said "${SPONTANEOUS_ERROR}" and the tutor moved on without a correction.`}`,
    `6. Questioning & Interaction: A mix of open and closed questions. The tutor asked "Do you think the heat will be gone in September?" to start a comparison.`,
    `7. Lesson Structure: Clear order from warm-up to reading to discussion.`,
    `8. Strengths:\n   - Friendly rapport\n   - Good follow-up questions`,
    `9. Areas for Improvement:\n   - Correct recurring past-tense slips in the moment`,
    `10. Recommended Follow-up Actions:\n   - Practise past-tense sentences for 5 minutes at the start of the next lesson`,
  ].join("\n");
const GOOD_QC = qcLines();

// ── 1. speaker-labeled transcript ─────────────────────────────────────────────
{
  const text = renderSpeakerTranscript(ROLES);
  const lines = text.split("\n");
  assert(lines.length === UTTS.length, "1. one line per utterance");
  assert(lines[0] === "[00:03] Teacher: Good evening, how was your first day back at school today?", `1. first line is "[mm:ss] Teacher: ..." (got ${lines[0]})`);
  assert(lines[1].startsWith("[00:20] Student: "), "1. student line labeled");
  assert(lines.every((l) => /^\[\d{1,2}:\d{2}(:\d{2})?\] (Teacher|Student)( \(possible reading aloud\))?: /.test(l)), "1. every line has timestamp and role");
  assert(!/(^|\n)\s*(A|B):/.test(text), "1. anonymous A/B labels do not leak into the text shown to Claude");
  const three: Utterance[] = [...UTTS, { speaker: "C", start: mmss(25, 20), end: mmss(25, 25), text: "Hello?" }];
  assert(toRoleUtterances(three, "A")[three.length - 1].role === "Student", "1. a third speaker label is treated as Student, like computeTalkTime");
  assert(toRoleUtterances([], null).length === 0, "1. no teacher label -> no lines");
  assert(describeSpeakerMapping(UTTS, "A")?.confidence === "unverified" && describeSpeakerMapping(three, "A")?.confidence === "low", "1. mapping confidence: 2 speakers=unverified, 3 speakers=low");
  assert(describeSpeakerMapping(UTTS, "A")?.method === "first-speaker-heuristic", "1. mapping is recorded as a heuristic, never verified");
}

// ── 2. timestamp preservation / raw data untouched ────────────────────────────
{
  const frozen = UTTS.map((u) => Object.freeze({ ...u }));
  const before = JSON.stringify(frozen);
  let threw = false;
  try {
    toRoleUtterances(frozen as Utterance[], "A");
  } catch {
    threw = true;
  }
  assert(!threw && JSON.stringify(frozen) === before, "2. converting to labeled utterances does not mutate the raw AssemblyAI data");
  assert(formatTimestamp(mmss(8, 22)) === "08:22" && formatTimestamp(3723000) === "1:02:03", "2. timestamp format mm:ss and h:mm:ss");
  assert(ROLES[5].startMs === UTTS[5].start && ROLES[5].endMs === UTTS[5].end, "2. start/end ms preserved on the labeled utterance");
  assert(renderSpeakerTranscript(ROLES).includes("[08:31] Student (possible reading aloud): If you get regular headaches"), "2. the 08:31 reading line keeps its timestamp");
}

// ── 3. reading passage protection ─────────────────────────────────────────────
{
  assert(ROLES[5].possibleReadAloud, "3. the line after 'we're gonna read the first paragraph' is flagged as possible reading aloud");
  assert(!ROLES[7].possibleReadAloud && !ROLES[9].possibleReadAloud && !ROLES[1].possibleReadAloud, "3. spontaneous student lines are not flagged");
  const thanks = toRoleUtterances(
    [
      { speaker: "A", start: 0, end: 1000, text: "Okay, thank you for reading." },
      { speaker: "B", start: 2000, end: 3000, text: "I really liked the second part of it." },
    ],
    "A",
  );
  assert(!thanks[1].possibleReadAloud, "3. 'thank you for reading' is not a read request");
  const prose = "Researchers from the national health institute studied thousands of adults across wealthy countries and found that regular headaches are common among people of every age and background around the world today";
  const proseRoles = toRoleUtterances([{ speaker: "A", start: 0, end: 1000, text: "Okay." }, { speaker: "B", start: 2000, end: 9000, text: prose }], "A");
  assert(proseRoles[1].possibleReadAloud, "3. a long prose-like student turn with no disfluencies is flagged even without a read cue");
  const talky = toRoleUtterances([{ speaker: "A", start: 0, end: 1000, text: "Okay." }, { speaker: "B", start: 2000, end: 9000, text: `um ${prose} like you know` }], "A");
  assert(!talky[1].possibleReadAloud, "3. the same length with speech disfluencies is not flagged");

  // Regression from a real recording: a fluent 30+ word first-person answer (no filler words) was flagged as reading aloud,
  // which hid the lesson's only real grammar error from the feedback. Synthetic text with the same shape.
  const fluentOwn =
    "Sometimes I actually feel a lot of pressure from my school and my academy because everyone around me is working very hard, but I did not actually had a headache when I felt those pressures at all";
  const own = toRoleUtterances([{ speaker: "A", start: 0, end: 1000, text: "Do you feel stress sometimes?" }, { speaker: "B", start: 2000, end: 9000, text: fluentOwn }], "A");
  assert(!own[1].possibleReadAloud, "3. a fluent first-person spontaneous answer is not flagged as reading aloud");
  const ownPrompt = toRoleUtterances([{ speaker: "A", start: 0, end: 1000, text: "Tell me about your weekend." }, { speaker: "B", start: 2000, end: 9000, text: fluentOwn }], "A");
  assert(!ownPrompt[1].possibleReadAloud, "3. a long fluent answer with 'my' after a prompt without '?' ('tell me about your ...') is not flagged");

  // Scripted text says "I"/"my" too: without an explicit read request right before it, it stays eligible through other evidence.
  const scriptedWithI =
    "My name is Tom and I live in a small town near the sea with my parents and my little sister, and every morning I walk to my school along the beach before the shops open";
  const dialogue = toRoleUtterances(
    [{ speaker: "A", start: 0, end: 3000, text: "Okay, look at the dialogue on page 12." }, { speaker: "B", start: 4000, end: 12000, text: scriptedWithI }],
    "A",
  );
  assert(dialogue[1].possibleReadAloud, "3. long scripted text with 'I/my' after a textbook/passage reference (no 'read') is flagged");
  const noCue = toRoleUtterances([{ speaker: "A", start: 0, end: 1000, text: "Okay." }, { speaker: "B", start: 2000, end: 9000, text: scriptedWithI }], "A");
  assert(noCue[1].possibleReadAloud, "3. long scripted text with 'I/my' and no teacher prompt is flagged by the prose rule (no first-person exemption)");
  const continued = toRoleUtterances(
    [
      { speaker: "A", start: 0, end: 2000, text: "Please read the passage." },
      { speaker: "B", start: 3000, end: 8000, text: "If you get regular headaches, you're not alone." },
      { speaker: "A", start: 9000, end: 10000, text: "Good, next." },
      { speaker: "B", start: 11000, end: 15000, text: "I get them every week, my doctor told me." },
      { speaker: "A", start: 16000, end: 17000, text: "Okay." },
      { speaker: "B", start: 18000, end: 22000, text: "Most of my friends have them too, says Anna." },
    ],
    "A",
  );
  assert(continued[3].possibleReadAloud && continued[5].possibleReadAloud, "3. a read segment continues across short non-question teacher interjections, even with 'I/my'");
  const continueThenAsk = toRoleUtterances(
    [
      { speaker: "A", start: 0, end: 2000, text: "Please read the passage." },
      { speaker: "B", start: 3000, end: 8000, text: "If you get regular headaches, you're not alone." },
      { speaker: "A", start: 9000, end: 10000, text: "Good. Do you get headaches?" },
      { speaker: "B", start: 11000, end: 15000, text: "Yes, I get them when I sleep late." },
    ],
    "A",
  );
  assert(!continueThenAsk[3].possibleReadAloud, "3. a question after a read segment ends it: the answer is not flagged");

  // A question about the title is a comprehension question; the answer is the student's own words.
  const title = toRoleUtterances(
    [
      { speaker: "A", start: 0, end: 3000, text: "Okay, what is the title of lesson 48?" },
      { speaker: "B", start: 4000, end: 7000, text: "I think it is about headaches because my mom gets them a lot." },
    ],
    "A",
  );
  assert(!title[1].possibleReadAloud, "3. a spontaneous answer to 'what is the title of lesson 48?' is not automatically flagged");
  const passageQuestion = toRoleUtterances(
    [{ speaker: "A", start: 0, end: 3000, text: "What is the passage about?" }, { speaker: "B", start: 4000, end: 12000, text: fluentOwn }],
    "A",
  );
  assert(!passageQuestion[1].possibleReadAloud, "3. a long answer to an open question that mentions the passage is not flagged");
  const readTitle = toRoleUtterances(
    [
      { speaker: "A", start: 0, end: 3000, text: "Please read the title." },
      { speaker: "B", start: 4000, end: 7000, text: "Half the world's population get headache." },
    ],
    "A",
  );
  assert(readTitle[1].possibleReadAloud, "3. the student turn after an explicit 'Please read the title' is flagged");
  const readPassage = toRoleUtterances(
    [{ speaker: "A", start: 0, end: 3000, text: "Please read the passage." }, { speaker: "B", start: 4000, end: 12000, text: scriptedWithI }],
    "A",
  );
  assert(readPassage[1].possibleReadAloud, "3. the student turn after an explicit 'Please read the passage' is flagged");
  const readsWithI = toRoleUtterances(
    [
      { speaker: "A", start: 0, end: 3000, text: "Okay, start reading." },
      { speaker: "B", start: 4000, end: 9000, text: "I was surprised that the numbers were so big, said the lead researcher in the report." },
    ],
    "A",
  );
  assert(readsWithI[1].possibleReadAloud, "3. text after an explicit read request is still flagged even if it contains 'I'");

  // ── explicit text/role designation and the five reading cases of the real recording (synthetic text, same structure) ──
  const flagsOf = (lines: [("T" | "S"), string][]) =>
    toRoleUtterances(
      lines.map(([who, text], i) => ({ speaker: who === "T" ? "A" : "B", start: i * 5000, end: i * 5000 + 4000, text })),
      "A",
    ).map((r) => r.possibleReadAloud);
  const scriptedI = "I was surprised that the numbers were so big, said my colleague, and I think many people will be surprised too when they read the report";
  assert(flagsOf([["T", "Role B."], ["S", scriptedI]])[1], "3. a short teacher turn naming the role card + a scripted text with I/my -> reading");
  assert(flagsOf([["T", "Okay, the dialogue on page 12."], ["S", scriptedI]])[1], "3. a short teacher turn naming the page/dialogue -> reading");
  assert(!flagsOf([["T", "What is the dialogue on page 12 about?"], ["S", "It is about two friends who talk about a new school"]])[1], "3. an open question that mentions the text does not make the answer reading");
  assert(!flagsOf([["T", "Okay, start reading."], ["S", scriptedI], ["T", "Okay."], ["S", "Um, I think it is, like, really common in my school too"]])[3], "3. a reply with disfluencies after a bare 'okay' is not a continuation");
  assert(flagsOf([["T", "Okay, start reading."], ["S", scriptedI], ["T", "Okay."], ["S", scriptedI]])[3], "3. a scripted continuation after a bare 'okay' is still reading");

  // ── continuation cues vs short evaluative reactions ─────────────────────────────────────────────────────────────
  const fluentOwnAnswer =
    "Since everyone is working hard, sometimes I actually have academic pressure, but I didn't actually had a headache when I had those pressures, I had headache only when I studied too much";
  const afterRead = (teacher: string, student: string) => flagsOf([["T", "Okay, start reading."], ["S", scriptedI], ["T", teacher], ["S", student]])[3];
  for (const reaction of ["Good.", "That's right.", "Very good.", "Correct.", "Great job.", "Nice.", "Exactly.", "Well done."]) {
    assert(!afterRead(reaction, fluentOwnAnswer), `3. read segment -> Teacher "${reaction}" -> fluent spontaneous answer is NOT reading`);
  }
  for (const cue of ["Okay.", "Next.", "Continue.", "Keep going.", "Go on.", "Carry on."]) {
    assert(afterRead(cue, scriptedI), `3. read segment -> Teacher "${cue}" -> scripted continuation is reading`);
  }
  assert(!afterRead("Next, tell me how you feel about it?", fluentOwnAnswer), "3. a cue inside a question is not a continuation");
  assert(!afterRead("Good, so what do you think about that?", fluentOwnAnswer), "3. an evaluative reaction followed by a question ends the segment");
  assert(afterRead("Okay. Next.", scriptedI), "3. 'Okay. Next.' keeps the segment going");

  const real1 = flagsOf([["T", "So our lesson is about health. Role A. Please read."], ["S", "Diane, you think walking and cycling more is the best way to save energy? Tell the teacher at least three reasons."]]);
  assert(real1[1], "3. real-recording case 1: Role A prompt after 'Please read' -> reading");
  const real2 = flagsOf([["T", "Okay, let's see. What about role B? Can you read roll B?"], ["S", "Diane, you think using fans instead of air conditioners is the best way to save energy? Tell the teacher at least three reasons why."]]);
  assert(real2[1], "3. real-recording case 2: Role B prompt after 'Can you read roll B?' -> reading");
  const real3 = flagsOf([["T", "Now let's read. How bad are these? Can you read all this?"], ["S", "No. Sleep, stress, eyesight problems, Dehydration."]]);
  assert(real3[1], "3. real-recording case 3: a word list after 'Can you read all this?' -> reading");
  const real4 = flagsOf([["T", "Okay, now we're just gonna read the first paragraph. What are they saying about headaches? Okay, start reading."], ["S", "Diane, if you get regular headaches, you're not alone. A new report says half of us suffer from headaches. Researchers looked at many different studies on headaches from 1961 to 2020."]]);
  assert(real4[1], "3. real-recording case 4: the passage after 'start reading' -> reading");
  const real5 = flagsOf([["T", "I don't know if you ever experience stress at your age sometimes?"], ["S", "Since everyone is working hard, sometimes I actually have academic pressure, but I didn't actually had a headache when I had those pressures, I had headache only when I studied too much"]]);
  assert(!real5[1], "3. real-recording case 5: the fluent spontaneous answer with the real grammar error is NOT reading");
  // The recording's title line ("what is the title of lesson 48?" -> the student reads the headline) no longer counts as a
  // read request by itself; only an explicit "please read the title" does (tests above).

  const rules = buildProjectRules({ lessonDurationMinutes: 25, speakerCount: 2 });
  assert(rules.includes("TEXT-ONLY EVIDENCE") && /Never comment on pronunciation, accent, intonation, fluency, pacing/.test(rules), "3. rules forbid pronunciation/fluency/pacing comments from a text transcript");
  assert(/speech-to-text artifacts, not student mistakes/.test(rules) && /never use them as a ❌ item/i.test(rules), "3. rules tell Claude that odd spellings/garbled words are speech-to-text artifacts, not ❌ items");
  assert(/finish a sentence the tutor started/.test(rules), "3. rules cover a student line that finishes the tutor's sentence");
  assert(/A name at the start of a student line/.test(rules) && /never write "the student's name"/.test(rules), "3. rules forbid explaining a name at the start of a student line");
  assert(/timestamp of the line where the TUTOR said it/.test(rules), "3. rules require the tutor's own timestamp when citing a tutor action");
  assert(!/You may comment on reading fluency/.test(rules), "3. the old invitation to comment on reading fluency/mispronunciation is gone");

  const wrong = feedback({ ...BLOCK, polish: `✅ A Few Things to Polish\nOne small item.\n\n① Verb choice: get → have\n❌ ${READING_LINE}\n✅ If you have regular headaches, you're not alone.\nWhy this happened:\nHealth conditions usually take "have".` });
  assert(has(checkQuotesAndReading(wrong, GOOD_QC, ROLES), /reading aloud/), "3. a ❌ correction taken from the read-aloud passage is rejected");
  assert(!has(checkQuotesAndReading(GOOD_FEEDBACK, GOOD_QC, ROLES), /reading aloud/), "3. a ❌ correction from spontaneous speech is accepted");

  // Regression from a real recording: the read-aloud passage was quoted in a polish item's heading (not on a ❌ line).
  const headingQuote = feedback({
    ...BLOCK,
    polish: `✅ A Few Things to Polish\nOne small item.\n\n① Article use: "${READING_LINE}"\nWhy this happened:\nA short reason.`,
  });
  assert(has(checkQuotesAndReading(headingQuote, GOOD_QC, ROLES), /reading aloud/), "3. a read-aloud sentence quoted in a polish item's heading is rejected");
  assert(checkStudentReportHygiene(GOOD_FEEDBACK).length === 0, "3b. a normal report passes the hygiene check");
  const sttItem = feedback({
    ...BLOCK,
    polish: `✅ A Few Things to Polish\n① Word choice: pixie (likely a speech-to-text artifact)\nWhy this happened:\nA short reason.`,
  });
  assert(checkStudentReportHygiene(sttItem).length === 1, "3b. a polish item about a speech-to-text artifact is rejected");
  const noError = feedback({
    ...BLOCK,
    polish: `✅ A Few Things to Polish\n③ Pronoun reference: No correction was needed here — this was a strength.`,
  });
  assert(checkStudentReportHygiene(noError).length === 1, "3b. a polish item that says no correction is needed is rejected");

  // ── validators added after the second real-recording run (synthetic text, same shapes) ─────────────────────────
  // (a) Output 1 must not judge how the student sounded: the model only has text.
  assert(checkStudentReportHygiene("The student also read the full article passage fluently and answered follow-up questions.").length === 1, "3c. 'read ... fluently' is rejected");
  assert(checkStudentReportHygiene("The student read the report aloud with clear pacing and good intonation.").length === 1, "3c. 'with clear pacing' is rejected");
  assert(checkStudentReportHygiene("The student's pronunciation of the new words was excellent.").length === 0, "3c. a sentence without a speaking/reading verb is left to the other checks");
  assert(checkStudentReportHygiene("To build fluency, practice reading the article aloud twice a week.").length === 0, "3c. a practice suggestion about fluency is allowed");
  assert(checkStudentReportHygiene(`The tutor corrected the word "migraine" when the student said it, and the student repeated it.`).length === 0, "3c. a sentence quoting the tutor's correction is allowed");
  assert(checkStudentReportHygiene("The student read the first paragraph and then explained the main idea in their own words.").length === 0, "3c. reading without a quality judgement is allowed");

  // (b) a ❌ sentence that stops where the speaker label changes
  const splitRoles = toRoleUtterances(
    [
      { speaker: "A", start: 0, end: 4000, text: "Do you still cycle to school?" },
      { speaker: "B", start: 5000, end: 12000, text: "I used to cycle when I was young, but. But now I'm actually a little too" },
      { speaker: "A", start: 12000, end: 15000, text: "grown up for a cycling. I see." },
      { speaker: "B", start: 16000, end: 21000, text: "Yes. I walk to school with my friends every morning." },
    ],
    "A",
  );
  const polishWith = (wrong: string) =>
    feedback({ ...BLOCK, polish: `✅ A Few Things to Polish\nOne small item.\n\n① Unfinished thought\n❌ "${wrong}"\n✅ "A complete sentence."\nWhy this happened:\nA short reason.` });
  assert(has(checkQuotesAndReading(polishWith("But now I'm actually a little too"), GOOD_QC, splitRoles), /speaker label changes/), "3d. a ❌ sentence cut where the speaker label changes is rejected");
  assert(!has(checkQuotesAndReading(polishWith("I walk to school with my friends every morning."), GOOD_QC, splitRoles), /speaker label changes/), "3d. a complete ❌ sentence is accepted");
  const noSplitRoles = toRoleUtterances(
    [
      { speaker: "A", start: 0, end: 4000, text: "Do you still cycle to school?" },
      { speaker: "B", start: 5000, end: 12000, text: "I used to cycle when I was young, but now I'm actually a little too" },
      { speaker: "A", start: 12000, end: 15000, text: "Grown up. I see." },
    ],
    "A",
  );
  assert(!has(checkQuotesAndReading(polishWith("now I'm actually a little too"), GOOD_QC, noSplitRoles), /speaker label changes/), "3d. if the next turn does not continue the sentence (upper case) it is not treated as a split");

  // (c) a tutor/student action cited at a timestamp where the other person speaks
  const tsRoles = toRoleUtterances(
    [
      { speaker: "A", start: mmss(0, 10), end: mmss(0, 20), text: "Why do you think the researchers studied rich countries?" },
      { speaker: "B", start: mmss(0, 25), end: mmss(0, 40), text: "Maybe they wanted to show that rich people also struggle sometimes." },
      { speaker: "A", start: mmss(0, 41), end: mmss(0, 50), text: "That is a very good answer." },
    ],
    "A",
  );
  const tsIssues = (text: string) => checkTutorStudentTimestamps(text, tsRoles);
  assert(tsIssues("At [00:25], the tutor asked why the researchers studied rich countries.").length === 1, "3e. 'At [ts], the tutor asked' at a Student line is rejected");
  assert(tsIssues("The tutor clarified the distinction at [00:25].").length === 1, "3e. 'the tutor ... at [ts]' at a Student line is rejected");
  assert(tsIssues("At [00:10], the student answered the question about the researchers.").length === 1, "3e. 'At [ts], the student ...' at a Tutor line is rejected");
  assert(tsIssues("At [00:10], the tutor asked why the researchers studied rich countries.").length === 0, "3e. the tutor at the tutor's own line is accepted");
  assert(tsIssues("At [00:25], the student offered a thoughtful observation about the study.").length === 0, "3e. the student at the student's own line is accepted");
  assert(tsIssues("At [00:10], the student's thought was incomplete, and the tutor completed it.").length === 0, "3e. a possessive ('the student's thought') is not an action by the student");
  assert(tsIssues("At [00:25], when the student answered, the tutor listened and then praised it at [00:41].").length === 0, "3e. a 'when the student ...' clause and a correct later timestamp are accepted");
  assert(tsIssues("During vocabulary matching (starting at [00:25]), the tutor confirmed each answer.").length === 0, "3e. a timestamp that only opens a section is not an action claim");
  assert(tsIssues("At [09:59], the tutor asked something.").length === 0, "3e. a timestamp that matches no line is left to the existing time-grounding check");
  // Found by a confirmation run: the OBJECT of a verb is not the actor ("the tutor asked the student to ... at [ts]").
  assert(tsIssues("The tutor asked the student to give her own reasons at [00:10].").length === 0, "3e. 'the student' as the object of 'asked' is not an actor claim");
  assert(tsIssues("At [00:10], the tutor asked the student to explain her reasons.").length === 0, "3e. 'At [ts], the tutor asked the student ...' only checks the tutor");
  assert(tsIssues("The tutor asked the student to explain at [00:25].").length === 0, "3e. a phrase that names another person between actor and timestamp is left alone");
  assert(tsIssues("The student answered, and the tutor clarified the distinction at [00:25].").length === 1, "3e. a tutor action at a student line is still caught after a conjunction");
  const qcWrong = qcLines({ item5: `A missed correction: the student said "${READING_LINE}" and the tutor should be correcting it.` });
  assert(has(checkQuotesAndReading(GOOD_FEEDBACK, qcWrong, ROLES), /reading aloud/), "3. a 'missed correction' note about the read-aloud passage is rejected");
  assert(buildProjectRules({ lessonDurationMinutes: 25, speakerCount: 2 }).includes("READING / SCRIPT PROTECTION"), "3. the project rules tell Claude not to treat reading as errors");
}

// ── 4. quote grounding ────────────────────────────────────────────────────────
{
  assert(checkQuotesAndReading(GOOD_FEEDBACK, GOOD_QC, ROLES).length === 0, "4. the good sample has no ungrounded quotation");
  const invented = qcLines({ item3: `The tutor said "So you stick to saying it is still the air conditioner", which pushed the student.` });
  assert(has(checkQuotesAndReading(GOOD_FEEDBACK, invented, ROLES), /not in the transcript/), "4. an invented quotation is rejected");
  const loose = qcLines({ item3: `The tutor said "good reading, why do you think they studied rich countries" and moved on.` });
  assert(!has(checkQuotesAndReading(GOOD_FEEDBACK, loose, ROLES), /not in the transcript/), "4. case and punctuation differences are tolerated");
  const ellipsis = qcLines({ item3: `The tutor asked "Why do you think ... rich countries?" to check reasoning.` });
  assert(!has(checkQuotesAndReading(GOOD_FEEDBACK, ellipsis, ROLES), /not in the transcript/), "4. quotations may skip words with an ellipsis");
  const teacherAsStudent = feedback({ ...BLOCK, polish: `✅ A Few Things to Polish\nOne item.\n\n① Word order\n❌ Tell me about your evening.\n✅ Tell me about the evening.\nWhy this happened:\nExample.` });
  assert(has(checkQuotesAndReading(teacherAsStudent, GOOD_QC, ROLES), /said by the Teacher/), "4. a ❌ sentence that the teacher said is rejected");
  const madeUp = feedback({ ...BLOCK, polish: `✅ A Few Things to Polish\nOne item.\n\n① Plural\n❌ I have three sister.\n✅ I have three sisters.\nWhy this happened:\nPlural noun.` });
  assert(has(checkQuotesAndReading(madeUp, GOOD_QC, ROLES), /❌ student sentence is not in the transcript/), "4. a ❌ sentence that nobody said is rejected");
  const suggestion = qcLines({ item3: `The tutor could model a sentence such as "I have headaches when I study math" for practice.` });
  assert(!has(checkQuotesAndReading(GOOD_FEEDBACK, suggestion, ROLES), /not in the transcript/), "4. a suggested practice sentence after 'such as' is not treated as a quotation");
  const tiny = qcLines({ item3: `The student used "have" and "get" correctly.` });
  assert(checkQuotesAndReading(GOOD_FEEDBACK, tiny, ROLES).length === 0, "4. quotes shorter than 3 words are ignored");
}

// ── 4b. calibration found with real-audio output: tolerated edits, explanation blocks, skill length limits ──
{
  const cleaned = qcLines({ item3: `The student said "I think that since we use both energy in fans and also air conditioners" without hesitation.` });
  assert(!has(checkQuotesAndReading(GOOD_FEEDBACK, cleaned, ROLES), /not in the transcript/), "4b. a quote that only omits a filler word of the real utterance is accepted");
  const substituted = qcLines({ item3: `The student said "I think that since we use both money in fans and also air conditioners" with a clear idea.` });
  assert(has(checkQuotesAndReading(GOOD_FEEDBACK, substituted, ROLES), /not in the transcript/), "4b. a quote that substitutes a word is still rejected");
  const stitched = qcLines({ item3: `The tutor said "Good evening I think the heat will be better" to the class.` });
  assert(has(checkQuotesAndReading(GOOD_FEEDBACK, stitched, ROLES), /not in the transcript/), "4b. words stitched together from different lines are rejected");
  const explanation = feedback({ ...BLOCK, polish: `${BLOCK.polish}\nA similar pattern: "There is a book on the table" and "There are two books on the table".` });
  assert(!has(checkQuotesAndReading(explanation, GOOD_QC, ROLES), /not in the transcript/), "4b. sentences in a 'Why this happened' explanation are illustrations, not quotations");
  const outside = feedback({ ...BLOCK, summary: `${BLOCK.summary} The tutor asked "Does that make sense to everyone in the room" at one point.` });
  assert(has(checkQuotesAndReading(outside, GOOD_QC, ROLES), /not in the transcript/), "4b. the same kind of sentence outside the explanation block is still checked");
  const formula = qcLines({ item3: `The tutor could drill the pattern "didn't + base verb" with short drills.` });
  assert(!has(checkQuotesAndReading(GOOD_FEEDBACK, formula, ROLES), /not in the transcript/), "4b. a grammar formula with '+' is not treated as a quotation");
  const fiveExpr = feedback({ ...BLOCK, expressions: `💬 Key Expressions Covered\n${[1, 2, 3, 4, 5].map((n) => `- Word ${n} — meaning ${n}`).join("\n")}` });
  assert(has(checkSkillStructureLimits(fiveExpr, 25), /5 key expressions.*at most 4/), "4b. more key expressions than the skill's 25-minute structure allows is rejected");
  assert(!has(checkSkillStructureLimits(fiveExpr, 50), /key expressions/), "4b. the same count is fine for a 50-minute class");
  const fourCorr = feedback({ ...BLOCK, polish: `${BLOCK.polish}\n\n② B\n\n③ C\n\n④ D` });
  assert(has(checkSkillStructureLimits(fourCorr, 25), /4 corrections.*at most 3/) && !has(checkSkillStructureLimits(fourCorr, 50), /corrections/), "4b. correction count follows the 25/50-minute limits");
  assert(checkSkillStructureLimits(GOOD_FEEDBACK, 25).length === 0, "4b. the good sample is within the skill's limits");
}

// ── 5. timestamp / duration grounding ─────────────────────────────────────────
{
  assert(checkTimeGrounding(GOOD_FEEDBACK, GOOD_QC, CTX).length === 0, "5. the good sample has no ungrounded duration (25-minute lesson, 09:25, 5 minutes in item 10 and 🌟 are allowed)");
  const sixMin = feedback({ ...BLOCK, summary: `${BLOCK.summary} The 6-minute warm-up led into the reading.` });
  assert(has(checkTimeGrounding(sixMin, GOOD_QC, CTX), /6-minute/), "5. an invented '6-minute warm-up' is rejected");
  const words = qcLines({ item3: `The warm-up lasted about six minutes before the reading began.` });
  assert(has(checkTimeGrounding(GOOD_FEEDBACK, words, CTX), /six minutes/), "5. a spelled-out duration is rejected too");
  const secs = qcLines({ item3: `The tutor waited 45 seconds for an answer.` });
  assert(has(checkTimeGrounding(GOOD_FEEDBACK, secs, CTX), /45 seconds/), "5. an invented number of seconds is rejected");
  const badClock = qcLines({ item3: `The tutor changed topic at 12:34 without a transition.` });
  assert(has(checkTimeGrounding(GOOD_FEEDBACK, badClock, CTX), /12:34/), "5. a time that matches no transcript timestamp is rejected");
  const goodClock = qcLines({ item3: `The tutor moved to the reading at 08:22 with a clear instruction.` });
  assert(!has(checkTimeGrounding(GOOD_FEEDBACK, goodClock, CTX), /08:22/), "5. a copied transcript timestamp is accepted");
  const inQuote = qcLines({ item3: `The tutor asked "Can you be here at 7:45 tomorrow evening" again.` });
  assert(!has(checkTimeGrounding(GOOD_FEEDBACK, inQuote, CTX), /7:45/), "5. clock times inside quotations are left to the quote check");
  const lessonLength = qcLines({ item3: `Across the 25 minutes the tutor kept a steady pace.` });
  assert(!has(checkTimeGrounding(GOOD_FEEDBACK, lessonLength, CTX), /25 minutes/), "5. the lesson length itself may be stated");
  const noNumbers = feedback({ ...BLOCK, summary: `${BLOCK.summary} The student also named 3 new words and read 2 sentences.` });
  assert(checkTimeGrounding(noNumbers, GOOD_QC, CTX).length === 0, "5. ordinary counts (3 words, 2 sentences) are not blocked");
}

// ── 6. duplicate header ───────────────────────────────────────────────────────
{
  assert(checkNoDuplicateStructure(GOOD_FEEDBACK, GOOD_QC).length === 0, "6. a clean report passes the duplicate check");
  const full = `${GOOD_FEEDBACK}\n\n${GOOD_FEEDBACK}`;
  assert(has(checkNoDuplicateStructure(full, GOOD_QC), /"📘" title markers/), "6. a whole report repeated twice is rejected");
  const tail = `${GOOD_FEEDBACK}\n\n📘 October 2, 2026\n\n`;
  assert(has(checkNoDuplicateStructure(tail, GOOD_QC), /"📘" title markers/), "6. a stray second header at the end (the real run-3 pattern) is rejected");
  assert(has(checkNoDuplicateStructure("📝 Today's Lesson Content\n- x", GOOD_QC), /missing the section/), "6. a report without its title/sections is rejected");
}

// ── 7. duplicate section ──────────────────────────────────────────────────────
{
  const twoExpr = feedback({ ...BLOCK, expressions: `${BLOCK.expressions}\n\n${BLOCK.expressions}` });
  assert(has(checkNoDuplicateStructure(twoExpr, GOOD_QC), /repeats the section "Key Expressions Covered"/), "7. a repeated 'Key Expressions Covered' section is rejected");
  const twoCorrections = feedback({ ...BLOCK, polish: `${BLOCK.polish}\n\n① Past tense: I go → I went\n❌ ${SPONTANEOUS_ERROR}` });
  assert(has(checkNoDuplicateStructure(twoCorrections, GOOD_QC), /numbered correction marker/), "7. a repeated numbered correction marker is rejected");
  const qcTwice = GOOD_QC.replace("4. Student Participation", "3. Teaching Quality: 4 / 5\n4. Student Participation");
  assert(has(checkNoDuplicateStructure(GOOD_FEEDBACK, qcTwice), /1 through 10/), "7. a repeated QC item is rejected");
  const qcMissing = GOOD_QC.replace(/\n7\. Lesson Structure:.*/, "");
  assert(has(checkNoDuplicateStructure(GOOD_FEEDBACK, qcMissing), /1 through 10/), "7. a missing QC item is rejected");
  assert(has(checkNoDuplicateStructure(GOOD_FEEDBACK, `${GOOD_QC}\n\n${GOOD_QC}`), /"Tutor Evaluation" titles/), "7. a whole QC repeated twice is rejected");
  assert(has(checkNoDuplicateStructure(`${GOOD_FEEDBACK}\n\nTutor Evaluation — x`, GOOD_QC), /Teacher QC must never reach the student/), "7. QC content inside the student report is rejected (privacy)");
  assert(has(checkNoDuplicateStructure(GOOD_FEEDBACK, `${GOOD_QC}\n🌟 extra`), /student-facing emoji/), "7. student emoji sections inside the QC are rejected");
}

// ── 8. teen tone ──────────────────────────────────────────────────────────────
{
  assert(checkLearnerAddressing(GOOD_FEEDBACK, "teen").length === 0, "8. the 3rd-person parent-addressed sample passes for a teen (the word 'you' inside quotes, ❌/✅ lines and Example lines is ignored)");
  const direct = feedback({ ...BLOCK, summary: `You started with a detail about meeting friends again. Your answers were full sentences and you kept the conversation going.` });
  assert(has(checkLearnerAddressing(direct, "teen"), /3rd person/), "8. 'You started...' is rejected for a teen");
  assert(has(checkLearnerAddressing(direct, "child"), /3rd person/), "8. and for a child");
  assert(checkLearnerAddressing(direct, "adult").length === 0, "8. the same text is fine for an adult (direct address)");
  assert(checkLearnerAddressing(direct, "unknown").length === 0, "8. and for an unknown band (adult-style fallback)");
  const insidePolish = feedback({ ...BLOCK, polish: `${BLOCK.polish}\nWhen you speak about the past, use the past form.` });
  assert(checkLearnerAddressing(insidePolish, "teen").length === 0, "8. a generic grammar 'you' inside the corrections explanation does not fail the report");
}

// ── 9. historical grounding ───────────────────────────────────────────────────
{
  const transcript = UTTS.map((u) => u.text).join(" ");
  assert(!checkNoUngroundedHistoricalClaims("A meaningful step forward from his earlier February sessions.", "2026-10-02", transcript).ok, "9. the real hallucination ('earlier February sessions') is still rejected");
  assert(!checkNoUngroundedHistoricalClaims("Compared with previous lessons, the student spoke more.", "2026-10-02", transcript).ok, "9. a comparison with previous lessons is still rejected");
  assert(checkNoUngroundedHistoricalClaims("The student first said 'I go' and after the correction said 'I went'.", "2026-10-02", transcript).ok, "9. a comparison inside the same lesson is allowed");
  assert(!checkNoUngroundedHistoricalClaims("The student improved a lot since last month.", "2026-10-02", transcript).ok, "9. 'last month' is rejected when nobody said it");
  assert(checkNoUngroundedHistoricalClaims("The student said it was a long time since last month.", "2026-10-02", `${transcript} I was away since last month.`).ok, "9. 'last month' is allowed when the transcript itself contains it");
  assert(!checkNoUngroundedHistoricalClaims("📘 October 2, 2025 Today's Class Feedback", "2026-10-02", transcript).ok, "9. a wrong year is rejected");
  assert(has(validateEvaluationOutput({ studentFeedback: GOOD_FEEDBACK.replace("School life", "School life since last month"), teacherQc: GOOD_QC }, CTX).issues, /last month/), "9. the combined validator applies the historical check");
}

// ── 10. measured Talk Time preservation ───────────────────────────────────────
{
  assert(checkTalkTimeFigures(GOOD_FEEDBACK, GOOD_QC, TALK).length === 0, "10. the measured values in item 1 pass");
  const wrong = GOOD_QC.replace(`Teacher ${T}% / Student ${S}%`, "Teacher 60% / Student 40%");
  assert(has(checkTalkTimeFigures(GOOD_FEEDBACK, wrong, TALK), /measured talk time/), "10. an estimated 60/40 replacing the measured value is rejected");
  const extra = qcLines({ item3: `The tutor talked about 70% of the time.` });
  assert(has(checkTalkTimeFigures(GOOD_FEEDBACK, extra, TALK), /70%/), "10. any other talk-time percentage is rejected");
  const inFeedback = feedback({ ...BLOCK, summary: `${BLOCK.summary} The student spoke for 80% of the class.` });
  assert(has(checkTalkTimeFigures(inFeedback, GOOD_QC, TALK), /80%/), "10. an invented percentage in the student report is rejected");
  const block = talkTimeOverrideBlock({ teacherSeconds: TALK.teacherSpeakingSeconds, teacherPercentage: T, studentSeconds: TALK.studentSpeakingSeconds, studentPercentage: S });
  assert(block.includes(`${TALK.teacherSpeakingSeconds}s (${T}%)`) && /do not estimate/i.test(block), "10. the measured block carries the application's numbers and forbids re-estimation");
}

// ── 11. a month mentioned in the real transcript is legitimate ────────────────
{
  assert(validateEvaluationOutput({ studentFeedback: GOOD_FEEDBACK, teacherQc: GOOD_QC }, CTX).ok, `11. the complete good sample passes every validator (issues: ${validateEvaluationOutput({ studentFeedback: GOOD_FEEDBACK, teacherQc: GOOD_QC }, CTX).issues.join(" | ")})`);
  assert(GOOD_QC.includes("in September?"), "11. (setup) the good QC quotes the teacher's September question");
  const paraphrase = qcLines({ item3: `The tutor asked whether the heat would be gone by September, a natural comparison question.` });
  assert(validateEvaluationOutput({ studentFeedback: GOOD_FEEDBACK, teacherQc: paraphrase }, CTX).ok, "11. a paraphrase that mentions September is allowed because the transcript contains it");
  const january = qcLines({ item3: `The student mentioned a trip in January that never appears in the lesson.` });
  assert(has(validateEvaluationOutput({ studentFeedback: GOOD_FEEDBACK, teacherQc: january }, CTX).issues, /January/), "11. a month that is neither the lesson's nor in the transcript is rejected");
  assert(!checkNoUngroundedHistoricalClaims("Asked in September?", "2026-10-02").ok, "11. strict mode (no transcript given) is unchanged");
}

// ── fake Anthropic seam (one call per report; the forced tool name says which report is requested) ──
type Planned = string | "truncated" | "empty";
type Kind = "student" | "teacher";
const TOOL: Record<Kind, string> = { student: "submit_student_feedback", teacher: "submit_teacher_qc" };
function fakeCreate(plan: { student: Planned[]; teacher: Planned[] }) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const used = { student: 0, teacher: 0 };
  const kindOf = (b: Anthropic.MessageCreateParamsNonStreaming): Kind => ((b.tools?.[0] as { name: string }).name === TOOL.teacher ? "teacher" : "student");
  const fn: CreateMessageFn = async (body) => {
    calls.push(body);
    const kind = kindOf(body);
    const list = plan[kind];
    const r = list[Math.min(used[kind]++, list.length - 1)];
    if (r === "truncated") return { content: [{ type: "tool_use", name: TOOL[kind], input: { report: "x" } }], stop_reason: "max_tokens" };
    if (r === "empty") return { content: [{ type: "text" }], stop_reason: "end_turn" };
    return { content: [{ type: "tool_use", name: TOOL[kind], input: { report: r } }], stop_reason: "tool_use" };
  };
  return { fn, calls, of: (k: Kind) => calls.filter((c) => kindOf(c) === k) };
}
const userText = (c: Anthropic.MessageCreateParamsNonStreaming) => String(c.messages[0].content);
const LESSON = { lessonDate: "2026-10-02", lessonDurationMinutes: 25, studentAgeBand: "teen" as const, studentRegion: "KOREA", textbookName: null, classMethod: null };
const DUP_S = `${GOOD_FEEDBACK}\n\n📘 October 2, 2026\n\n`;
const DUP_Q = `${GOOD_QC}\n\n${GOOD_QC}`;
const params = (createMessage: CreateMessageFn) => ({ utterances: UTTS, teacherSpeakerLabel: TEACHER, talkTime: TALK, lessonContext: LESSON, createMessage });

async function main() {
  // ── 12. validation failure -> regeneration of ONLY the failing report ───────
  {
    const f = fakeCreate({ student: [DUP_S, GOOD_FEEDBACK], teacher: [GOOD_QC] });
    const r = await generateAIEvaluationDraft(params(f.fn));
    assert(r?.studentFeedback === GOOD_FEEDBACK && r.teacherQc === GOOD_QC, "12. the passing second attempt of the student report is saved together with the QC");
    assert(r?.attempts?.studentFeedback === 2 && r.attempts.teacherQc === 1, "12. attempts are tracked per report");
    assert(f.of("student").length === 2 && f.of("teacher").length === 1, "12. only the failing report is regenerated");
    assert(/VALIDATION FAILED/.test(userText(f.of("student")[1])) && /"📘" title markers/.test(userText(f.of("student")[1])), "12. the retry tells Claude exactly which validation failed");
    assert(!/VALIDATION FAILED/.test(userText(f.of("student")[0])) && !/VALIDATION FAILED/.test(userText(f.of("teacher")[0])), "12. first requests carry no failure notice");
    const retry = userText(f.of("student")[1]);
    assert(retry.includes("=== BEGIN PREVIOUS REPORT ===") && retry.includes(DUP_S.slice(0, 60)) && /Change only what is needed/.test(retry), "12. the retry sends the failed report back and asks for a minimal fix instead of a rewrite");

    const qcFail = fakeCreate({ student: [GOOD_FEEDBACK], teacher: [DUP_Q, GOOD_QC] });
    const r2 = await generateAIEvaluationDraft(params(qcFail.fn));
    assert(r2?.attempts?.teacherQc === 2 && r2.attempts.studentFeedback === 1 && qcFail.of("student").length === 1, "12. a failing QC is regenerated without touching the student report");

    const ok = fakeCreate({ student: [GOOD_FEEDBACK], teacher: [GOOD_QC] });
    assert((await generateAIEvaluationDraft(params(ok.fn)))?.attempts?.studentFeedback === 1 && ok.calls.length === 2, "12. two passing reports cost exactly two calls");

    const trunc = fakeCreate({ student: ["truncated", GOOD_FEEDBACK], teacher: [GOOD_QC] });
    const r3 = await generateAIEvaluationDraft(params(trunc.fn));
    assert(r3?.attempts?.studentFeedback === 2 && /cut off at the token limit/.test(userText(trunc.of("student")[1])), "12. stop_reason max_tokens is a failure that triggers a regeneration with a reason");
    assert(/from scratch/.test(userText(trunc.of("student")[1])) && !userText(trunc.of("student")[1]).includes("BEGIN PREVIOUS REPORT"), "12. when there is no usable previous report the retry asks for a fresh report");
    const empty = fakeCreate({ student: ["empty", GOOD_FEEDBACK], teacher: [GOOD_QC] });
    assert((await generateAIEvaluationDraft(params(empty.fn)))?.attempts?.studentFeedback === 2, "12. a response without the report text is retried");
    const fourth = fakeCreate({ student: [DUP_S, DUP_S, DUP_S, GOOD_FEEDBACK], teacher: [GOOD_QC] });
    assert((await generateAIEvaluationDraft(params(fourth.fn)))?.attempts?.studentFeedback === 4, "12. up to a fourth attempt is allowed");
  }

  // ── 13. regeneration failure -> ANALYSIS_FAILED ─────────────────────────────
  {
    const f = fakeCreate({ student: [DUP_S], teacher: [GOOD_QC] });
    let message = "";
    try {
      await generateAIEvaluationDraft(params(f.fn));
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    assert(/Output 1 \(student feedback\) rejected after 4 attempts/.test(message) && /"📘" title markers/.test(message), "13. four failed attempts throw an error that lists the validation issues");
    assert(f.of("student").length === 4, "13. never more than 4 attempts per report");
    const both = fakeCreate({ student: [DUP_S], teacher: [DUP_Q] });
    let both_msg = "";
    try {
      await generateAIEvaluationDraft(params(both.fn));
    } catch (e) {
      both_msg = e instanceof Error ? e.message : String(e);
    }
    assert(/Output 1 \(student feedback\) rejected/.test(both_msg) && /Output 2 \(teacher QC\) rejected/.test(both_msg), "13. when both reports fail, both reasons are reported");

    const marked: { from: string; msg: string }[] = [];
    let saved = 0;
    const deps: ProcessRecordingDeps = {
      async findRecording() {
        return { id: 1, providerTranscriptId: "tx-1", lessonContext: LESSON };
      },
      async fetchTranscript() {
        return { id: "tx-1", status: "completed", text: UTTS.map((u) => u.text).join(" "), utterances: UTTS, audio_duration: 1510 };
      },
      async claimForAnalysis() {
        return true;
      },
      async markFailed(_id, from, msg) {
        marked.push({ from, msg });
      },
      async saveDraft() {
        saved++;
      },
      generateDraft: (p) => generateAIEvaluationDraft({ ...p, createMessage: fakeCreate({ student: [DUP_S], teacher: [GOOD_QC] }).fn }),
    };
    const outcome = await processRecording(1, deps);
    assert(outcome === "error" && marked.length === 1 && marked[0].from === "ANALYZING" && /rejected after 4 attempts/.test(marked[0].msg) && saved === 0, "13. the recording ends as ANALYSIS_FAILED (markFailed from ANALYZING) and no draft is saved");

    const captured: unknown[] = [];
    const deps2: ProcessRecordingDeps = { ...deps, generateDraft: async (p) => (captured.push(p), { studentFeedback: GOOD_FEEDBACK, teacherQc: GOOD_QC }) };
    marked.length = 0;
    assert((await processRecording(1, deps2)) === "ok" && saved === 1, "13. a passing draft is saved");
    const p = captured[0] as { utterances: Utterance[]; teacherSpeakerLabel: string | null };
    assert(Array.isArray(p.utterances) && p.utterances.length === UTTS.length && p.utterances[5].start === UTTS[5].start && p.teacherSpeakerLabel === "A", "13. the processing step hands Claude the raw utterances and the teacher label, not flattened text");

    const empty: ProcessRecordingDeps = { ...deps, async fetchTranscript() { return { id: "tx-1", status: "completed", text: "", utterances: [], audio_duration: 0 }; } };
    marked.length = 0;
    assert((await processRecording(1, empty)) === "transcript_unavailable" && marked.length === 1, "13. a transcript with no utterances is a failure, not an evaluation of nothing");
  }

  // ── request composition ─────────────────────────────────────────────────────
  {
    const f = fakeCreate({ student: [GOOD_FEEDBACK], teacher: [GOOD_QC] });
    await generateAIEvaluationDraft(params(f.fn));
    const [s, t] = [f.of("student")[0], f.of("teacher")[0]];
    const system = String(s.system);
    assert(system.split(ONLINE_ENGLISH_FEEDBACK_SKILL).length === 2, "15. the skill text is in the system prompt exactly once, unmodified");
    assert(system === String(t.system), "15. both reports are generated from the same system prompt");
    assert(system.indexOf("PROJECT AI EVALUATION RULES") > system.indexOf("=== END SKILL ==="), "15. project rules come after the skill and are separated from it");
    assert(system.includes("HISTORICAL CONTEXT POLICY") && system.includes("LEARNER TYPE") && system.includes("TEEN"), "15. historical policy and the explicit learner type are included");
    assert(system.includes("Output 2 contains NO quotation marks"), "15. the rule that keeps invented quotations out of the QC is in the prompt");
    const u = userText(s);
    assert(u.includes("[08:22] Teacher: Okay, now we're just gonna read") && u.includes("Student (possible reading aloud)"), "15. the user message carries the labeled, timestamped transcript");
    assert(u.includes(`Teacher: ${TALK.teacherSpeakingSeconds}s (${T}%)`) && u.includes("recordingLength (last timestamp): 25:10"), "15. measured talk time and the recording length are given as facts");
    assert(u.includes("SPEAKER MAPPING") && u.includes("unverified heuristic"), "15. the mapping is declared an unverified heuristic");
    assert(u.includes("Write ONLY Output 1") && userText(t).includes("Write ONLY Output 2"), "15. each request asks for exactly one report");
    assert(u.indexOf("FINAL CHECKLIST") > u.indexOf("[10:20] Student:") && u.includes("At most 3 lines under 📝, 4 items under 💬 and 3 corrections under ✅"), "15. the student checklist sits after the transcript and carries the skill's 25-minute limits");
    assert(u.includes('Never write "you" or "your"'), "15. a teen report's checklist forbids addressing the student as you");
    assert(userText(t).includes("NO quotation marks at all") && userText(t).includes(`Teacher ${T}% / Student ${S}%`), "15. the QC checklist forbids quotations and states the measured talk time");
    assert(s.model === "claude-haiku-4-5" && s.max_tokens === 8192 && s.temperature === 0.2, "15. Haiku 4.5 with a low temperature and headroom for the output");
    assert((s.tool_choice as { name: string }).name === TOOL.student && (t.tool_choice as { name: string }).name === TOOL.teacher, "15. each report is returned through its own forced tool");
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    assert((await generateAIEvaluationDraft({ utterances: UTTS, teacherSpeakerLabel: TEACHER, talkTime: TALK, lessonContext: LESSON })) === null, "15. no API key and no injected client -> null");
    if (saved) process.env.ANTHROPIC_API_KEY = saved;
  }

  // ── 14. skill snapshot integrity / structure by class length ────────────────
  {
    const sha = crypto.createHash("sha256").update(Buffer.from(ONLINE_ENGLISH_FEEDBACK_SKILL, "utf8")).digest("hex");
    assert(sha === ONLINE_ENGLISH_FEEDBACK_SKILL_META.sha256, "14. the embedded skill text matches its recorded sha256 (not edited by hand)");
    assert(ONLINE_ENGLISH_FEEDBACK_SKILL.split("\n").length === ONLINE_ENGLISH_FEEDBACK_SKILL_META.lines, "14. the line count matches the recorded value");
    assert(ONLINE_ENGLISH_FEEDBACK_SKILL.startsWith("---\nname: online-english-feedback") || ONLINE_ENGLISH_FEEDBACK_SKILL.startsWith("---\r\nname: online-english-feedback"), "14. it is the online-english-feedback skill file");
    assert(classLengthProfile(25) === "25" && classLengthProfile(10) === "25" && classLengthProfile(37) === "25" && classLengthProfile(38) === "50" && classLengthProfile(50) === "50", "14. class length selects the skill's 25-minute or 50-minute structure");
    assert(buildProjectRules({ lessonDurationMinutes: 50, speakerCount: 2 }).includes('"50-minute class" structure'), "14. a 50-minute lesson selects the 50-minute structure");
    assert(buildProjectRules({ lessonDurationMinutes: 25, speakerCount: 3 }).includes("LOW confidence"), "14. more than two speakers lowers the mapping confidence in the prompt");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
