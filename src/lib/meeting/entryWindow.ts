import type { EntryWindowSettings } from "../../data/siteSettings";
import type { Lesson } from "../scheduling/types";
import { combineDateTimeMs } from "../scheduling/dateUtils";

export type EntryState = "before" | "active" | "after";

/** Pure time-window calculation for the "수업 입장" button's 3 states, so the same rule
 * drives every place the button appears without duplicating the minute math. Admin can
 * change `settings` (earlyEntryMinutes/lateExitMinutes) and every button updates at once. */
export function resolveEntryState(nowMs: number, lesson: Lesson, settings: EntryWindowSettings): EntryState {
  const startMs = combineDateTimeMs(lesson.scheduledDate, lesson.scheduledTime);
  const activeFrom = startMs - settings.earlyEntryMinutes * 60_000;
  const activeUntil = startMs + settings.lateExitMinutes * 60_000;
  if (nowMs < activeFrom) return "before";
  if (nowMs <= activeUntil) return "active";
  return "after";
}
