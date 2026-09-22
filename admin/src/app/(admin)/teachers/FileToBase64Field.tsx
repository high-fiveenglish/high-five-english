"use client";

import { useState } from "react";
import { getTeacherMediaUploadUrl, type MediaKind } from "./mediaUploadActions";

// 예전엔 이 컴포넌트 이름대로 FileReader.readAsDataURL()로 base64를 만들어 hidden
// input에 그대로 넣었다(그게 DB photoUrl/voiceUrl에 그대로 저장되어 teachers 공개
// API 응답이 18.9MB까지 커진 원인). 지금은 R2로 직접 업로드하고, hidden input에는
// 짧은 R2 공개 URL만 들어간다 — 폼 저장 로직(actions.ts의 updateTeacher)은 문자열을
// 그대로 저장하기만 하므로 이 컴포넌트 밖은 전혀 안 바뀐다.
const MAX_BYTES: Record<MediaKind, number> = {
  photo: 5 * 1024 * 1024,
  voice: 15 * 1024 * 1024,
};

export function FileToBase64Field({
  name,
  kind,
  teacherId,
  accept,
  label,
  defaultValue,
  previewKind,
}: {
  name: string;
  kind: MediaKind;
  teacherId: number;
  accept: string;
  label: string;
  defaultValue?: string | null;
  previewKind: "image" | "audio";
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setStatus("uploading");
    setError(null);
    try {
      if (file.size > MAX_BYTES[kind]) {
        throw new Error(`파일이 너무 큽니다(최대 ${Math.round(MAX_BYTES[kind] / 1024 / 1024)}MB).`);
      }
      const result = await getTeacherMediaUploadUrl(teacherId, kind, file.type, file.size);
      if (!result.ok) throw new Error(result.error);

      const putRes = await fetch(result.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error(`업로드 실패 (HTTP ${putRes.status})`);

      // 업로드 성공했을 때만 값을 바꾼다 — 실패하면 기존 값(defaultValue) 그대로 유지되어
      // "저장" 버튼을 눌러도 원래 사진/음성이 보존된다.
      setValue(result.publicUrl);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "업로드 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-slate-600">{label}</span>
      <input
        type="file"
        accept={accept}
        disabled={status === "uploading"}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          void handleFile(file);
        }}
        className="text-xs disabled:opacity-50"
      />
      {status === "uploading" && <p className="text-xs text-slate-400">업로드 중...</p>}
      {status === "error" && error && <p className="text-xs text-red-600">{error}</p>}
      <input type="hidden" name={name} value={value} />
      {value &&
        (previewKind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="미리보기" className="h-20 w-20 rounded-xl object-cover" />
        ) : (
          <audio controls src={value} className="h-9 w-full" />
        ))}
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          className="w-fit text-xs font-medium text-red-600 hover:underline"
        >
          제거
        </button>
      )}
    </div>
  );
}
