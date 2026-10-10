import { TeacherCreateForm } from "./TeacherCreateForm";
import { requirePageActor } from "@/lib/pageAccess";

export default async function NewTeacherPage() {
  await requirePageActor("teachers.create", { denyAgent: true });
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">강사 등록</h1>
      <TeacherCreateForm />
    </div>
  );
}
