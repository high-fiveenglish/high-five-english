import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Video } from "lucide-react";
import type { Lesson } from "../../lib/scheduling/types";
import type { MeetingPlatformId } from "../../data/meetingPlatforms";
import { getMeetingPlatform } from "../../data/meetingPlatforms";
import type { EntryWindowSettings } from "../../data/siteSettings";
import { DEFAULT_ENTRY_WINDOW } from "../../data/siteSettings";
import { resolveEntryState } from "../../lib/meeting/entryWindow";
import { resolveJoinUrl } from "../../lib/meeting/resolveJoinUrl";
import type { TeacherMeetingLinks } from "../../services/store";

/** The most prominent "수업 입장" control — label auto-switches by meeting platform, and
 * its enabled/disabled state auto-switches by how close `lesson` is to starting. Renders
 * nothing when there is no upcoming lesson to enter. */
export function EnterClassButton({
  lesson,
  platform,
  teacherMeetingLinks,
  entryWindow = DEFAULT_ENTRY_WINDOW,
  size = "lg",
}: {
  lesson: Lesson | null;
  platform: MeetingPlatformId;
  teacherMeetingLinks: TeacherMeetingLinks;
  entryWindow?: EntryWindowSettings;
  size?: "lg" | "sm";
}) {
  const { t } = useTranslation("classroom");
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!lesson) return null;

  const platformInfo = getMeetingPlatform(platform);
  const joinUrl = resolveJoinUrl(lesson, teacherMeetingLinks, platform);
  const entryState = resolveEntryState(nowMs, lesson, entryWindow);

  const sizeClasses = size === "lg" ? "px-6 py-3.5 text-sm" : "px-4 py-2 text-xs";

  if (entryState === "after") {
    return (
      <button
        disabled
        className={`flex items-center justify-center gap-2 rounded-xl bg-slate-100 font-bold text-slate-400 ${sizeClasses}`}
      >
        <Video size={16} /> {t("enter_button.class_ended")}
      </button>
    );
  }

  if (!joinUrl) {
    return (
      <button
        disabled
        title={t("enter_button.link_pending_tooltip")}
        className={`flex items-center justify-center gap-2 rounded-xl bg-slate-100 font-bold text-slate-400 ${sizeClasses}`}
      >
        <Video size={16} /> {t("enter_button.link_pending")}
      </button>
    );
  }

  if (entryState === "before") {
    return (
      <button
        disabled
        title={t("enter_button.enter_before_tooltip", { minutes: entryWindow.earlyEntryMinutes })}
        className={`flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 font-bold text-slate-400 ${sizeClasses}`}
      >
        <Video size={16} /> {t("enter_button.enter_class", { platform: platformInfo.shortName })}
      </button>
    );
  }

  return (
    <a
      href={joinUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center justify-center gap-2 rounded-xl bg-accent-500 font-bold text-white shadow-sm transition hover:bg-accent-600 ${sizeClasses}`}
    >
      <Video size={16} /> {t("enter_button.enter_now", { platform: platformInfo.shortName })}
    </a>
  );
}
