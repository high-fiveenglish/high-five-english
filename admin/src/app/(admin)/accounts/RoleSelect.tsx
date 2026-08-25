"use client";

import { useTransition } from "react";
import { updateAccountRole } from "./actions";
import type { RoleName } from "@/generated/prisma/client";

export function RoleSelect({ id, role }: { id: number; role: RoleName }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={role}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value as RoleName;
        startTransition(() => {
          updateAccountRole(id, value).catch((err) => {
            alert(err instanceof Error ? err.message : "역할 변경 중 오류가 발생했습니다.");
          });
        });
      }}
      className="rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-500 disabled:opacity-50"
    >
      <option value="ADMIN">ADMIN</option>
      <option value="MANAGER">MANAGER</option>
    </select>
  );
}
