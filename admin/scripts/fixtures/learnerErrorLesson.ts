// SYNTHETIC lesson that reproduces, in miniature, what a real 25-minute recording showed the rehearsal Production-like E2E:
//   - a CORRECT short sentence that the model listed as an error ("It's not safe.")
//   - four unmistakable learner errors that went unmentioned: a plural after "every", "there was" + a plural, "didn't" + a past form
//     and "is there" + a plural
//   - tutor questions whose [mm:ss] label was moved onto the student's answer
// The four error phrases quoted by the maintainers are kept word for word because they are what the detector must recognise; everything
// else (names, topics, the rest of the sentences) is invented. No real recording, student or tutor text beyond those fragments.
import type { Utterance } from "../../src/lib/talkTime";

const mmss = (m: number, s: number) => (m * 60 + s) * 1000;

export const LEARNER_ERROR_LESSON: Utterance[] = [
  { speaker: "A", start: mmss(0, 3), end: mmss(0, 12), text: "Good evening! How was school today?" },
  { speaker: "B", start: mmss(0, 20), end: mmss(0, 33), text: "It was fine, and I met my friends after class." },
  { speaker: "A", start: mmss(0, 45), end: mmss(0, 56), text: "Nice. Let's talk about scooters. Do you ride one to school?" },
  { speaker: "B", start: mmss(1, 5), end: mmss(1, 20), text: "No, because it looks really expensive and almost Every boys have pixie at school." },
  { speaker: "A", start: mmss(1, 30), end: mmss(1, 36), text: "Is it safe to ride one on the road?" },
  { speaker: "B", start: mmss(1, 40), end: mmss(1, 43), text: "It's not safe." },
  { speaker: "A", start: mmss(1, 48), end: mmss(1, 52), text: "Why not? Tell me about it." },
  { speaker: "B", start: mmss(1, 55), end: mmss(2, 8), text: "Because there was two boys on the road and a car came very fast." },
  { speaker: "A", start: mmss(2, 10), end: mmss(2, 17), text: "Oh no. Did you have a headache after that?" },
  { speaker: "B", start: mmss(2, 20), end: mmss(2, 35), text: "I didn't actually had a headache but I was very scared." },
  { speaker: "A", start: mmss(2, 40), end: mmss(2, 47), text: "I understand. Let me ask you something else: how is the weather now?" },
  { speaker: "B", start: mmss(2, 50), end: mmss(3, 2), text: "It is hot and I was sweating this morning." },
  { speaker: "A", start: mmss(3, 5), end: mmss(3, 10), text: "Good. Please read the paragraph on page 12." },
  {
    speaker: "B",
    start: mmss(3, 12),
    end: mmss(3, 35),
    text: "If you get regular headaches, you're not alone. There was two boys in the story and every students have a hat. A new report says half of us suffer from them.",
  },
  { speaker: "A", start: mmss(3, 40), end: mmss(3, 50), text: "Great reading. Tell me about your evening yesterday." },
  { speaker: "B", start: mmss(3, 55), end: mmss(4, 5), text: "Yesterday I go to the academy and I eat dinner at seven." },
  { speaker: "A", start: mmss(4, 10), end: mmss(4, 18), text: "There was two choices in the book, remember? Which one did you like?" },
  { speaker: "B", start: mmss(4, 25), end: mmss(4, 34), text: "Is there two ways to answer? I think the first one is better." },
  // a sentence split by the speaker labels: the student turn stops mid-sentence and the next tutor turn continues in lower case
  { speaker: "B", start: mmss(4, 40), end: mmss(4, 44), text: "I think every boys have" },
  { speaker: "A", start: mmss(4, 45), end: mmss(4, 50), text: "a scooter these days, yes. Thank you, see you next time. Bye." },
];
