"use server";

import { redirect } from "next/navigation";
import { destroyBackofficeSession, requireBackofficeActor } from "@/lib/backofficeAuth";
import { logAudit } from "@/lib/rbac";

export async function logout() {
  const actor = await requireBackofficeActor();
  await destroyBackofficeSession();
  await logAudit({ actor, action: "LOGOUT" });
  redirect("/login");
}
