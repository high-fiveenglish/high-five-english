// Synthetic lesson transcripts for the speaker-role tests. NO real recording, student or teacher text is used: every sentence
// below is invented. They only reproduce the SHAPES found in real recordings (who speaks first, who asks, how long the
// replies are, extra voices) so the role inference and its confidence gate can be tested deterministically.
import type { Utterance } from "../../src/lib/talkTime";

const TEACHER_TURNS = [
  "Good evening! How are you today?",
  "Okay, let's start with the first question. What do you usually do on weekends?",
  "Very good. Next question. Do you like music?",
  "Please read the first sentence for me.",
  "Great job. Now let's look at page 12. Can you tell me what the picture shows?",
  "Why do you think the boy is happy?",
  "Tell me more about your best friend. What does he like to do?",
  "Read it again, please. Listen to the sound at the end.",
  "That's right. Let's go to the next part. How many people are in the picture?",
  "Do you understand the new word? Repeat after me.",
  "Excellent. Our lesson today is about hobbies. Which hobby do you like best?",
  "Now try the last question. Where would you go on a holiday?",
  "Well done. Any questions for me?",
  "Okay, that's all for today. See you next time. Have a great day!",
];
const STUDENT_TURNS = [
  "I am fine, thank you.",
  "I play soccer with my friends.",
  "Yes, I do.",
  "The boy has a red ball and a small dog in the park.",
  "Two.",
  "Because he is with his family and it is a sunny day today.",
  "He likes games.",
  "No.",
  "I like drawing pictures and I draw every night after dinner with my sister.",
  "Yes.",
  "At the beach.",
  "No questions. Thank you, teacher. Bye.",
  "Maybe four.",
  "I think so.",
];

function build(order: ("T" | "S")[], speakers: { T: string; S: string }): Utterance[] {
  let t = 0;
  let ti = 0;
  let si = 0;
  return order.map((who) => {
    const text = who === "T" ? TEACHER_TURNS[ti++ % TEACHER_TURNS.length] : STUDENT_TURNS[si++ % STUDENT_TURNS.length];
    const ms = Math.max(1500, text.split(/\s+/).length * 450);
    const u = { speaker: speakers[who], start: t, end: t + ms, text };
    t += ms + 700;
    return u;
  });
}

const ALTERNATING: ("T" | "S")[] = Array.from({ length: 28 }, (_, i) => (i % 2 === 0 ? "T" : "S"));

/** Teacher speaks first (label A), student answers: the shape the old first-speaker rule assumed. */
export function teacherFirstLesson(): Utterance[] {
  return build(ALTERNATING, { T: "A", S: "B" });
}

/** The teacher is label B and the student (label A) says one stray word before the teacher greets — the real failure shape. */
export function studentFirstLesson(): Utterance[] {
  const lesson = build(ALTERNATING, { T: "B", S: "A" });
  return [{ speaker: "A", start: 0, end: 900, text: "And" }, ...lesson.map((u) => ({ ...u, start: u.start + 2000, end: u.end + 2000 }))];
}

/** Same as the real failure shape but the student's turns come first in every pair (student answers first, labelled A). */
export function studentLabelledFirstLesson(): Utterance[] {
  return build(["S", ...ALTERNATING], { T: "B", S: "A" });
}

/** Teacher-first lesson with a short extra voice (a played audio track) that reads a long passage after the teacher mentions the audio. */
export function threeVoiceLesson(): Utterance[] {
  const base = teacherFirstLesson();
  const at = 12;
  const audioStart = base[at].end + 500;
  const audio: Utterance = {
    speaker: "C",
    start: audioStart,
    end: audioStart + 60_000,
    text: "My neighbour has a big garden and every summer he invites the whole street for a picnic, and the children play games while the adults cook sausages and talk about the weather and the news of the town.",
  };
  const before = base.slice(0, at + 1);
  before[at] = { ...before[at], text: "Now let's listen to the audio. Listen carefully." };
  const shift = 60_500;
  const after = base.slice(at + 1).map((u) => ({ ...u, start: u.start + shift, end: u.end + shift }));
  return [...before, audio, ...after];
}

/** One person talks almost the whole time, the other only says "yes": not enough evidence either way. */
export function monologueLesson(): Utterance[] {
  const long = "I went to the cinema last weekend and watched a big movie with a very long story about an old sailor who travelled across the sea for many years before he came home.";
  const order = Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? "T" : "S")) as ("T" | "S")[];
  let t = 0;
  return order.map((who, i) => {
    const text = who === "T" ? long : i % 4 === 1 ? "Right." : "Yes.";
    const ms = who === "T" ? 20_000 : 900;
    const u = { speaker: who === "T" ? "A" : "B", start: t, end: t + ms, text };
    t += ms + 300;
    return u;
  });
}

/** Both voices ask questions and give instructions in similar amounts (e.g. two adults practising a conversation). */
export function symmetricLesson(): Utterance[] {
  const lines = [
    "How was your day?",
    "It was fine. How about your day?",
    "What did you do in the morning?",
    "I worked at home. What did you do?",
    "Do you like your new job?",
    "Yes, I do. Do you like yours?",
    "Where do you want to go this weekend?",
    "I want to see the lake. Where do you want to go?",
    "Why do you like the lake?",
    "Because it is quiet. Why do you like the city?",
  ];
  let t = 0;
  return lines.map((text, i) => {
    const u = { speaker: i % 2 === 0 ? "A" : "B", start: t, end: t + 3000, text };
    t += 3500;
    return u;
  });
}
