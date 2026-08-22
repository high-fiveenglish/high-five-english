"use server";

import { redirect } from "next/navigation";
import { destroyTeacherSession } from "@/lib/teacherAuth";

export async function teacherLogout() {
  await destroyTeacherSession();
  redirect("/teacher/login");
}
