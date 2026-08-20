// Extensible catalog of video-meeting programs. Adding a future platform (e.g.
// Google Meet) means appending one entry here — every card, dropdown, and type in
// the app derives from this array, nothing else references Zoom/VooV/Teams by name.
// Official download links verified 2026-08.
export type DownloadLinks = {
  pc: string;
  android: string;
  ios: string;
};

export type MeetingPlatformInput = {
  id: string;
  name: string;
  shortName: string;
  brandColor: string;
  officialSiteUrl: string;
  downloadLinks: DownloadLinks;
  enabled: boolean;
};

export const MEETING_PLATFORMS = [
  {
    id: "zoom",
    name: "Zoom",
    shortName: "Zoom",
    brandColor: "#2D8CFF",
    officialSiteUrl: "https://zoom.us",
    downloadLinks: {
      pc: "https://zoom.us/download",
      android: "https://play.google.com/store/apps/details?id=us.zoom.videomeetings",
      ios: "https://apps.apple.com/us/app/zoom-one-platform-to-connect/id546505307",
    },
    enabled: true,
  },
  {
    id: "voov",
    name: "VooV Meeting (Tencent Meeting)",
    shortName: "VooV Meeting",
    brandColor: "#0052D9",
    officialSiteUrl: "https://voovmeeting.com",
    downloadLinks: {
      pc: "https://voovmeeting.com/download-center.html",
      android: "https://play.google.com/store/apps/details?id=com.tencent.voov",
      ios: "https://apps.apple.com/us/app/voov-meeting/id1497685373",
    },
    enabled: true,
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    shortName: "Teams",
    brandColor: "#6264A7",
    officialSiteUrl: "https://www.microsoft.com/microsoft-teams",
    downloadLinks: {
      pc: "https://www.microsoft.com/en-us/microsoft-teams/download-app",
      android: "https://play.google.com/store/apps/details?id=com.microsoft.teams",
      ios: "https://apps.apple.com/us/app/microsoft-teams/id1113153706",
    },
    enabled: true,
  },
] as const satisfies MeetingPlatformInput[];

export type MeetingPlatformId = (typeof MEETING_PLATFORMS)[number]["id"];
// A widened (non-literal-union) shape so it can be used as a normal object type —
// e.g. `interface X extends MeetingPlatform` — while MeetingPlatformId (above) still
// keeps the precise "zoom" | "voov" | "teams" union derived from the catalog.
export type MeetingPlatform = MeetingPlatformInput;

export function getMeetingPlatform(id: MeetingPlatformId): MeetingPlatform {
  const platform = MEETING_PLATFORMS.find((p) => p.id === id);
  if (!platform) throw new Error(`Unknown meeting platform: ${id}`);
  return platform;
}
