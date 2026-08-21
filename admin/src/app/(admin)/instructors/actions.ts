"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isAuthenticated } from "@/lib/auth";
import { DEFAULT_SITE_ID } from "@/lib/constants";

async function requireAuth() {
  if (!(await isAuthenticated())) {
    throw new Error("인증되지 않은 요청입니다.");
  }
}

function linesToArray(raw: string): string[] {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function slugify(nameEn: string): string {
  const base = nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${base || "instructor"}-${Date.now()}`;
}

function readInstructorForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    nameEn: String(formData.get("nameEn") ?? "").trim(),
    country: String(formData.get("country") ?? "").trim(),
    flag: String(formData.get("flag") ?? "").trim(),
    gradient: String(formData.get("gradient") ?? "from-brand-500 to-brand-700").trim(),
    photoUrl: String(formData.get("photoUrl") ?? "") || null,
    audioSrc: String(formData.get("audioSrc") ?? "") || null,
    defaultMeetingPlatform: String(formData.get("defaultMeetingPlatform") ?? "") || null,
    bio: String(formData.get("bio") ?? "").trim(),
    career: linesToArray(String(formData.get("career") ?? "")),
    availableDays: formData.getAll("availableDays").map((d) => Number(d)),
    availableHours: String(formData.get("availableHours") ?? "").trim(),
    classFeatures: linesToArray(String(formData.get("classFeatures") ?? "")),
    specialties: linesToArray(String(formData.get("specialties") ?? "")),
    levels: formData.getAll("levels").map((l) => String(l)),
    teachingStyle: String(formData.get("teachingStyle") ?? "").trim(),
    published: formData.get("published") === "on",
  };
}

export async function createInstructor(_prevState: { error?: string } | undefined, formData: FormData) {
  await requireAuth();
  const data = readInstructorForm(formData);

  if (!data.name || !data.nameEn || !data.bio) {
    return { error: "이름, 영문 이름, 소개는 필수입니다." };
  }

  const maxOrder = await prisma.instructor.aggregate({
    where: { siteId: DEFAULT_SITE_ID },
    _max: { order: true },
  });

  await prisma.instructor.create({
    data: {
      ...data,
      slug: slugify(data.nameEn),
      siteId: DEFAULT_SITE_ID,
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });

  revalidatePath("/instructors");
  redirect("/instructors");
}

export async function updateInstructor(id: number, _prevState: { error?: string } | undefined, formData: FormData) {
  await requireAuth();
  const data = readInstructorForm(formData);

  if (!data.name || !data.nameEn || !data.bio) {
    return { error: "이름, 영문 이름, 소개는 필수입니다." };
  }

  await prisma.instructor.update({ where: { id }, data });

  revalidatePath("/instructors");
  revalidatePath(`/instructors/${id}`);
  redirect("/instructors");
}

export async function deleteInstructor(id: number) {
  await requireAuth();
  await prisma.instructor.delete({ where: { id } });
  revalidatePath("/instructors");
}

export async function moveInstructor(id: number, direction: "up" | "down") {
  await requireAuth();
  const all = await prisma.instructor.findMany({
    where: { siteId: DEFAULT_SITE_ID },
    orderBy: { order: "asc" },
  });
  const index = all.findIndex((i) => i.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= all.length) return;

  const a = all[index];
  const b = all[swapWith];
  await prisma.$transaction([
    prisma.instructor.update({ where: { id: a.id }, data: { order: b.order } }),
    prisma.instructor.update({ where: { id: b.id }, data: { order: a.order } }),
  ]);
  revalidatePath("/instructors");
}
