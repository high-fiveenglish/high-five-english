import { StudentCreateForm } from "./StudentCreateForm";

export default function NewStudentPage() {
  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-slate-900">학생 등록</h1>
      <StudentCreateForm />
    </div>
  );
}
