// Site-wide settings an admin with the "siteSettings" permission can adjust. Kept as data
// (read/written through adminService) instead of hardcoded constants so behavior like the
// class-entry window can change without a code deploy.
export interface EntryWindowSettings {
  /** How many minutes before a lesson's start time the "수업 입장" button becomes active. */
  earlyEntryMinutes: number;
  /** How many minutes after a lesson's start time the button stays active before switching to "수업 종료". */
  lateExitMinutes: number;
}

export const DEFAULT_ENTRY_WINDOW: EntryWindowSettings = {
  earlyEntryMinutes: 10,
  lateExitMinutes: 25,
};
