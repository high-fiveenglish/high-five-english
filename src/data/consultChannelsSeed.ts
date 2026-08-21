import type { ConsultChannel } from "../lib/community/types";
import { CONTACT } from "./contact";

// Demo seed for admin-managed consult channels — migrates the existing static
// CONTACT.kakaoId/wechatId values so nothing is lost, and adds a customerService
// channel that didn't exist as a real entity before (only as a nav label pointing at
// a placeholder page). No url is seeded for any channel since none of the current
// static data had one — this also means the app launches already exercising the
// "no url yet" fallback path (see consultChannelService/ContactModal).
export const SEED_CONSULT_CHANNELS: ConsultChannel[] = [
  {
    id: "kakao",
    displayName: "카카오톡 상담",
    value: CONTACT.kakaoId,
    enabled: true,
  },
  {
    id: "wechat",
    displayName: "위챗 상담",
    value: CONTACT.wechatId,
    enabled: true,
  },
  {
    id: "customerService",
    displayName: "고객센터",
    value: CONTACT.website,
    enabled: true,
  },
];
