// admin의 실제 학생 계정(Postgres)을 이 사이트의 세션으로 이어붙이는 공용 타입/로직 —
// admin이 "회원으로 로그인"으로 넘겨주는 SSO 경로(SsoLoginPage)와, 학생이 홈페이지
// 로그인창에 실제 아이디/비밀번호를 직접 입력하는 경로(authService.login) 둘 다 admin
// 으로부터 같은 모양의 응답을 받으므로 이 파일을 공유한다.
//
// 예전에는 여기서 admin이 돌려준 enrollment 정보로 가짜 Lesson[]을 클라이언트에서
// 직접 만들어(generateInitialSchedule) store에 밀어 넣었지만, 이제 "내 강의실"
// (classroomService.getMyClassroom)이 실제 계정일 때 admin의 /api/public/classroom을
// 매번 직접 호출해 진짜 수업/휴강 데이터를 그대로 보여주므로 그 가짜 데이터가 필요
// 없어졌다 — 여기 남은 건 studentId → linkedId 변환뿐이다.

export type StudentProfileSnapshot = {
  studentId: number;
  loginId: string;
  name: string;
  englishName: string | null;
  sex: string | null;
  birthDate: string | null;
  occupation: string | null;
  region: string | null;
  address: string | null;
  mobilePhone: string | null;
  email: string | null;
  preferredClassMethod: string | null;
  teamsId: string | null;
  kakaoId: string | null;
  wechatId: string | null;
  kakaoLinked: boolean;
};

export type RealStudentData = {
  studentId: number;
  loginId: string;
  name: string;
  englishName: string | null;
  /** admin이 발급한 학생 API 토큰 — "정보변경"·"내 강의실"이 마케팅 사이트 안에서
   * 바로 조회/저장하기 위해 쓴다(studentProfileService.ts, classroomBridgeService.ts
   * 참고). */
  apiToken: string;
  /** 로그인/SSO 응답에 이미 실려오는 전체 프로필 스냅샷 — "정보변경" 화면이 열자마자
   * 이 값을 그대로 보여주고 별도 조회 없이 즉시 렌더링한다(로딩 스피너 없이). */
  profile: StudentProfileSnapshot | null;
};

export function linkedIdForRealStudent(studentId: number): string {
  return `admin-${studentId}`;
}
