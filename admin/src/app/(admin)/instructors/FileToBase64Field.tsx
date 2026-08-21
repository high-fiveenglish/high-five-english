"use client";

import { useState } from "react";

export function FileToBase64Field({
  name,
  accept,
  label,
  defaultValue,
  previewKind,
}: {
  name: string;
  accept: string;
  label: string;
  defaultValue?: string | null;
  previewKind: "image" | "audio";
}) {
  const [value, setValue] = useState(defaultValue ?? "");

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-slate-600">{label}</span>
      <input
        type="file"
        accept={accept}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => setValue(String(reader.result));
          reader.readAsDataURL(file);
        }}
        className="text-xs"
      />
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
