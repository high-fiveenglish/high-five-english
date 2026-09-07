// Homepage notice board mock service layer — same "requirePermission first" pattern as
// noticeService.ts, but public-facing: listPublishedHomeNotices takes no actor at all
// (students/guests can read, never write) since this is the read-only student/visitor
// announcement feed shown in HomeNoticesSection. Distinct from noticeService.ts, which is
// the teacher-only bulletin board.
import type { HomeNotice } from "../lib/community/types";
import type { Actor, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { requirePermission } from "../lib/auth/permissions";
import { ACCOUNTS } from "../data/accounts";
import { store } from "./store";

function findAccountName(accountId: string): string {
  return ACCOUNTS.find((a) => a.id === accountId)?.name ?? accountId;
}

function nextHomeNoticeId(): string {
  return `home-notice-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export async function listPublishedHomeNotices(): Promise<HomeNotice[]> {
  return [...store.homeNotices]
    .filter((n) => n.published)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listAllHomeNotices(actor: Actor | null): Promise<ServiceResult<HomeNotice[]>> {
  const guard = requirePermission(actor, "homeNotices");
  if (!guard.ok) return guard;
  return okResult([...store.homeNotices].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

export async function createHomeNotice(
  actor: Actor | null,
  input: { title: string; content: string; published: boolean },
): Promise<ServiceResult<HomeNotice>> {
  const guard = requirePermission(actor, "homeNotices");
  if (!guard.ok) return guard;

  const now = new Date().toISOString();
  const notice: HomeNotice = {
    id: nextHomeNoticeId(),
    title: input.title.trim(),
    content: input.content.trim(),
    authorAccountId: actor!.accountId,
    authorName: findAccountName(actor!.accountId),
    published: input.published,
    createdAt: now,
    updatedAt: now,
  };
  store.homeNotices = [notice, ...store.homeNotices];
  return okResult(notice);
}

export async function updateHomeNotice(
  actor: Actor | null,
  id: string,
  input: { title: string; content: string; published: boolean },
): Promise<ServiceResult<HomeNotice>> {
  const guard = requirePermission(actor, "homeNotices");
  if (!guard.ok) return guard;

  const existing = store.homeNotices.find((n) => n.id === id);
  if (!existing) return errResult("NOT_FOUND", "공지사항을 찾을 수 없습니다.");

  const updated: HomeNotice = {
    ...existing,
    title: input.title.trim(),
    content: input.content.trim(),
    published: input.published,
    updatedAt: new Date().toISOString(),
  };
  store.homeNotices = store.homeNotices.map((n) => (n.id === id ? updated : n));
  return okResult(updated);
}

export async function deleteHomeNotice(actor: Actor | null, id: string): Promise<ServiceResult<void>> {
  const guard = requirePermission(actor, "homeNotices");
  if (!guard.ok) return guard;
  store.homeNotices = store.homeNotices.filter((n) => n.id !== id);
  return okResult(undefined);
}
