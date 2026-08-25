import { Fragment } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { PermissionCheckbox } from "./PermissionCheckbox";
import type { RoleName } from "@/generated/prisma/client";

// ADMIN은 편집 대상에서 제외한다 — 항상 전체 허용이라 표로 보여줄 필요가 없고,
// 실수로 체크를 해제해 시스템에서 잠기는 상황 자체를 화면에서 원천 차단한다.
const EDITABLE_ROLES: Exclude<RoleName, "ADMIN">[] = ["MANAGER", "TEACHER", "STUDENT"];

export default async function PermissionsPage() {
  const actor = await requireBackofficeActor();
  if (actor.role !== "ADMIN") notFound();

  const [permissions, rolePermissions] = await Promise.all([
    prisma.permission.findMany({ orderBy: { key: "asc" } }),
    prisma.rolePermission.findMany({ where: { role: { in: EDITABLE_ROLES } } }),
  ]);

  const granted = new Set(rolePermissions.map((rp) => `${rp.role}:${rp.permissionId}`));

  const groups = new Map<string, typeof permissions>();
  for (const p of permissions) {
    const resource = p.key.split(".")[0];
    if (!groups.has(resource)) groups.set(resource, []);
    groups.get(resource)!.push(p);
  }

  return (
    <div>
      <h1 className="mb-2 text-xl font-bold text-slate-900">권한 관리</h1>
      <p className="mb-6 text-sm text-slate-500">
        ADMIN은 항상 모든 권한을 가지며 여기서 편집할 수 없습니다. MANAGER/TEACHER/STUDENT의 권한만 변경합니다.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <th className="px-4 py-3">권한</th>
              {EDITABLE_ROLES.map((role) => (
                <th key={role} className="px-4 py-3 text-center">
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...groups.entries()].map(([resource, perms]) => (
              <Fragment key={resource}>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <td colSpan={EDITABLE_ROLES.length + 1} className="px-4 py-1.5 text-xs font-semibold text-slate-400">
                    {resource}
                  </td>
                </tr>
                {perms.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 text-slate-700">
                      <span className="font-mono text-xs">{p.key}</span>
                      <span className="ml-2 text-xs text-slate-400">{p.description}</span>
                    </td>
                    {EDITABLE_ROLES.map((role) => (
                      <td key={role} className="px-4 py-2.5 text-center">
                        <PermissionCheckbox role={role} permissionId={p.id} checked={granted.has(`${role}:${p.id}`)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
