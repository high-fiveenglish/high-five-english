import { useEffect, useState } from "react";
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
        <Video size={16} /> 수업 종료
      </button>
    );
  }

  if (!joinUrl) {
    return (
      <button
        disabled
        title="담당 강사가 아직 참여 링크를 등록하지 않았습니다"
        className={`flex items-center justify-center gap-2 rounded-xl bg-slate-100 font-bold text-slate-400 ${sizeClasses}`}
      >
        <Video size={16} /> 입장 링크 준비 중
      </button>
    );
  }

  if (entryState === "before") {
    return (
      <button
        disabled
        title={`수업 시작 ${entryWindow.earlyEntryMinutes}분 전부터 입장할 수 있습니다`}
        className={`flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 font-bold text-slate-400 ${sizeClasses}`}
      >
        <Video size={16} /> {platformInfo.shortName} 수업 입장
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
      <Video size={16} /> 지금 {platformInfo.shortName} 수업 입장하기
    </a>
  );
}
