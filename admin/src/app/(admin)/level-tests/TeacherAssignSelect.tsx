"use client";

import { useState, useTransition } from "react";
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
  const [value, setValue] = useState(teacherId ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const raw = e.target.value;
        const previous = value;
        setValue(raw);
        startTransition(async () => {
          const result = await assignLevelTestTeacher(id, raw ? Number(raw) : null);
          if (result?.error) {
            alert(result.error);
            setValue(previous);
          }
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
