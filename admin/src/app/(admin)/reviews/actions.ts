"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";

export async function deleteReviewPost(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "reviews.delete");

  const existing = await prisma.reviewPost.findUnique({ where: { id } });
  if (!existing) return;

  // 최상위 글이면 그 글에 달린 답글도 함께 지운다 — 마케팅 사이트의 기존 mock 게시판과
  // 동일한 정책(부모 없는 답글이 남지 않도록).
  await prisma.reviewPost.deleteMany({ where: { OR: [{ id }, { parentId: id }] } });
  await logAudit({ actor, action: "DELETE", targetType: "ReviewPost", targetId: id });

  revalidatePath("/reviews");
}
