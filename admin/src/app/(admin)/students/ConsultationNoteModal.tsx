"use client";

import { useState, useTransition } from "react";
import { addConsultationNote, updateConsultationNote, deleteConsultationNote } from "./actions";

export type NoteItem = { id: number; content: string; createdAt: string };

export function ConsultationNoteModal({
  studentId,
  studentName,
  notes,
}: {
  studentId: number;
  studentName: string;
  notes: NoteItem[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        상담노트{notes.length > 0 ? ` (${notes.length})` : ""}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h2 className="text-sm font-bold text-slate-900">상담 노트 — {studentName}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-slate-400 hover:text-slate-700"
              >
                닫기
              </button>
            </div>

            <div className="flex flex-col gap-2 border-b border-slate-100 p-5">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder="새 상담 내용을 입력해주세요."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
              <button
                type="button"
                disabled={pending || draft.trim() === ""}
                onClick={() => {
                  const formData = new FormData();
                  formData.set("content", draft);
                  startTransition(async () => {
                    await addConsultationNote(studentId, formData);
                    setDraft("");
                  });
                }}
                className="w-fit rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {pending ? "저장 중..." : "노트 추가"}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex flex-col divide-y divide-slate-100">
                {notes.map((n) => (
                  <div key={n.id} className="py-3">
                    {editingId === n.id ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={3}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={pending || editDraft.trim() === ""}
                            onClick={() => {
                              startTransition(async () => {
                                await updateConsultationNote(studentId, n.id, editDraft);
                                setEditingId(null);
                              });
                            }}
                            className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            저장
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-lg border border-slate-300 px-3 py-1 text-xs text-slate-500"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="whitespace-pre-line text-sm text-slate-700">{n.content}</p>
                          <p className="mt-1 text-xs text-slate-400">{n.createdAt}</p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(n.id);
                              setEditDraft(n.content);
                            }}
                            className="text-xs font-medium text-blue-700 hover:underline"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!confirm("이 상담 노트를 삭제할까요?")) return;
                              startTransition(() => {
                                deleteConsultationNote(studentId, n.id);
                              });
                            }}
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {notes.length === 0 && (
                  <p className="py-3 text-sm text-slate-400">등록된 상담 노트가 없습니다.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
