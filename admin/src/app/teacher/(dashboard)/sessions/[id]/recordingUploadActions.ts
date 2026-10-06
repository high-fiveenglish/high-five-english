"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTeacher } from "@/lib/teacherAuth";
import { requirePermission, resolveRolePermissions } from "@/lib/rbac";
import { submitTranscript } from "@/lib/assemblyai";
import { getRecordingStore } from "@/lib/recordingR2";
import { isRecordingIntakeAvailable, recordingWebhookUrl } from "@/lib/recordingIntakeConfig";
import { truncateErrorMessage } from "@/lib/recordingWorkflow";
import { downloadUrlTtlSec, maxRecordingBytes } from "@/lib/recordingUpload";
import {
  completeRecordingUpload as completeUpload,
  requestRecordingUpload as requestUpload,
  uploadErrorMessage,
  type UploadFlowDeps,
} from "@/lib/recordingUploadFlow";

// The two Server Actions of the recording upload. The file's bytes NEVER pass through this server (Netlify caps a request body at ~6 MB): the
// browser writes straight to the private R2 bucket with a short-lived URL issued by requestRecordingUpload, then calls completeRecordingUpload,
// which checks the object and sends a short-lived read URL to AssemblyAI (the existing submitTranscript — Universal-2 + speaker_labels + webhook).
// Who may do what, the order of the checks and every state change are decided in recordingUploadFlow.ts; this file only authenticates, wires
// Prisma / R2 / AssemblyAI and revalidates the page. The teacher id comes from the session cookie, never from the request.
//
// Both actions are called from client code with plain arguments (not through useActionState / .bind), and every argument is treated as untrusted.
export type RecordingUploadActionResult =
  | { ok: true; uploadUrl: string; contentType: string }
  | { ok: false; message: string };
export type RecordingCompleteActionResult = { ok: true } | { ok: false; message: string };

/** The lesson id for revalidatePath: only a plain positive integer, so a hostile value can never name another path. */
function pageIdOf(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function authenticatedTeacher() {
  const teacher = await requireTeacher();
  const actor = {
    role: "TEACHER" as const,
    id: teacher.id,
    name: teacher.realName,
    permissions: await resolveRolePermissions("TEACHER"),
  };
  requirePermission(actor, "own_evaluations.update");
  return teacher;
}

function buildDeps(): UploadFlowDeps | null {
  const store = getRecordingStore();
  const webhookUrl = recordingWebhookUrl();
  const webhookSecret = process.env.ASSEMBLYAI_WEBHOOK_SECRET?.trim();
  if (!store || !webhookUrl || !webhookSecret || !isRecordingIntakeAvailable()) return null;
  return {
    async findSession(sessionId) {
      const s = await prisma.classSession.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          teacherId: true,
          status: true,
          scheduledAt: true,
          deletedAt: true,
          audioRecording: { select: { id: true, processingStatus: true, driveFileId: true, updatedAt: true } },
        },
      });
      return s ? { id: s.id, teacherId: s.teacherId, status: s.status, scheduledAt: s.scheduledAt, deletedAt: s.deletedAt, recording: s.audioRecording } : null;
    },
    async createRecording({ classSessionId, fileName, storedRef }) {
      try {
        await prisma.audioRecording.create({ data: { classSessionId, fileName, driveFileId: storedRef, processingStatus: "UPLOADED" } });
        return "created";
      } catch (err) {
        if ((err as { code?: string }).code === "P2002") return "exists"; // unique classSessionId: another request created the row first
        throw err;
      }
    },
    async reuseRecording(id, fromStatuses, olderThan, { fileName, storedRef }) {
      const res = await prisma.audioRecording.updateMany({
        where: { id, processingStatus: { in: fromStatuses }, ...(olderThan ? { updatedAt: { lt: olderThan } } : {}) },
        data: {
          processingStatus: "UPLOADED",
          driveFileId: storedRef,
          fileName,
          errorMessage: null,
          provider: null,
          providerTranscriptId: null,
          duration: null,
          deletedAt: null,
          uploadedAt: new Date(),
        },
      });
      return res.count === 1;
    },
    async claimForSubmit(id) {
      const res = await prisma.audioRecording.updateMany({ where: { id, processingStatus: "UPLOADED" }, data: { processingStatus: "PUBLIC_READY" } });
      return res.count === 1;
    },
    async saveTranscribing(id, transcriptId) {
      const res = await prisma.audioRecording.updateMany({
        where: { id, processingStatus: "PUBLIC_READY" },
        data: { processingStatus: "TRANSCRIBING", provider: "assemblyai", providerTranscriptId: transcriptId },
      });
      return res.count === 1;
    },
    async markUploadFailed(id, fromStatuses, message) {
      const res = await prisma.audioRecording.updateMany({
        where: { id, processingStatus: { in: fromStatuses } },
        data: { processingStatus: "UPLOAD_FAILED", errorMessage: truncateErrorMessage(message) },
      });
      return res.count === 1;
    },
    store,
    // the existing client: Universal-2 + speaker_labels are fixed inside assemblyai.ts, and the webhook carries the shared secret header
    submit: (audioUrl) => submitTranscript(audioUrl, { webhookUrl, webhookSecret }),
    maxBytes: maxRecordingBytes(),
    downloadTtlSec: downloadUrlTtlSec(),
    now: () => new Date(),
  };
}

const NOT_AVAILABLE = "Recording upload is not available yet.";

export async function requestRecordingUpload(input: {
  sessionId: number;
  fileName: string;
  contentType: string;
  size: number;
}): Promise<RecordingUploadActionResult> {
  const teacher = await authenticatedTeacher();
  const deps = buildDeps();
  if (!deps) return { ok: false, message: NOT_AVAILABLE };
  const i = (input ?? {}) as Record<string, unknown>;
  const result = await requestUpload(deps, { teacherId: teacher.id, sessionId: i.sessionId, fileName: i.fileName, contentType: i.contentType, size: i.size });
  if (!result.ok) return { ok: false, message: uploadErrorMessage(result.error, result.message) };
  const pageId = pageIdOf(i.sessionId);
  if (pageId) revalidatePath(`/teacher/sessions/${pageId}`);
  return { ok: true, uploadUrl: result.uploadUrl, contentType: result.contentType };
}

export async function completeRecordingUpload(input: { sessionId: number }): Promise<RecordingCompleteActionResult> {
  const teacher = await authenticatedTeacher();
  const deps = buildDeps();
  if (!deps) return { ok: false, message: NOT_AVAILABLE };
  const i = (input ?? {}) as Record<string, unknown>;
  const result = await completeUpload(deps, { teacherId: teacher.id, sessionId: i.sessionId });
  const pageId = pageIdOf(i.sessionId);
  if (pageId) revalidatePath(`/teacher/sessions/${pageId}`);
  if (!result.ok) return { ok: false, message: uploadErrorMessage(result.error, result.message) };
  return { ok: true };
}
