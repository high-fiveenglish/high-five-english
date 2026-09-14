// Consult-channel service layer — bridges to the real admin/LMS backend's public API
// (admin/src/app/api/public/consult-channels). Reading (listActiveConsultChannels) is
// public, no login required. Writing is done from this site's own mock admin panel
// (/admin/consult-channels) via adminApiToken (see AuthContext).
import type { ConsultChannel, ConsultChannelId } from "../lib/community/types";
import type { AuthErrorCode, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { ADMIN_API_URL } from "../lib/adminApi";

async function parseErrorCode(res: Response): Promise<AuthErrorCode> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error === "forbidden") return "FORBIDDEN_ROLE";
    if (data.error === "not_found") return "NOT_FOUND";
    if (data.error === "invalid_url") return "NOT_FOUND";
  } catch {
    /* fall through */
  }
  return res.status === 401 ? "UNAUTHENTICATED" : "NOT_FOUND";
}

export async function listActiveConsultChannels(): Promise<ConsultChannel[]> {
  try {
    const res = await fetch(`${ADMIN_API_URL}/api/public/consult-channels`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as ConsultChannel[];
  } catch (err) {
    console.warn("[consultChannelService] admin backend unreachable", err);
    return [];
  }
}

export async function listAllConsultChannels(adminApiToken: string | null): Promise<ServiceResult<ConsultChannel[]>> {
  if (!adminApiToken) return errResult("UNAUTHENTICATED", "로그인이 필요합니다.");
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/consult-channels`, {
      headers: { Authorization: `Bearer ${adminApiToken}` },
    });
  } catch {
    return errResult("NOT_FOUND", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  if (!res.ok) return errResult(await parseErrorCode(res), "상담채널을 불러오지 못했습니다.");
  return okResult((await res.json()) as ConsultChannel[]);
}

export async function updateConsultChannel(
  adminApiToken: string | null,
  id: ConsultChannelId,
  input: { displayName: string; value: string; url: string; enabled: boolean },
): Promise<ServiceResult<void>> {
  if (!adminApiToken) return errResult("UNAUTHENTICATED", "로그인이 필요합니다.");
  const trimmedUrl = input.url.trim();
  if (trimmedUrl) {
    try {
      new URL(trimmedUrl);
    } catch {
      return errResult("NOT_FOUND", "유효한 URL 형식이 아닙니다.");
    }
  }

  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/consult-channels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminApiToken}` },
      body: JSON.stringify(input),
    });
  } catch {
    return errResult("NOT_FOUND", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  if (!res.ok) return errResult(await parseErrorCode(res), "상담채널을 수정하지 못했습니다.");
  return okResult(undefined);
}
