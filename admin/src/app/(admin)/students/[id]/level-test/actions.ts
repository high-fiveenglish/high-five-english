"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createLevelTestCore } from "@/lib/levelTestCreate";

export async function createLevelTestForStudent(
  studentId: number,
  _prevState: { error?: string } | undefined,
  formData: FormData,
) {
  const result = await createLevelTestCore(studentId, formData);
  if (result.error) return { error: result.error };

  revalidatePath("/students");
  revalidatePath("/level-tests");
  redirect("/students?notice=level-test-created");
}
