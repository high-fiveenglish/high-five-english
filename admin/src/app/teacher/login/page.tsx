import { LoginForm } from "./LoginForm";

export default function TeacherLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-lg font-bold text-slate-900">하이파이브 잉글리쉬 강사</h1>
        <p className="mb-6 text-sm text-slate-500">Please log in with your teacher account.</p>
        <LoginForm />
      </div>
    </div>
  );
}
