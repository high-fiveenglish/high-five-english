// Teacher Confirmation of the speaker roles. When the application cannot tell with enough confidence which voice is the teacher
// (speakerRoles.ts, LOW), it stops, keeps the transcript it already has, and asks the teacher of that lesson to pick the voice.
// After the pick, the analysis resumes from the STORED utterances — AssemblyAI is not called again, so the transcript (and
// therefore the result) does not change between the first pass and the re-analysis, and no transcription cost is repeated.
//
// This module is pure: the Server Action (recordingActions.ts) hands it Prisma-backed deps, admin/scripts/test-speakerConfirmation.ts
// hands it in-memory fakes. Authorization, label validation and idempotency are decided HERE, on the server, never in the page.
import type { Utterance } from "./talkTime";

export const SPEAKER_LABEL_PATTERN = /^[A-Za-z0-9_-]{1,8}$/;

/** The stored AssemblyAI utterances come back from a JSON column; never trust their shape. */
export function parseStoredUtterances(value: unknown): Utterance[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: Utterance[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const u = raw as Record<string, unknown>;
    if (typeof u.speaker !== "string" || typeof u.text !== "string" || typeof u.start !== "number" || typeof u.end !== "number") return null;
    if (!SPEAKER_LABEL_PATTERN.test(u.speaker)) return null;
    out.push({ speaker: u.speaker, start: u.start, end: u.end, text: u.text });
  }
  return out;
}

/** The speaker labels that really exist in the transcript, sorted alphabetically (the order carries no hint). */
export function speakerLabelsOf(utterances: Utterance[]): string[] {
  return [...new Set(utterances.map((u) => u.speaker))].sort();
}

export interface SpeakerChoice {
  label: string;
  turns: number;
  /** minutes of speech, one decimal */
  minutes: number;
  /** the first lines this voice says (timestamp + short text) so the teacher can recognise it */
  excerpts: { at: string; text: string }[];
}

function mmss(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** What the confirmation screen shows. Neutral on purpose: alphabetical order, no score, no "recommended" voice. */
export function speakerChoicesFor(utterances: Utterance[], excerptCount = 2, excerptLength = 70): SpeakerChoice[] {
  return speakerLabelsOf(utterances).map((label) => {
    const own = utterances.filter((u) => u.speaker === label);
    const ms = own.reduce((n, u) => n + Math.max(0, u.end - u.start), 0);
    const excerpts = own
      .filter((u) => u.text.trim().split(/\s+/).length >= 3)
      .slice(0, excerptCount)
      .map((u) => ({ at: mmss(u.start), text: u.text.trim().length > excerptLength ? `${u.text.trim().slice(0, excerptLength - 1)}…` : u.text.trim() }));
    return { label, turns: own.length, minutes: Math.round((ms / 60000) * 10) / 10, excerpts };
  });
}

export interface ConfirmRecordingView {
  id: number;
  processingStatus: string;
  confirmedTeacherSpeaker: string | null;
  /** raw JSON column value */
  utterances: unknown;
}

export interface ConfirmSessionView {
  /** ClassSession.teacherId — the teacher who owns this lesson */
  sessionTeacherId: number;
  recording: ConfirmRecordingView | null;
}

export interface ConfirmDeps {
  findSession(sessionId: number): Promise<ConfirmSessionView | null>;
  /** NEEDS_SPEAKER_CONFIRMATION -> TEACHER_SPEAKER_CONFIRMED in ONE conditional UPDATE (and the audit fields). true if it changed a row. */
  markConfirmed(recordingId: number, label: string, teacherId: number): Promise<boolean>;
  /** Ask the background function to resume the analysis (it claims the record atomically). true if the request was accepted. */
  triggerProcessing(recordingId: number): Promise<boolean>;
}

export type ConfirmFailure = "invalid_label" | "not_found" | "not_waiting" | "different_label";
export type ConfirmResult =
  | { ok: true; state: "confirmed" | "already_confirmed"; triggered: boolean }
  | { ok: false; error: ConfirmFailure };

/** States in which the roles are already settled for this recording (analysis may be running, finished or failed). */
const SETTLED_STATES = ["TEACHER_SPEAKER_CONFIRMED", "ANALYZING", "NEEDS_REVIEW", "PUBLISHED", "COMPLETED", "ANALYSIS_FAILED"];

export async function confirmTeacherSpeaker(
  deps: ConfirmDeps,
  input: { teacherId: number; sessionId: number; label: unknown },
): Promise<ConfirmResult> {
  // 1. shape of the request (no database yet)
  if (typeof input.label !== "string" || !SPEAKER_LABEL_PATTERN.test(input.label)) return { ok: false, error: "invalid_label" };
  const label = input.label;

  // 2. authorization: only the teacher who owns the lesson. Anyone else gets the same answer as for a lesson that does not exist.
  const found = await deps.findSession(input.sessionId);
  if (!found || found.sessionTeacherId !== input.teacherId || !found.recording) return { ok: false, error: "not_found" };
  const rec = found.recording;

  if (rec.processingStatus === "NEEDS_SPEAKER_CONFIRMATION") {
    // 3. the label must be one of the voices that really exist in the STORED transcript (not whatever the browser sent)
    const utterances = parseStoredUtterances(rec.utterances);
    if (!utterances || !speakerLabelsOf(utterances).includes(label)) return { ok: false, error: "invalid_label" };

    // 4. one conditional UPDATE: of two concurrent confirmations only one changes the row
    const changed = await deps.markConfirmed(rec.id, label, input.teacherId);
    if (!changed) {
      const again = await deps.findSession(input.sessionId);
      const now = again?.recording;
      if (!now || again.sessionTeacherId !== input.teacherId) return { ok: false, error: "not_found" };
      if (now.confirmedTeacherSpeaker === label && SETTLED_STATES.includes(now.processingStatus)) return { ok: true, state: "already_confirmed", triggered: false };
      return { ok: false, error: now.confirmedTeacherSpeaker ? "different_label" : "not_waiting" };
    }
    return { ok: true, state: "confirmed", triggered: await deps.triggerProcessing(rec.id) };
  }

  if (SETTLED_STATES.includes(rec.processingStatus) && rec.confirmedTeacherSpeaker) {
    // A refresh or a second click. The same choice is a no-op; a different one never changes an analysis that already ran or is running.
    if (rec.confirmedTeacherSpeaker !== label) return { ok: false, error: "different_label" };
    // Still waiting for the background function (the first trigger may have been lost): asking again is safe because the claim is atomic.
    const triggered = rec.processingStatus === "TEACHER_SPEAKER_CONFIRMED" ? await deps.triggerProcessing(rec.id) : false;
    return { ok: true, state: "already_confirmed", triggered };
  }

  // Roles were settled automatically (HIGH) or the recording is in a state where there is nothing to confirm.
  return { ok: false, error: "not_waiting" };
}

export const CONFIRM_ERROR_MESSAGES: Record<ConfirmFailure, string> = {
  invalid_label: "Please select one of the speakers listed.",
  not_found: "You can only confirm speakers for your own classes.",
  not_waiting: "This recording is not waiting for a speaker selection.",
  different_label: "A different speaker was already confirmed for this recording. The analysis has started and cannot be changed here.",
};
