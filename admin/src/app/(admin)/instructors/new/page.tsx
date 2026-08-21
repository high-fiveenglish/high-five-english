import { InstructorForm } from "../InstructorForm";
import { createInstructor } from "../actions";

export default function NewInstructorPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">강사 등록</h1>
      <InstructorForm action={createInstructor} submitLabel="등록" />
    </div>
  );
}
