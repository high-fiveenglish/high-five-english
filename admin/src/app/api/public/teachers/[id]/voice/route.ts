import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { corsHeaders, corsOptionsResponse } from "@/lib/cors";

// 강사소개 카드를 클릭해서 상세 모달을 열 때만 그 한 명의 음성을 지연 조회하는
// 전용 엔드포인트 — /api/public/teachers 목록 응답에서 voiceUrl을 뺀 것과 짝을
// 이룬다(route.ts 주석 참고). 이 한 명만 조회하므로 voiceUrl @db.Text의 실측
// 지연(다건 조회 시 최대 34초)에 해당하지 않는다.
export async function OPTIONS(request: Request) {
  return corsOptionsResponse(request);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = corsHeaders(request.headers.get("origin"));
  const { id } = await params;
  const teacherId = Number(id);
  if (!Number.isInteger(teacherId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400, headers });
  }

  const teacher = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { voiceUrl: true, accountStatus: true },
  });
  if (!teacher || teacher.accountStatus !== "ACTIVE") {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  }

  return NextResponse.json({ audioUrl: teacher.voiceUrl }, { headers: { ...headers, "Cache-Control": "no-store" } });
}
