"use client";

import { useState, useTransition } from "react";
import { updateAgentConsultChannel } from "../actions";

export function AgentConsultChannelField({
  agentId,
  code,
  label,
  defaultValue,
  defaultUrl,
}: {
  agentId: number;
  code: "kakao" | "wechat";
  label: string;
  defaultValue: string;
  defaultUrl: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [url, setUrl] = useState(defaultUrl);
  const [pending, startTransition] = useTransition();

  const save = () => {
    startTransition(() => {
      updateAgentConsultChannel(agentId, code, { value, url }).catch((err) => {
        alert(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
      });
    });
  };

  return (
    <div className="grid grid-cols-[80px_1fr_1fr_auto] items-end gap-3">
      <span className="pb-2 text-sm font-medium text-slate-600">{label}</span>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-slate-400">아이디/연락처</span>
        <input value={value} onChange={(e) => setValue(e.target.value)} className="input" />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-slate-400">URL (선택)</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="input" />
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "저장 중..." : "저장"}
      </button>
    </div>
  );
}
