// Source: E:\★화상영어★\books (200여 종의 교재를 연령·레벨·목적 기준으로 재분류)
// 교재는 계속 추가되므로, 아래 목록은 각 단계를 대표하는 예시입니다.
//
// Editorial copy (name/ageRange/goal/focus/title/desc) lives in
// src/locales/{lang}/curriculum.json, keyed by each record's `id`
// (or by the export name for NATIVE_READING_TRACK_BOOKS, which has no id).
// Only structural data — ids, ordering, and book title arrays (proper nouns,
// never translated) — stays here.

export type CurriculumStage = {
  id: string;
  stage: number;
  books: string[];
};

export const CURRICULUM_STAGES: CurriculumStage[] = [
  {
    id: "phonics",
    stage: 1,
    books: ["Smart Phonics", "Oxford Phonics World", "Let's Go Phonics", "Progressive Phonics"],
  },
  {
    id: "basic-conversation",
    stage: 2,
    books: ["Everybody Up", "Family and Friends", "Big English", "Backpack", "National Geographic Our World"],
  },
  {
    id: "reading-smalltalk",
    stage: 3,
    books: ["Oxford Discover", "Reading Explorer", "Bricks Reading", "Subject Link", "I Can Write English"],
  },
  {
    id: "conversation-debate",
    stage: 4,
    books: ["American Headway", "Touchstone", "Interchange", "Grammar in Use", "Debate Pro Junior", "Debating Challenge"],
  },
  {
    id: "advanced-discussion",
    stage: 5,
    books: ["English File", "World English - TED Talks", "World News", "Vocabulary in Use", "Business English Course"],
  },
];

// `level` is either a raw, language-neutral notation (AR scores, which are
// never translated) or one of the keys under curriculum.json's
// `nativeReadingTrack.levels` dictionary (e.g. "advanced", "advancedPlus").
export const NATIVE_READING_TRACK_BOOKS: { title: string; level: string }[] = [
  { title: "Nate the Great / Henry and Mudge", level: "AR 2.0~2.5" },
  { title: "Frog and Toad Are Friends", level: "AR 2.9" },
  { title: "Judy Moody Was in a Mood", level: "AR 3.0~3.5" },
  { title: "Matilda / The Giver", level: "advanced" },
  { title: "To Kill a Mockingbird / Lord of the Flies / Animal Farm / Hunger Games", level: "advancedPlus" },
];

export type SpecialtyProgram = {
  id: string;
  books: string[];
};

export const SPECIALTY_PROGRAMS: SpecialtyProgram[] = [
  {
    id: "business",
    books: ["Business English Course", "Business Venture", "English for Everyone Business", "Let's Talk Business"],
  },
  {
    id: "exam",
    books: ["TOEIC / TOEIC Speaking", "TOEFL", "Cambridge IELTS", "OPIc", "SAT·GRE 501 시리즈"],
  },
  {
    id: "expression",
    books: ["Idioms for Everyday Use", "Phrasal Verbs Course", "English Collocations in Use", "Vocabulary Workshop"],
  },
  {
    id: "interview",
    books: ["Job Interview Q&A", "Cambridge English for Job Hunting", "Pronunciation Course"],
  },
];
