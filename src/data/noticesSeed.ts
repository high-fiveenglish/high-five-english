import type { Notice } from "../lib/community/types";

// Demo seed for the notice board — kept as a plain data file (not inside store.ts
// itself) so store.ts doesn't need to define types, matching the classroomMock.ts
// convention for seed data.
export const SEED_NOTICES: Notice[] = [
  {
    id: "notice-1",
    title: "추석 연휴 휴강 안내",
    content:
      "추석 연휴 기간(9/24~9/27) 동안 모든 수업이 휴강됩니다. 해당 기간 수업은 자동으로 다음 가능한 일정으로 순연되며, 별도 신청은 필요하지 않습니다.",
    authorAccountId: "manager",
    authorName: "김대표",
    published: true,
    createdAt: "2026-08-10T09:00:00.000Z",
    updatedAt: "2026-08-10T09:00:00.000Z",
  },
  {
    id: "notice-2",
    title: "화상회의 프로그램 안내 페이지 업데이트",
    content:
      "Zoom, VooV Meeting, Microsoft Teams 설치 안내 페이지가 최신 버전 기준으로 업데이트되었습니다. 프로그램 설치 메뉴에서 확인하실 수 있습니다.",
    authorAccountId: "admin2",
    authorName: "이운영",
    published: true,
    createdAt: "2026-08-05T09:00:00.000Z",
    updatedAt: "2026-08-05T09:00:00.000Z",
  },
];
