// 수강 삭제 가드 — ClassSession은 Enrollment를 FK(RESTRICT)로 참조하므로 세션이 하나라도 있으면 어차피 삭제할 수 없다.
// 소프트 삭제된 세션도 행이 남아 있으면 FK에 걸리므로 deletedAt과 무관하게 센다. 수업 생성 배치(lib/sessionGeneration.ts)가
// 세션을 만들기 시작하면 이 경로가 실제로 의미를 갖는다 — 삭제 대신 "수강 종료/홀드" 같은 상태 변경을 쓰게 안내한다.
// 앱의 prisma는 $extends 클라이언트라 PrismaClient 타입과 구조가 달라서, 필요한 count만 구조적으로 요구한다.
type SessionCounter = { classSession: { count(args: { where: { enrollmentId: number } }): Promise<number> } };

export async function countSessionsBlockingDeletion(db: SessionCounter, enrollmentId: number): Promise<number> {
  return db.classSession.count({ where: { enrollmentId } });
}

export function deletionBlockedMessage(sessionCount: number): string {
  return `이 수강에는 수업이 ${sessionCount}건 있어(삭제된 수업 내역 포함) 삭제할 수 없습니다. 삭제 대신 수강 상태를 '종료'로 변경해 주세요.`;
}
