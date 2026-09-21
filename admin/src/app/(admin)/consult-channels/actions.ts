"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";

export async function updateConsultChannel(
  id: number,
  input: { displayName: string; value: string; url: string; enabled: boolean },
) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "consult_channels.update");

  const trimmedUrl = input.url.trim();
  if (trimmedUrl) {
    try {
      new URL(trimmedUrl);
    } catch {
      throw new Error("유효한 URL 형식이 아닙니다.");
    }
  }

  const existing = await prisma.consultChannel.findUnique({ where: { id } });
  if (!existing) throw new Error("상담 채널을 찾을 수 없습니다.");

  await prisma.consultChannel.update({
    where: { id },
    data: {
      displayName: input.displayName.trim() || existing.displayName,
      value: input.value.trim(),
      url: trimmedUrl || null,
      enabled: input.enabled,
    },
  });
  await logAudit({ actor, action: "UPDATE", targetType: "ConsultChannel", targetId: id });

  revalidatePath("/consult-channels");
}
