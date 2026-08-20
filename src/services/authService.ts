// Mock login. Looks up a fixed account list instead of the old "any non-empty id/password
// succeeds" behavior — a deliberate change so the new role/permission system has
// something real to check against. Still async, matching every other service function,
// so this can be swapped for a real API call later without touching call sites.
import { ACCOUNTS } from "../data/accounts";
import type { Actor, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import { store } from "./store";

export interface LoginResult {
  actor: Actor;
  displayName: string;
}

export async function login(id: string, password: string): Promise<ServiceResult<LoginResult>> {
  const account = ACCOUNTS.find((a) => a.id === id);
  if (!account || account.password !== password) {
    return errResult("INVALID_CREDENTIALS", "아이디 또는 비밀번호가 올바르지 않습니다.");
  }
  const grantedPermissions = store.adminPermissionOverrides[account.id] ?? account.permissions ?? [];
  const actor: Actor = {
    role: account.role,
    accountId: account.id,
    linkedId: account.linkedId,
    permissions: grantedPermissions,
  };
  return okResult({ actor, displayName: account.name });
}
