"use client";

import { useTransition } from "react";
import { updateStudentGrade } from "./actions";
import { GRADE_OPTIONS } from "./constants";
import type { StudentGrade } from "@/generated/prisma/client";

export function GradeSelect({ studentId, grade }: { studentId: number; grade: StudentGrade }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={grade}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value as StudentGrade;
        startTransition(() => {
          updateStudentGrade(studentId, value);
        });
      }}
      className="rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-500 disabled:opacity-50"
    >
      {GRADE_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
