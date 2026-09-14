"use server";

import { revalidatePath } from "next/cache";
import { requireStudent } from "@/lib/studentAuth";
import { requirePermission, resolveRolePermissions, logAudit } from "@/lib/rbac";
import { applyStudentProfileUpdate } from "@/lib/studentProfileUpdate";

// 학생 본인이 스스로 고칠 수 있는 항목만 다룬다 — 실명/로그인ID/회원등급/포인트/
// 할인율/협력사 등 운영·재무 관련 필드는 관리자 전용(students/actions.ts의
// updateStudent)이라 여기서 절대 건드리지 않는다. 실제 저장 로직은
// lib/studentProfileUpdate에 있고, 마케팅 사이트가 쓰는 공개 API(student-profile
// route)도 같은 함수를 호출한다 — 같은 Student row를 그대로 수정하므로 관리자
// 페이지(학생관리)에는 별도 연동 없이 곧바로 반영된다.
export async function updateOwnProfile(
  _prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const student = await requireStudent();
  const actor = {
    role: "STUDENT" as const,
    id: student.id,
    name: student.name,
    permissions: await resolveRolePermissions("STUDENT"),
  };
  requirePermission(actor, "own_profile.update");

  const result = await applyStudentProfileUpdate(student.id, {
    englishName: String(formData.get("englishName") ?? "").trim(),
    sex: String(formData.get("sex") ?? ""),
    birthDate: String(formData.get("birthDate") ?? ""),
    occupation: String(formData.get("occupation") ?? "").trim(),
    region: String(formData.get("region") ?? ""),
    address: String(formData.get("address") ?? "").trim(),
    mobilePhone: String(formData.get("mobilePhone") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    preferredClassMethod: String(formData.get("preferredClassMethod") ?? "").trim(),
    teamsId: String(formData.get("teamsId") ?? "").trim(),
    kakaoId: String(formData.get("kakaoId") ?? "").trim(),
    wechatId: String(formData.get("wechatId") ?? "").trim(),
    newPassword: String(formData.get("newPassword") ?? ""),
    newPasswordConfirm: String(formData.get("newPasswordConfirm") ?? ""),
  });
  if (result.error) return { error: result.error };

  await logAudit({
    actor,
    action: "UPDATE",
    targetType: "Student",
    targetId: student.id,
    description: result.passwordChanged ? "학생 본인 정보 수정(비밀번호 변경 포함)" : "학생 본인 정보 수정",
  });

  revalidatePath("/student/profile");
  revalidatePath("/student");
  return { success: true };
}
