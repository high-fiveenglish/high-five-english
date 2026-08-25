"use server";

import { redirect } from "next/navigation";
import { destroyTeacherSession, requireTeacher } from "@/lib/teacherAuth";
import { logAudit } from "@/lib/rbac";

export async function teacherLogout() {
  const teacher = await requireTeacher();
  await destroyTeacherSession();
  await logAudit({ actor: { role: "TEACHER", id: teacher.id, name: teacher.realName }, action: "LOGOUT" });
  redirect("/teacher/login");
}
