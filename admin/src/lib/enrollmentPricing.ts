import { prisma } from "./prisma";
import { DEFAULT_SITE_ID } from "./constants";

// 가격표(PricingDuration/PricingRow)는 1/3/6개월 × 주2/3/5회 조합만 정의되어 있다
// (하이파이브 표준 패키지). 그 외 개월수·요일수 조합(커스텀 등록)은 대응하는 가격표
// 행이 없으므로 null을 반환하고, 화면에서 관리자가 직접 금액을 입력하도록 안내한다.
const FREQUENCY_BY_WEEKDAY_COUNT: Record<number, string> = { 2: "freq2", 3: "freq3", 5: "freq5" };

/** 수강 조건(기간·주당 횟수·수업시간)에 해당하는 가격표상의 기본 수강료(KRW)를 찾는다.
 * agentId가 있으면 그 협력사 전용 가격표를 먼저 찾고, 없으면(또는 agentId가 없으면)
 * 본사 기본 가격표로 대체한다. 매칭되는 가격표 행이 없으면 null. */
export async function computeBasePriceKRW(
  packageMonths: number,
  weekdayCount: number,
  classDurationMin: number,
  agentId?: number | null,
): Promise<number | null> {
  const frequencyId = FREQUENCY_BY_WEEKDAY_COUNT[weekdayCount];
  if (!frequencyId) return null;

  const code = `${packageMonths}m`;
  const duration = agentId
    ? ((await prisma.pricingDuration.findFirst({ where: { siteId: DEFAULT_SITE_ID, agentId, code } })) ??
      (await prisma.pricingDuration.findFirst({ where: { siteId: DEFAULT_SITE_ID, agentId: null, code } })))
    : await prisma.pricingDuration.findFirst({ where: { siteId: DEFAULT_SITE_ID, agentId: null, code } });
  if (!duration) return null;

  const row = await prisma.pricingRow.findUnique({
    where: { durationId_frequencyId: { durationId: duration.id, frequencyId } },
  });
  if (!row) return null;

  return classDurationMin === 50 ? row.price50KRW : row.price25KRW;
}
