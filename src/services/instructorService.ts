// 홈페이지 강사소개 섹션은 이제 관리자가 별도로 입력하던 마케팅용 프로필이 아니라,
// 실제 강사 계정(admin의 Teacher, 계정상태 ACTIVE) 중에서 그대로 가져온다 — 그래서
// admin의 "강사소개 관리" 화면도, 이 사이트의 예전 mock CRUD 관리 화면
// (AdminInstructorsPage 등)도 함께 제거되었다. 이 파일은 그 공개 조회 함수 하나만
// 남긴다.
//
// 모듈 레벨 캐시: "강사소개" 섹션은 홈페이지 밖에서 눌러도(다른 페이지 → 홈으로
// 이동 + 스크롤) 버퍼링 없이 바로 보여야 한다는 요청으로, 첫 조회 결과를 캐시해
// 같은 세션 안에서는 다시 네트워크를 타지 않는다. App.tsx가 앱 부팅 시점에 미리
// 한 번 호출해 데이터를 데워두므로(prefetch), 실제로 그 페이지로 이동할 때는 이미
// 캐시가 채워져 있어 로딩 스켈레톤이 거의 보이지 않는다.
import { ADMIN_API_URL } from "../lib/adminApi";

// audioUrl(음성)은 목록 응답에 더 이상 포함되지 않는다 — 강사 1인당 최대 수MB(base64)라
// 13명 전체를 한 번에 받으면 응답이 18.9MB까지 커지는데, 실제로 음성이 필요한 시점은
// 강사소개 카드를 클릭해서 상세 모달을 열 때 그 한 명뿐이다(getTeacherVoice로 그때
// 지연 조회). 목록 단계에서는 항상 undefined다.
export type PublicTeacher = {
  id: number;
  name: string;
  nickname: string | null;
  nationality: string | null;
  grade: string;
  photoUrl: string | null;
  bio: string | null;
  experience: string | null;
  videoYoutubeCode: string | null;
  tesol: boolean;
  workingHours: string | null;
};

let cache: PublicTeacher[] | null = null;
let inflight: Promise<PublicTeacher[]> | null = null;

/** Synchronous read of whatever's cached so far (null = not fetched yet) — lets a
 * component initialize its state without a guaranteed-empty first render. */
export function getCachedPublicInstructors(): PublicTeacher[] | null {
  return cache;
}

export function listPublicInstructors(): Promise<PublicTeacher[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch(`${ADMIN_API_URL}/api/public/teachers`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<PublicTeacher[]>;
      })
      .then((data) => {
        cache = data;
        return data;
      })
      .catch((err) => {
        console.warn("[instructorService] admin backend unreachable", err);
        return [];
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

// 강사 상세 모달(PublicTeacherModal)을 열 때만 그 한 명의 음성을 지연 조회한다.
// 같은 강사를 다시 열 때 매번 다시 받지 않도록 강사별로 결과를 캐시한다.
const voiceCache = new Map<number, string | null>();

export async function getTeacherVoice(teacherId: number): Promise<string | null> {
  if (voiceCache.has(teacherId)) return voiceCache.get(teacherId)!;
  try {
    const res = await fetch(`${ADMIN_API_URL}/api/public/teachers/${teacherId}/voice`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { audioUrl: string | null };
    voiceCache.set(teacherId, data.audioUrl);
    return data.audioUrl;
  } catch (err) {
    console.warn("[instructorService] voice fetch failed", err);
    return null;
  }
}
