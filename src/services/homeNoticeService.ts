// Homepage notice board service layer — bridges to the real admin/LMS backend's public
// API (admin/src/app/api/public/home-notices). Reading (listPublishedHomeNotices/
// getPublishedHomeNotice) is public, no login required, matching the real homepage's
// visitor-facing feed. Writing is only ever done from the real admin/ Next.js app in
// practice, but this site's own mock admin panel (/admin/home-notices) can also write via
// adminApiToken (see AuthContext) — both paths hit the same real DB.
import type { HomeNotice } from "../lib/community/types";
import type { AuthErrorCode, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { ADMIN_API_URL, getTenantDomain } from "../lib/adminApi";

async function parseErrorCode(res: Response): Promise<AuthErrorCode> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error === "forbidden") return "FORBIDDEN_ROLE";
    if (data.error === "not_found") return "NOT_FOUND";
  } catch {
    /* fall through */
  }
  return res.status === 401 ? "UNAUTHENTICATED" : "NOT_FOUND";
}

async function fetchPublishedHomeNotices(): Promise<HomeNotice[]> {
  try {
    const domain = encodeURIComponent(getTenantDomain());
    const res = await fetch(`${ADMIN_API_URL}/api/public/home-notices?domain=${domain}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as HomeNotice[];
  } catch (err) {
    console.warn("[homeNoticeService] admin backend unreachable", err);
    return [];
  }
}

/** NoticeBoardPage(공지사항 게시판)는 글 작성/수정/삭제 후 매번 최신 목록을 다시
 * 봐야 하므로 이 함수는 캐시 없이 항상 네트워크로 조회한다 — 캐시는 아래
 * 홈페이지 요약 섹션 전용 함수(listPublishedHomeNoticesForHome)에만 있다. */
export function listPublishedHomeNotices(): Promise<HomeNotice[]> {
  return fetchPublishedHomeNotices();
}

// 모듈 레벨 캐시 — instructorService.ts의 강사소개 캐시와 동일한 패턴(공개 데이터라
// 사용자별로 섞일 위험이 없음). 홈페이지 "공지사항" 섹션이 데이터 도착 전에는 아예
// 렌더링을 안 하다가(return null) 갑자기 나타나는 게 버퍼링처럼 느껴진다는 문제가
// 측정으로 확인되어, App.tsx가 부팅 시점에 미리 조회해 캐시를 데워두면 재방문 시
// 네트워크 왕복 없이 바로 보이게 한다. 위 listPublishedHomeNotices()와 분리해 둔
// 이유: 이 캐시는 세션 동안 갱신되지 않아 홈페이지 요약(마케팅 티저)에는 맞지만,
// 글쓰기 직후 최신 목록을 봐야 하는 게시판 화면에 쓰면 새 글이 안 보이는 문제가 생긴다.
let homeCache: HomeNotice[] | null = null;
let homeInflight: Promise<HomeNotice[]> | null = null;

export function getCachedPublishedHomeNoticesForHome(): HomeNotice[] | null {
  return homeCache;
}

export function listPublishedHomeNoticesForHome(): Promise<HomeNotice[]> {
  if (homeCache) return Promise.resolve(homeCache);
  if (!homeInflight) {
    homeInflight = fetchPublishedHomeNotices()
      .then((data) => {
        homeCache = data;
        return data;
      })
      .finally(() => {
        homeInflight = null;
      });
  }
  return homeInflight;
}

export async function getPublishedHomeNotice(id: string): Promise<HomeNotice | null> {
  try {
    const res = await fetch(`${ADMIN_API_URL}/api/public/home-notices/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as HomeNotice;
  } catch {
    return null;
  }
}

export async function listAllHomeNotices(adminApiToken: string | null): Promise<ServiceResult<HomeNotice[]>> {
  if (!adminApiToken) return errResult("UNAUTHENTICATED", "로그인이 필요합니다.");
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/home-notices`, {
      headers: { Authorization: `Bearer ${adminApiToken}` },
    });
  } catch {
    return errResult("NOT_FOUND", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  if (!res.ok) return errResult(await parseErrorCode(res), "공지사항을 불러오지 못했습니다.");
  return okResult((await res.json()) as HomeNotice[]);
}

export async function createHomeNotice(
  adminApiToken: string | null,
  input: { title: string; content: string; published: boolean },
): Promise<ServiceResult<HomeNotice>> {
  if (!adminApiToken) return errResult("UNAUTHENTICATED", "로그인이 필요합니다.");
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/home-notices`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminApiToken}` },
      body: JSON.stringify(input),
    });
  } catch {
    return errResult("NOT_FOUND", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  if (!res.ok) return errResult(await parseErrorCode(res), "공지사항을 등록하지 못했습니다.");
  const data = (await res.json()) as { id: string };
  return okResult({ id: data.id, ...input, createdAt: new Date().toISOString(), views: 0 });
}

export async function updateHomeNotice(
  adminApiToken: string | null,
  id: string,
  input: { title: string; content: string; published: boolean },
): Promise<ServiceResult<void>> {
  if (!adminApiToken) return errResult("UNAUTHENTICATED", "로그인이 필요합니다.");
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/home-notices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminApiToken}` },
      body: JSON.stringify(input),
    });
  } catch {
    return errResult("NOT_FOUND", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  if (!res.ok) return errResult(await parseErrorCode(res), "공지사항을 수정하지 못했습니다.");
  return okResult(undefined);
}

export async function deleteHomeNotice(adminApiToken: string | null, id: string): Promise<ServiceResult<void>> {
  if (!adminApiToken) return errResult("UNAUTHENTICATED", "로그인이 필요합니다.");
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/home-notices/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminApiToken}` },
    });
  } catch {
    return errResult("NOT_FOUND", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  if (!res.ok) return errResult(await parseErrorCode(res), "공지사항을 삭제하지 못했습니다.");
  return okResult(undefined);
}
