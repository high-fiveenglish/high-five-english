// Netlify Background Function — 최대 15분까지 실행 가능하며, 트리거한 쪽(webhook
// 라우트)의 HTTP 응답 시간과 완전히 분리되어 독립적으로 완료된다. 파일명의
// "-background" 접미사가 Netlify에 이 동작을 지시한다.
//
// 역할: AssemblyAI transcript 조회 → Talk Time Ratio 계산(애플리케이션 코드) →
// student context 조회(나이/교재/수업유형) → Claude로 Output1(학생 피드백)/
// Output2(강사 QC) 동시 생성(evaluationSkillRules.ts가 평가 기준의 출처) →
// AudioRecording.aiDraft / teacherQcDraft에 각각 저장.
//
// 인증: X-Recording-Processing-Secret 헤더가 RECORDING_PROCESSING_SECRET과 일치하는
// 요청만 처리한다(recordingProcessingAuth.ts). 호출자는 assemblyai-webhook과
// recover-transcribed-recordings뿐이며 둘 다 recordingTrigger.ts로 이 헤더를 붙인다.
// 처리 로직 본체와 테스트는 recordingProcessing.ts / test-recordingProcessing.ts 참고.
import { prisma } from "../../src/lib/prisma";
import { fetchTranscript } from "../../src/lib/assemblyai";
import { generateAIEvaluationDraft } from "../../src/lib/aiEvaluation";
import { ageBandFromBirthDate } from "../../src/lib/evaluationSkillRules";
import { formatAppDate } from "../../src/lib/appTime";
import { getRecordingProcessingSecret } from "../../src/lib/recordingProcessingAuth";
import { handleProcessRecordingRequest, type ProcessRecordingDeps } from "../../src/lib/recordingProcessing";

const prismaDeps: ProcessRecordingDeps = {
  async findRecording(id) {
    const recording = await prisma.audioRecording.findUnique({
      where: { id },
      include: {
        classSession: {
          include: {
            student: { select: { birthDate: true, region: true } },
            enrollment: { select: { textbookName: true, classMethod: true } },
          },
        },
      },
    });
    if (!recording) return null;
    return {
      id: recording.id,
      providerTranscriptId: recording.providerTranscriptId,
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
    };
  },
  fetchTranscript,
  async claimForAnalysis(id, data) {
    const claimed = await prisma.audioRecording.updateMany({
      where: { id, processingStatus: "TRANSCRIBED" },
      data: { processingStatus: "ANALYZING", ...data },
    });
    return claimed.count === 1;
  },
  async markFailed(id, fromStatus, errorMessage) {
    await prisma.audioRecording.updateMany({
      where: { id, processingStatus: fromStatus },
      data: { processingStatus: "ANALYSIS_FAILED", errorMessage },
    });
  },
  async saveDraft(id, result) {
    await prisma.audioRecording.update({
      where: { id },
      data: {
        processingStatus: "NEEDS_REVIEW",
        aiDraft: result.studentFeedback,
        teacherQcDraft: result.teacherQc,
        analyzedAt: new Date(),
      },
    });
  },
  generateDraft: generateAIEvaluationDraft,
};

export default async (req: Request) => handleProcessRecordingRequest(req, getRecordingProcessingSecret(), prismaDeps);
