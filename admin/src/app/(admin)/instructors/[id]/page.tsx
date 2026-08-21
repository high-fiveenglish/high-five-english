import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { InstructorForm } from "../InstructorForm";
import { updateInstructor } from "../actions";

export default async function EditInstructorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const instructor = await prisma.instructor.findUnique({ where: { id: Number(id) } });

  if (!instructor) notFound();

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">강사 정보 수정 — {instructor.name}</h1>
      <InstructorForm
        action={updateInstructor.bind(null, instructor.id)}
        submitLabel="저장"
        defaultValues={{
          name: instructor.name,
          nameEn: instructor.nameEn,
          country: instructor.country,
          flag: instructor.flag,
          gradient: instructor.gradient,
          photoUrl: instructor.photoUrl,
          audioSrc: instructor.audioSrc,
          defaultMeetingPlatform: instructor.defaultMeetingPlatform,
          bio: instructor.bio,
          career: instructor.career,
          availableDays: instructor.availableDays,
          availableHours: instructor.availableHours,
          classFeatures: instructor.classFeatures,
          specialties: instructor.specialties,
          levels: instructor.levels,
          teachingStyle: instructor.teachingStyle,
          published: instructor.published,
        }}
      />
    </div>
  );
}
