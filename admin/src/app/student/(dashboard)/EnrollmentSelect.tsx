"use client";

import { useRouter } from "next/navigation";

type Option = { id: number; label: string };

export function EnrollmentSelect({ enrollments, selectedId }: { enrollments: Option[]; selectedId: number }) {
  const router = useRouter();

  return (
    <select
      defaultValue={selectedId}
      onChange={(e) => {
        router.push(`/student?enrollment=${e.target.value}`);
      }}
      className="w-full max-w-xl rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none focus:border-slate-500"
    >
      {enrollments.map((e) => (
        <option key={e.id} value={e.id}>
          {e.label}
        </option>
      ))}
    </select>
  );
}
