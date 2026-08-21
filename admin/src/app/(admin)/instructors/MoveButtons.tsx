"use client";

import { useTransition } from "react";
import { moveInstructor } from "./actions";

export function MoveButtons({ id, isFirst, isLast }: { id: number; isFirst: boolean; isLast: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-1">
      <button
        type="button"
        disabled={pending || isFirst}
        onClick={() => startTransition(() => moveInstructor(id, "up"))}
        className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-30"
      >
        ▲
      </button>
      <button
        type="button"
        disabled={pending || isLast}
        onClick={() => startTransition(() => moveInstructor(id, "down"))}
        className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-30"
      >
        ▼
      </button>
    </div>
  );
}
