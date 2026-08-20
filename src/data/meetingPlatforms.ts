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
  description: string;
  officialSiteUrl: string;
  downloadLinks: DownloadLinks;
  installSteps: string[];
  joinSteps: string[];
  enabled: boolean;
};

export const MEETING_PLATFORMS = [
  {
    id: "zoom",
    name: "Zoom",
    shortName: "Zoom",
    brandColor: "#2D8CFF",
    description: "가장 널리 쓰이는 화상회의 프로그램입니다. 대부분의 정규 수업에서 기본으로 사용합니다.",
    officialSiteUrl: "https://zoom.us",
    downloadLinks: {
      pc: "https://zoom.us/download",
      android: "https://play.google.com/store/apps/details?id=us.zoom.videomeetings",
      ios: "https://apps.apple.com/us/app/zoom-one-platform-to-connect/id546505307",
    },
    installSteps: [
      "zoom.us/download 접속 후 'Zoom Workplace 데스크톱 앱'을 다운로드합니다.",
      "다운로드한 설치 파일을 실행해 설치를 완료합니다.",
      "별도 계정 가입 없이도 수업 참여가 가능합니다 (로그인은 선택 사항).",
      "수업 시작 전 강사가 안내한 참여 링크 또는 회의 ID를 확인해둡니다.",
    ],
    joinSteps: [
      "수업 시작 5분 전, 강사가 보낸 참여 링크를 클릭합니다.",
      "Zoom 앱이 자동으로 열리며, 앱이 없다면 안내에 따라 먼저 설치합니다.",
      "카메라·마이크 사용 권한 요청이 뜨면 '허용'을 선택합니다.",
      "'컴퓨터 오디오로 참가'를 선택하면 수업 준비가 끝납니다.",
    ],
    enabled: true,
  },
  {
    id: "voov",
    name: "VooV Meeting (Tencent Meeting)",
    shortName: "VooV Meeting",
    brandColor: "#0052D9",
    description: "중국 등 일부 지역에서 접속이 원활한 화상회의 프로그램입니다. Tencent Meeting의 해외 버전입니다.",
    officialSiteUrl: "https://voovmeeting.com",
    downloadLinks: {
      pc: "https://voovmeeting.com/download-center.html",
      android: "https://play.google.com/store/apps/details?id=com.tencent.voov",
      ios: "https://apps.apple.com/us/app/voov-meeting/id1497685373",
    },
    installSteps: [
      "voovmeeting.com/download-center.html 접속 후 사용 중인 기기에 맞는 버전을 다운로드합니다.",
      "다운로드한 설치 파일을 실행해 설치를 완료합니다.",
      "앱을 실행합니다 (회원가입 없이 '게스트로 참여'도 가능합니다).",
      "수업 시작 전 강사가 안내한 회의 ID 또는 참여 링크를 확인해둡니다.",
    ],
    joinSteps: [
      "수업 시작 5분 전, 강사가 보낸 참여 링크를 클릭하거나 앱에서 '참여하기(Join)'를 누릅니다.",
      "안내된 회의 ID를 입력합니다 (링크로 접속하면 자동 입력됩니다).",
      "카메라·마이크 사용 권한 요청이 뜨면 '허용'을 선택합니다.",
      "이름을 입력하고 입장하면 수업 준비가 끝납니다.",
    ],
    enabled: true,
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    shortName: "Teams",
    brandColor: "#6264A7",
    description: "기관·기업 회원 등 필요에 따라 사용하는 화상회의 프로그램입니다.",
    officialSiteUrl: "https://www.microsoft.com/microsoft-teams",
    downloadLinks: {
      pc: "https://www.microsoft.com/en-us/microsoft-teams/download-app",
      android: "https://play.google.com/store/apps/details?id=com.microsoft.teams",
      ios: "https://apps.apple.com/us/app/microsoft-teams/id1113153706",
    },
    installSteps: [
      "microsoft.com/microsoft-teams/download-app 접속 후 다운로드합니다.",
      "다운로드한 설치 파일을 실행해 설치를 완료합니다.",
      "Microsoft 계정으로 로그인하거나, 링크로 접속 시 '게스트로 계속'을 선택할 수 있습니다.",
      "수업 시작 전 강사가 안내한 Teams 회의 링크를 확인해둡니다.",
    ],
    joinSteps: [
      "수업 시작 5분 전, 강사가 보낸 Teams 회의 링크를 클릭합니다.",
      "'Teams 앱 열기' 또는 '웹에서 계속하기' 중 선택합니다.",
      "카메라·마이크 사용 권한 요청이 뜨면 '허용'을 선택합니다.",
      "'지금 참가'를 클릭하면 수업 준비가 끝납니다.",
    ],
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
