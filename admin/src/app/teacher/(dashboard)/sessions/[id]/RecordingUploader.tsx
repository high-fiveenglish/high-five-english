"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { completeRecordingUpload, requestRecordingUpload } from "./recordingUploadActions";

// Browser -> private R2, directly. The Server Action only hands out a short-lived URL that can write ONE object; the bytes never go through
// this site's server. Progress comes from XMLHttpRequest (fetch has no upload progress). The URL is kept only in this function's memory:
// it is never rendered, stored or logged.
const ACCEPT = ".mp3,.m4a,.mp4,.wav,.webm,.aac,.ogg,.flac,audio/*";
const SOLID_BUTTON = "w-fit rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50";

type Phase = "idle" | "requesting" | "uploading" | "finishing" | "done" | "error" | "finish_failed";

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function putFile(url: string, file: File, contentType: string, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("upload_rejected")));
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new Error("aborted"));
    xhr.send(file);
  });
}

export function RecordingUploader({ sessionId, label = "Upload Recording" }: { sessionId: number; label?: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const busy = phase === "requesting" || phase === "uploading" || phase === "finishing";
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  // closing the tab in the middle of an upload would leave a half-finished upload behind
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (busyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const finish = async () => {
    setPhase("finishing");
    setMessage(null);
    try {
      const done = await completeRecordingUpload({ sessionId });
      if (!done.ok) {
        setPhase("finish_failed");
        setMessage(done.message);
        router.refresh();
        return;
      }
      setPhase("done");
      router.refresh();
    } catch {
      setPhase("finish_failed");
      setMessage("Something went wrong while finishing the upload. Please try again.");
    }
  };

  const start = async () => {
    if (!file) return;
    setMessage(null);
    setPercent(0);
    setPhase("requesting");
    try {
      const issued = await requestRecordingUpload({ sessionId, fileName: file.name, contentType: file.type, size: file.size });
      if (!issued.ok) {
        setPhase("error");
        setMessage(issued.message);
        return;
      }
      setPhase("uploading");
      await putFile(issued.uploadUrl, file, issued.contentType, setPercent);
    } catch {
      setPhase("error");
      setMessage("The upload did not finish. Please check your connection and try again.");
      router.refresh();
      return;
    }
    await finish();
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        type="file"
        accept={ACCEPT}
        disabled={busy || phase === "done"}
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setPhase("idle");
          setMessage(null);
        }}
        className="text-sm disabled:opacity-50"
      />
      {file && phase !== "done" && (
        <p className="text-xs text-slate-500">
          {file.name} · {formatSize(file.size)}
        </p>
      )}

      {phase === "uploading" && (
        <div className="flex flex-col gap-1" role="status" aria-live="polite">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-slate-900 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-xs text-slate-500">Uploading… {percent}% — please keep this page open.</p>
        </div>
      )}
      {phase === "requesting" && <p className="text-xs text-slate-500">Preparing the upload…</p>}
      {phase === "finishing" && <p className="text-xs text-slate-500">Upload complete. Sending it for transcription…</p>}
      {phase === "done" && <p className="text-sm font-semibold text-emerald-600">Uploaded. The AI draft is being prepared — this can take several minutes.</p>}
      {message && (phase === "error" || phase === "finish_failed") && <p className="text-sm text-red-600">{message}</p>}

      {phase === "finish_failed" ? (
        <button type="button" onClick={() => void finish()} className={SOLID_BUTTON}>
          Try again
        </button>
      ) : (
        phase !== "done" && (
          <button type="button" onClick={() => void start()} disabled={!file || busy} className={SOLID_BUTTON}>
            {busy ? "Working…" : label}
          </button>
        )
      )}
    </div>
  );
}
