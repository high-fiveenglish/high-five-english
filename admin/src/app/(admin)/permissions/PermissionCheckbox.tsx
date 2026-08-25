"use client";

import { useTransition } from "react";
import { togglePermission } from "./actions";
import type { RoleName } from "@/generated/prisma/client";

export function PermissionCheckbox({
  role,
  permissionId,
  checked,
}: {
  role: RoleName;
  permissionId: number;
  checked: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      defaultChecked={checked}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.checked;
        startTransition(() => {
          togglePermission(role, permissionId, next).catch((err) => {
            alert(err instanceof Error ? err.message : "권한 변경 중 오류가 발생했습니다.");
          });
        });
      }}
      className="h-4 w-4 accent-slate-900 disabled:opacity-50"
    />
  );
}
