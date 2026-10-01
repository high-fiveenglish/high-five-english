// Netlify Background Function — 최대 15분까지 실행 가능하며, 트리거한 쪽(webhook
// 라우트)의 HTTP 응답 시간과 완전히 분리되어 독립적으로 완료된다. 파일명의
// "-background" 접미사가 Netlify에 이 동작을 지시한다.
//
// 역할: AssemblyAI transcript 조회 → Talk Time Ratio 계산(애플리케이션 코드) →
// student context 조회(나이/교재/수업유형) → Claude로 Output1(학생 피드백)/
// Output2(강사 QC) 동시 생성(evaluationSkillRules.ts가 평가 기준의 출처) →
// AudioRecording.aiDraft / teacherQcDraft에 각각 저장.
import { prisma } from "../../src/lib/prisma";
import { fetchTranscript } from "../../src/lib/assemblyai";
import { computeTalkTime, guessTeacherSpeakerLabel } from "../../src/lib/talkTime";
import { generateAIEvaluationDraft } from "../../src/lib/aiEvaluation";
import { ageBandFromBirthDate } from "../../src/lib/evaluationSkillRules";
import { formatAppDate } from "../../src/lib/appTime";

export default async (req: Request) => {
  let body: { audioRecordingId?: number };
  try {
    body = (await req.json()) as { audioRecordingId?: number };
  } catch {
    return new Response("invalid_json", { status: 400 });
  }
  const { audioRecordingId } = body;
  if (typeof audioRecordingId !== "number") {
    return new Response("missing_audioRecordingId", { status: 400 });
  }

  const recording = await prisma.audioRecording.findUnique({
    where: { id: audioRecordingId },
    include: {
      classSession: {
        include: {
          student: { select: { birthDate: true, region: true } },
          enrollment: { select: { textbookName: true, classMethod: true } },
        },
      },
    },
  });
  if (!recording || !recording.providerTranscriptId) {
    return new Response("not_found", { status: 404 });
  }

  try {
    const transcript = await fetchTranscript(recording.providerTranscriptId);
    if (!transcript || transcript.status !== "completed" || !transcript.utterances) {
      await prisma.audioRecording.update({
        where: { id: recording.id },
        data: { processingStatus: "ANALYSIS_FAILED", errorMessage: "AssemblyAI transcript not completed or missing utterances" },
      });
      return new Response("transcript_unavailable", { status: 200 });
    }

    const teacherLabel = guessTeacherSpeakerLabel(transcript.utterances);
    const talkTime = teacherLabel
      ? computeTalkTime(transcript.utterances, teacherLabel)
      : { teacherSpeakingSeconds: 0, studentSpeakingSeconds: 0, teacherTalkPercentage: 0, studentTalkPercentage: 0 };

    // webhook 쪽 race 방지(updateMany + where 상태 조건)와 같은 패턴을 여기서도
    // 쓴다 — 이 함수 자체가 중복 호출될 가능성(webhook 재전송, Netlify 재시도 등)에
    // 대비한 두 번째 방어선이다. 정확히 "TRANSCRIBED" 상태인 레코드만 이 호출이
    // ANALYZING으로 전이시킬 수 있고, 전이에 성공한 호출만 Claude를 부른다 — 두
    // 호출이 동시에 들어와도 Claude API가 중복 호출되거나 aiDraft가 두 번 겹쳐
    // 쓰이지 않는다.
    const claimed = await prisma.audioRecording.updateMany({
      where: { id: recording.id, processingStatus: "TRANSCRIBED" },
      data: {
        processingStatus: "ANALYZING",
        transcript: transcript.text,
        duration: transcript.audio_duration ?? null,
        teacherSpeakingSeconds: talkTime.teacherSpeakingSeconds,
        studentSpeakingSeconds: talkTime.studentSpeakingSeconds,
        teacherTalkPercentage: talkTime.teacherTalkPercentage,
        studentTalkPercentage: talkTime.studentTalkPercentage,
      },
    });
    if (claimed.count === 0) {
      // 다른 호출이 이미 이 레코드를 선점했다(중복 invocation) — 여기서 조용히 종료.
      return new Response("already_claimed", { status: 200 });
    }

    const result = await generateAIEvaluationDraft({
      transcript: transcript.text ?? "",
      talkTime,
      lessonContext: {
        // ClassSession.scheduledAt(실제 수업 날짜)에서 애플리케이션이 뽑아 전달한다 —
        // Claude가 날짜를 추측하지 않는다(appTime.ts의 Asia/Seoul 고정 정책 그대로 재사용).
        lessonDate: formatAppDate(recording.classSession.scheduledAt),
        lessonDurationMinutes: recording.classSession.durationMin,
        studentAgeBand: ageBandFromBirthDate(recording.classSession.student.birthDate),
        studentRegion: recording.classSession.student.region,
        textbookName: recording.classSession.enrollment.textbookName,
        classMethod: recording.classSession.enrollment.classMethod,
      },
    });
    if (!result) {
      await prisma.audioRecording.update({
        where: { id: recording.id },
        data: { processingStatus: "ANALYSIS_FAILED", errorMessage: "Claude draft generation failed or ANTHROPIC_API_KEY not configured" },
      });
      return new Response("draft_generation_failed", { status: 200 });
    }

    await prisma.audioRecording.update({
      where: { id: recording.id },
      data: {
        processingStatus: "NEEDS_REVIEW",
        aiDraft: result.studentFeedback,
        teacherQcDraft: result.teacherQc,
        analyzedAt: new Date(),
      },
    });
    return new Response("ok", { status: 200 });
  } catch (err) {
    await prisma.audioRecording.update({
      where: { id: recording.id },
      data: { processingStatus: "ANALYSIS_FAILED", errorMessage: err instanceof Error ? err.message : String(err) },
    });
    return new Response("error", { status: 200 });
  }
};
