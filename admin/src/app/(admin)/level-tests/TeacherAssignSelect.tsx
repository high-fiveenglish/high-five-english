"use client";

import { useTransition } from "react";
import { assignLevelTestTeacher } from "./actions";

type Option = { id: number; label: string };

export function TeacherAssignSelect({
  id,
  teacherId,
  teachers,
}: {
  id: number;
  teacherId: number | null;
  teachers: Option[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={teacherId ?? ""}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value;
        startTransition(() => {
          assignLevelTestTeacher(id, value ? Number(value) : null);
        });
      }}
      className="rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-500 disabled:opacity-50"
    >
      <option value="">미배정</option>
      {teachers.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
