"use client";

import { useState, useTransition } from "react";
import { updateConsultChannel } from "./actions";
import type { ConsultChannel } from "@/generated/prisma/client";

export function ChannelRow({ channel }: { channel: ConsultChannel }) {
  const [displayName, setDisplayName] = useState(channel.displayName);
  const [value, setValue] = useState(channel.value);
  const [url, setUrl] = useState(channel.url ?? "");
  const [enabled, setEnabled] = useState(channel.enabled);
  const [pending, startTransition] = useTransition();

  const save = () => {
    startTransition(() => {
      updateConsultChannel(channel.id, { displayName, value, url, enabled }).catch((err) => {
        alert(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
      });
    });
  };

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-400">{channel.id}</td>
      <td className="px-2 py-3">
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
        />
      </td>
      <td className="px-2 py-3">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
        />
      </td>
      <td className="px-2 py-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500"
        />
      </td>
      <td className="px-2 py-3 text-center">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4"
        />
      </td>
      <td className="px-2 py-3">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "저장 중..." : "저장"}
        </button>
      </td>
    </tr>
  );
}
