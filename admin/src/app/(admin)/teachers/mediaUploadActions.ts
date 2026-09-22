"use server";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client, R2_BUCKET_NAME, r2PublicUrl } from "@/lib/r2";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { requirePermission } from "@/lib/rbac";

// 강사 사진/음성을 base64로 DB에 통째로 저장하던 방식(teachers API 응답이 18.9MB까지
// 커지는 원인)을 R2로 옮기기 위한 POC. 브라우저가 Secret Access Key를 절대 보지
//못하도록, 서버(이 함수)가 짧게 유효한 presigned PUT URL만 발급하고 실제 파일
// 바이트는 브라우저 → R2로 직접 전송된다(이 서버를 거치지 않음).
const PHOTO_MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const VOICE_MIME_EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/x-m4a": "m4a",
};

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB — 현재 실제 사진은 평균 33KB, 넉넉히 잡음
const MAX_VOICE_BYTES = 15 * 1024 * 1024; // 15MB — 현재 가장 큰 음성 파일도 3.16MB

export type MediaKind = "photo" | "voice";

export async function getTeacherMediaUploadUrl(
  teacherId: number,
  kind: MediaKind,
  contentType: string,
  fileSize: number,
): Promise<{ ok: true; uploadUrl: string; publicUrl: string } | { ok: false; error: string }> {
  const actor = await requireBackofficeActor();
  requirePermission(actor, "teachers.update");

  const extMap = kind === "photo" ? PHOTO_MIME_EXT : VOICE_MIME_EXT;
  const ext = extMap[contentType];
  if (!ext) {
    return { ok: false, error: `허용되지 않는 파일 형식입니다: ${contentType}` };
  }

  const maxBytes = kind === "photo" ? MAX_PHOTO_BYTES : MAX_VOICE_BYTES;
  if (fileSize > maxBytes) {
    return { ok: false, error: `파일이 너무 큽니다(최대 ${Math.round(maxBytes / 1024 / 1024)}MB).` };
  }

  const key = `teacher-media/${teacherId}/${kind === "photo" ? "photo" : "voice"}.${ext}`;

  const uploadUrl = await getSignedUrl(
    r2Client,
    new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, ContentType: contentType }),
    { expiresIn: 300 }, // 5분 — 업로드 창 노출 시간을 짧게 유지
  );

  return { ok: true, uploadUrl, publicUrl: r2PublicUrl(key) };
}
