"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission, logAudit } from "@/lib/rbac";

// 본인 계정(정보수정) 전용 — "own_profile.update" 권한을 Student.own_profile.update와
// 공유해서 쓰지만, 여기서는 AdminUser 테이블만 다루므로 actor.role이 실제로 AdminUser
// 계정인 경우로 명시적으로 한정한다(Student는 별도 테이블·id 시퀀스라 섞이면 안 됨).
export async function updateOwnProfile(_prevState: { error?: string; success?: boolean } | undefined, formData: FormData) {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "own_profile.update");
  if (actor.role !== "AGENT") {
    return { error: "이 화면은 협력사 관리자 계정 전용입니다." };
  }

  const loginId = String(formData.get("loginId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const engName = String(formData.get("engName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const kakaoId = String(formData.get("kakaoId") ?? "").trim();
  const wechatId = String(formData.get("wechatId") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!loginId || !name) {
    return { error: "아이디와 이름은 필수입니다." };
  }
  if (newPassword && newPassword.length < 4) {
    return { error: "비밀번호는 4자 이상이어야 합니다." };
  }

  const existing = await prisma.adminUser.findUnique({ where: { loginId } });
  if (existing && existing.id !== actor.id) {
    return { error: "이미 사용 중인 아이디입니다." };
  }

  await prisma.adminUser.update({
    where: { id: actor.id },
    data: {
      loginId,
      name,
      engName: engName || null,
      email: email || null,
      phone: phone || null,
      kakaoId: kakaoId || null,
      wechatId: wechatId || null,
      ...(newPassword ? { passwordHash: await bcrypt.hash(newPassword, 10) } : {}),
    },
  });
  await logAudit({ actor, action: "UPDATE", targetType: "AdminUser", targetId: actor.id, description: "협력사 관리자 본인 정보 수정" });

  revalidatePath("/my-profile");
  return { success: true };
}
