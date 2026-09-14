"use client";

import { useRouter } from "next/navigation";
import { LevelTestResultForm, type LevelTestResultDefaults } from "./LevelTestResultForm";

export function LevelTestResultModal({
  levelTestId,
  defaults,
  studentLabel,
  metaLine,
  onClose,
}: {
  levelTestId: number;
  defaults: LevelTestResultDefaults;
  studentLabel: string;
  metaLine: string;
  onClose: () => void;
}) {
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-900">Level Test Result</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
        <p className="mb-5 text-sm text-slate-500">
          {studentLabel} · {metaLine}
        </p>
        <LevelTestResultForm
          levelTestId={levelTestId}
          defaults={defaults}
          onSaved={() => {
            router.refresh();
            onClose();
          }}
        />
      </div>
    </div>
  );
}
