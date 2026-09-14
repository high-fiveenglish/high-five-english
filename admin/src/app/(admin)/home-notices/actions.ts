"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";
import { DEFAULT_SITE_ID } from "@/lib/constants";

export async function createHomeNotice(_prevState: { error?: string } | undefined, formData: FormData) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "home_notices.create");

  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const published = formData.get("published") === "on";
  if (!title || !content) {
    return { error: "제목과 내용을 모두 입력해주세요." };
  }

  const notice = await prisma.homeNotice.create({
    data: { siteId: DEFAULT_SITE_ID, title, content, published, authorAdminId: actor.id },
  });
  await logAudit({ actor, action: "CREATE", targetType: "HomeNotice", targetId: notice.id });

  revalidatePath("/home-notices");
  redirect("/home-notices");
}

export async function updateHomeNotice(
  id: number,
  _prevState: { error?: string } | undefined,
  formData: FormData,
) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "home_notices.update");

  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const published = formData.get("published") === "on";
  if (!title || !content) {
    return { error: "제목과 내용을 모두 입력해주세요." };
  }

  const existing = await prisma.homeNotice.findUnique({ where: { id } });
  if (!existing || existing.siteId !== DEFAULT_SITE_ID) {
    return { error: "존재하지 않는 공지입니다." };
  }

  await prisma.homeNotice.update({ where: { id }, data: { title, content, published } });
  await logAudit({ actor, action: "UPDATE", targetType: "HomeNotice", targetId: id });

  revalidatePath("/home-notices");
  revalidatePath(`/home-notices/${id}`);
  redirect("/home-notices");
}

export async function deleteHomeNotice(id: number) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "home_notices.delete");

  const existing = await prisma.homeNotice.findUnique({ where: { id } });
  if (!existing || existing.siteId !== DEFAULT_SITE_ID) return;

  await prisma.homeNotice.delete({ where: { id } });
  await logAudit({ actor, action: "DELETE", targetType: "HomeNotice", targetId: id });

  revalidatePath("/home-notices");
}
