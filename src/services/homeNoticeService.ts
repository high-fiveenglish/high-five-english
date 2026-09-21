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

export async function listPublishedHomeNotices(): Promise<HomeNotice[]> {
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
