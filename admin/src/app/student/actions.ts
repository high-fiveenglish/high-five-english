"use server";

import { redirect } from "next/navigation";
import { destroyStudentSession } from "@/lib/studentAuth";

export async function studentLogout() {
  await destroyStudentSession();
  redirect("/student/login");
}
