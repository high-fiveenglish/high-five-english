import { requireStudent } from "@/lib/studentAuth";
import { ProfileEditForm } from "./ProfileEditForm";

export default async function StudentProfilePage() {
  const student = await requireStudent();

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-slate-900">정보변경</h1>
      <p className="mb-6 text-sm text-slate-500">
        이름·로그인 ID·회원등급 등은 관리자만 변경할 수 있습니다. 그 외 연락처와 비밀번호는 직접 수정할 수 있습니다.
      </p>

      <ProfileEditForm
        student={{
          name: student.name,
          loginId: student.loginId,
          englishName: student.englishName,
          sex: student.sex,
          birthDate: student.birthDate ? student.birthDate.toISOString().slice(0, 10) : null,
          occupation: student.occupation,
          region: student.region,
          address: student.address,
          mobilePhone: student.mobilePhone,
          email: student.email,
          preferredClassMethod: student.preferredClassMethod,
          teamsId: student.teamsId,
          kakaoId: student.kakaoId,
          wechatId: student.wechatId,
        }}
      />
    </div>
  );
}
