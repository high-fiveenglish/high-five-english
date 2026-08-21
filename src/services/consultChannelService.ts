// Consult-channel mock service layer. Uses the existing "siteSettings" permission —
// these are site-wide contact settings, the same category as the entry-window timing
// settings adminService.updateEntryWindowSettings already gates behind "siteSettings".
import type { ConsultChannel, ConsultChannelId } from "../lib/community/types";
import type { Actor, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { requirePermission } from "../lib/auth/permissions";
import { store } from "./store";

export async function listActiveConsultChannels(): Promise<ConsultChannel[]> {
  return store.consultChannels.filter((c) => c.enabled);
}

export async function listAllConsultChannels(actor: Actor | null): Promise<ServiceResult<ConsultChannel[]>> {
  const guard = requirePermission(actor, "siteSettings");
  if (!guard.ok) return guard;
  return okResult([...store.consultChannels]);
}

export async function updateConsultChannel(
  actor: Actor | null,
  id: ConsultChannelId,
  input: { displayName: string; value: string; url: string; enabled: boolean },
): Promise<ServiceResult<ConsultChannel>> {
  const guard = requirePermission(actor, "siteSettings");
  if (!guard.ok) return guard;

  const trimmedUrl = input.url.trim();
  if (trimmedUrl) {
    try {
      new URL(trimmedUrl);
    } catch {
      return errResult("NOT_FOUND", "유효한 URL 형식이 아닙니다.");
    }
  }

  const existing = store.consultChannels.find((c) => c.id === id);
  if (!existing) return errResult("NOT_FOUND", "상담 채널을 찾을 수 없습니다.");

  const updated: ConsultChannel = {
    ...existing,
    displayName: input.displayName.trim() || existing.displayName,
    value: input.value.trim(),
    url: trimmedUrl || undefined,
    enabled: input.enabled,
  };
  store.consultChannels = store.consultChannels.map((c) => (c.id === id ? updated : c));
  return okResult(updated);
}
