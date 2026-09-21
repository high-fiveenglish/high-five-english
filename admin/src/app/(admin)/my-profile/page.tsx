import { prisma } from "@/lib/prisma";
import { requireBackofficeActor } from "@/lib/backofficeAuth";
import { ProfileForm } from "./ProfileForm";

export default async function MyProfilePage() {
  const actor = await requireBackofficeActor();
  if (actor.role !== "AGENT") {
    return <p className="text-sm text-slate-500">이 화면은 협력사 관리자 계정 전용입니다.</p>;
  }

  const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: actor.id } });

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-xl font-bold text-slate-900">정보수정</h1>
      <ProfileForm
        user={{
          loginId: user.loginId,
          name: user.name,
          engName: user.engName,
          email: user.email,
          phone: user.phone,
          kakaoId: user.kakaoId,
          wechatId: user.wechatId,
        }}
      />
    </div>
  );
}
