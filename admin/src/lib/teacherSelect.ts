// 다른 모델에서 `include: { teacher: true }`로 담당 강사 정보를 함께 가져올 때 쓰는
// 안전한 최소 필드 선택자. 강사 프로필의 사진/음성/자기소개/경력
// (photoUrl/voiceUrl/selfIntroduction/experience)은 @db.Text 대용량 필드라(예: 실측
// voiceUrl 하나만으로도 22행 조회에 최대 34초) — 이 필드들은 강사 본인 프로필
// 조회/수정 화면(teachers/[id]/page.tsx, api/public/teachers)에서만 직접 select하고,
// 다른 화면이 "이 수업 담당 강사가 누구인지" 보여주려고 조인할 때는 이 목록만 쓴다.
// passwordHash도 여기서 항상 제외한다 — 다른 화면이 강사 비밀번호 해시를 함께 들고
// 다닐 이유가 없고, Server Component를 거치며 클라이언트로 새어나갈 위험도 없앤다.
export const TEACHER_SUMMARY_SELECT = {
  id: true,
  siteId: true,
  realName: true,
  nickname: true,
  loginId: true,
  nationality: true,
  timezoneOffset: true,
  teamLeaderId: true,
  email: true,
  approvalStatus: true,
  accountStatus: true,
  joinedAt: true,
  lastLoginAt: true,
  teacherGrade: true,
  sex: true,
  age: true,
  schoolName: true,
  major: true,
  address: true,
  availableHours: true,
  mobilePhone: true,
  teamsId: true,
  teamsUrl: true,
  zoomUrl: true,
  zoomPw: true,
  tencentUrl: true,
  videoYoutubeCode: true,
  tesol: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
} as const;
