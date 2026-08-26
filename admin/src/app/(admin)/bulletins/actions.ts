"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";

export async function createBulletin(_prevState: { error?: string } | undefined, formData: FormData) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "bulletins.create");

  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!title || !content) {
    return { error: "제목과 내용을 모두 입력해주세요." };
  }

  const bulletin = await prisma.bulletin.create({
    data: {
      siteId: DEFAULT_SITE_ID,
      title,
      content,
      authorAdminId: actor.id,
    },
  });
  await logAudit({ actor, action: "CREATE", targetType: "Bulletin", targetId: bulletin.id });

  revalidatePath("/bulletins");
  revalidatePath("/teacher/bulletins");
  redirect("/bulletins");
}

export async function updateBulletin(
  id: number,
  _prevState: { error?: string } | undefined,
  formData: FormData,
) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "bulletins.update");

  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!title || !content) {
    return { error: "제목과 내용을 모두 입력해주세요." };
  }

  // 다른 site의 공지를 URL id 조작으로 수정할 수 없도록 siteId까지 함께 검증한다.
  const existing = await prisma.bulletin.findUnique({ where: { id } });
  if (!existing || existing.siteId !== DEFAULT_SITE_ID) {
    return { error: "존재하지 않는 공지입니다." };
  }

  await prisma.bulletin.update({ where: { id }, data: { title, content } });
  await logAudit({ actor, action: "UPDATE", targetType: "Bulletin", targetId: id });

  revalidatePath("/bulletins");
  revalidatePath(`/bulletins/${id}`);
  revalidatePath("/teacher/bulletins");
  revalidatePath(`/teacher/bulletins/${id}`);
  redirect("/bulletins");
}

export async function deleteBulletin(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "bulletins.delete");

  const existing = await prisma.bulletin.findUnique({ where: { id } });
  if (!existing || existing.siteId !== DEFAULT_SITE_ID) return;

  await prisma.bulletin.delete({ where: { id } });
  await logAudit({ actor, action: "DELETE", targetType: "Bulletin", targetId: id });

  revalidatePath("/bulletins");
  revalidatePath("/teacher/bulletins");
}
