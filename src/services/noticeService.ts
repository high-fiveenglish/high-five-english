// Notice board mock service layer — same "requirePermission first" pattern as
// adminService.ts. listPublicNotices takes no actor at all (guests can read published
// notices); every write function requires the "notices" permission, which
// general_manager always has and general_admin only has if granted (see
// AdminAccountsPage's permission checkboxes, driven by ALL_PERMISSION_KEYS).
import type { Notice } from "../lib/community/types";
import type { Actor, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { requirePermission } from "../lib/auth/permissions";
import { ACCOUNTS } from "../data/accounts";
import { store } from "./store";

function findAccountName(accountId: string): string {
  return ACCOUNTS.find((a) => a.id === accountId)?.name ?? accountId;
}

function nextNoticeId(): string {
  return `notice-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export async function listPublicNotices(): Promise<Notice[]> {
  return [...store.notices]
    .filter((n) => n.published)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPublicNotice(id: string): Promise<Notice | null> {
  return store.notices.find((n) => n.id === id && n.published) ?? null;
}

export async function listAllNotices(actor: Actor | null): Promise<ServiceResult<Notice[]>> {
  const guard = requirePermission(actor, "notices");
  if (!guard.ok) return guard;
  return okResult([...store.notices].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export async function createNotice(
  actor: Actor | null,
  input: { title: string; content: string; published: boolean },
): Promise<ServiceResult<Notice>> {
  const guard = requirePermission(actor, "notices");
  if (!guard.ok) return guard;

  const now = new Date().toISOString();
  const notice: Notice = {
    id: nextNoticeId(),
    title: input.title.trim(),
    content: input.content.trim(),
    authorAccountId: actor!.accountId,
    authorName: findAccountName(actor!.accountId),
    published: input.published,
    createdAt: now,
    updatedAt: now,
  };
  store.notices = [notice, ...store.notices];
  return okResult(notice);
}

export async function updateNotice(
  actor: Actor | null,
  id: string,
  input: { title: string; content: string; published: boolean },
): Promise<ServiceResult<Notice>> {
  const guard = requirePermission(actor, "notices");
  if (!guard.ok) return guard;

  const existing = store.notices.find((n) => n.id === id);
  if (!existing) return errResult("NOT_FOUND", "공지사항을 찾을 수 없습니다.");

  const updated: Notice = {
    ...existing,
    title: input.title.trim(),
    content: input.content.trim(),
    published: input.published,
    updatedAt: new Date().toISOString(),
  };
  store.notices = store.notices.map((n) => (n.id === id ? updated : n));
  return okResult(updated);
}

export async function deleteNotice(actor: Actor | null, id: string): Promise<ServiceResult<void>> {
  const guard = requirePermission(actor, "notices");
  if (!guard.ok) return guard;
  store.notices = store.notices.filter((n) => n.id !== id);
  return okResult(undefined);
}
