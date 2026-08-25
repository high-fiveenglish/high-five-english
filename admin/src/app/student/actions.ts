"use server";

import { redirect } from "next/navigation";
import { destroyStudentSession, requireStudent } from "@/lib/studentAuth";
import { logAudit } from "@/lib/rbac";

export async function studentLogout() {
  const student = await requireStudent();
  await destroyStudentSession();
  await logAudit({ actor: { role: "STUDENT", id: student.id, name: student.name }, action: "LOGOUT" });
  redirect("/student/login");
}
