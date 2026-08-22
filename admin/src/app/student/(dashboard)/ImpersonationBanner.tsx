import { endImpersonation } from "@/app/(admin)/students/actions";

export function ImpersonationBanner({ studentName }: { studentName: string }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-amber-400 px-6 py-2 text-sm text-amber-950">
      <span>
        관리자 대리 로그인 중 — 현재 <strong>{studentName}</strong> 학생 계정으로 보고 있습니다.
      </span>
      <form action={endImpersonation}>
        <button
          type="submit"
          className="rounded-lg bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-900"
        >
          관리자로 돌아가기
        </button>
      </form>
    </div>
  );
}
