import { S3Client } from "@aws-sdk/client-s3";

// Cloudflare R2는 S3 호환 API라 공식 AWS SDK를 그대로 쓴다. 이 client는 서버에서만
// 만들어진다(Secret Access Key가 여기 들어있음 — 절대 브라우저로 넘기지 않는다).
// 업로드는 presigned PUT URL을 발급해서 브라우저가 R2에 직접 쓰게 하는 방식이므로,
// 실제 파일 바이트는 이 서버를 거치지 않는다(서버 부하/타임아웃 없음).
export const r2Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;

export function r2PublicUrl(key: string): string {
  return `${process.env.R2_PUBLIC_URL_BASE}/${key}`;
}
