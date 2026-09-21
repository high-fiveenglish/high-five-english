import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 강사 수정 화면에서 사진/음성 파일을 base64로 인코딩해 서버 액션으로 그대로
    // 보내는데(FileToBase64Field), Next.js 기본 서버 액션 요청 크기 제한(1MB)을 넘으면
    // "Body exceeded 1 MB limit" 오류로 저장이 실패한다 — 실제 사진 한 장도 쉽게 넘는
    // 크기라 여유 있게 올려둔다.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
