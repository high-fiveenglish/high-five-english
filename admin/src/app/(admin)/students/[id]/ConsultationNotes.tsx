"use client";

import { useRef, useTransition } from "react";
import { addConsultationNote, deleteConsultationNote } from "../actions";

type Note = { id: number; content: string; createdAt: string };

export function ConsultationNotes({ studentId, notes }: { studentId: number; notes: Note[] }) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex max-w-2xl flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-bold text-slate-900">상담 노트</h2>

      <form
        ref={formRef}
        action={(formData) => {
          startTransition(async () => {
            await addConsultationNote(studentId, formData);
            formRef.current?.reset();
          });
        }}
        className="flex flex-col gap-2"
      >
        <textarea
          name="content"
          rows={2}
          placeholder="상담 내용을 입력해주세요."
          className="input"
          required
        />
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "추가 중..." : "노트 추가"}
        </button>
      </form>

      <div className="flex flex-col divide-y divide-slate-100 border-t border-slate-100">
        {notes.map((n) => (
          <div key={n.id} className="flex items-start justify-between gap-3 py-3">
            <div>
              <p className="whitespace-pre-line text-sm text-slate-700">{n.content}</p>
              <p className="mt-1 text-xs text-slate-400">{n.createdAt}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!confirm("이 상담 노트를 삭제할까요?")) return;
                startTransition(() => {
                  deleteConsultationNote(studentId, n.id);
                });
              }}
              className="shrink-0 text-xs font-medium text-red-600 hover:underline"
            >
              삭제
            </button>
          </div>
        ))}
        {notes.length === 0 && <p className="py-3 text-sm text-slate-400">등록된 상담 노트가 없습니다.</p>}
      </div>
    </div>
  );
}
