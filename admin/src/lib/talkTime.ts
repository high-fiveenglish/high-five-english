// AssemblyAI diarization(utterances)로부터 Talk Time Ratio를 계산하는 순수 함수.
// 비율 계산은 반드시 애플리케이션 코드가 하고 Claude에 위임하지 않는다 — Claude는
// 이미 계산된 숫자를 "설명"하는 데만 쓰인다(aiEvaluation.ts 참고).
export interface Utterance {
  speaker: string;
  start: number; // ms, AssemblyAI 응답 그대로
  end: number; // ms
  text: string;
}

export interface TalkTimeResult {
  teacherSpeakingSeconds: number;
  studentSpeakingSeconds: number;
  /** teacher+student 발화 시간 합 대비 비율(%), 반올림. 둘 다 0초면 둘 다 0. */
  teacherTalkPercentage: number;
  studentTalkPercentage: number;
}

export function computeTalkTime(utterances: Utterance[], teacherSpeakerLabel: string): TalkTimeResult {
  let teacherMs = 0;
  let studentMs = 0;
  for (const u of utterances) {
    const ms = Math.max(0, u.end - u.start);
    if (u.speaker === teacherSpeakerLabel) teacherMs += ms;
    else studentMs += ms;
  }
  const teacherSpeakingSeconds = Math.round(teacherMs / 1000);
  const studentSpeakingSeconds = Math.round(studentMs / 1000);
  const total = teacherSpeakingSeconds + studentSpeakingSeconds;
  const teacherTalkPercentage = total === 0 ? 0 : Math.round((teacherSpeakingSeconds / total) * 100);
  const studentTalkPercentage = total === 0 ? 0 : 100 - teacherTalkPercentage;
  return { teacherSpeakingSeconds, studentSpeakingSeconds, teacherTalkPercentage, studentTalkPercentage };
}

// PLACEHOLDER 휴리스틱 — AssemblyAI의 speaker diarization은 화자를 "A"/"B" 같은
// 익명 라벨로만 구분할 뿐, 그중 누가 강사고 누가 학생인지는 알려주지 않는다.
// 정확한 식별 방법(예: 강사 목소리 프로필 등록 후 매칭)은 실제 수업 녹음으로
// 검증해야 하며, 지금은 "수업을 먼저 시작하는 사람은 보통 강사"라는 단순 가정만
// 둔다 — 실제 25/50분 녹음으로 이 가정이 맞는지 Phase 3+ 전에 반드시 검증 필요.
export function guessTeacherSpeakerLabel(utterances: Utterance[]): string | null {
  return utterances[0]?.speaker ?? null;
}
