import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_ID } from "@/lib/constants";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";

// 메인 마케팅 사이트의 강사소개 섹션(src/services/instructorService.ts)이 호출하는
// 공개 읽기 전용 엔드포인트 — 공개(published) 강사만, 순서대로 반환한다.
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

export async function GET(request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));

  const instructors = await prisma.instructor.findMany({
    where: { siteId: DEFAULT_SITE_ID, published: true },
    orderBy: { order: "asc" },
  });

  return NextResponse.json(instructors, { headers });
}
