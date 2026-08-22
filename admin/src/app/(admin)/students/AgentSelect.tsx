"use client";

import { useTransition } from "react";
import { updateStudentAgent } from "./actions";

export function AgentSelect({
  studentId,
  agentId,
  agents,
}: {
  studentId: number;
  agentId: number | null;
  agents: { id: number; name: string }[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      defaultValue={agentId ?? ""}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value;
        startTransition(() => {
          updateStudentAgent(studentId, value ? Number(value) : null);
        });
      }}
      className="rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-500 disabled:opacity-50"
    >
      <option value="">미지정</option>
      {agents.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}
