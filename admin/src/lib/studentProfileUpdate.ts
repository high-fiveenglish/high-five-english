import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import type { Sex, ResidenceRegion } from "@/generated/prisma/client";

// 학생 본인이 스스로 고칠 수 있는 필드 목록 + 검증 로직의 단일 출처. admin 자체
// 정보변경 페이지(student/(dashboard)/profile, 쿠키 세션)와 마케팅 사이트가 쓰는
// 공개 API(student-profile route, bearer 토큰) 둘 다 이 함수를 호출한다 — 입력을
// 파싱하는 방식(FormData vs JSON)만 다르고 실제 저장 로직은 하나로 유지한다.
export type ProfileUpdateInput = {
  englishName: string;
  sex: string;
  birthDate: string;
  occupation: string;
  region: string;
  address: string;
  mobilePhone: string;
  email: string;
  preferredClassMethod: string;
  teamsId: string;
  kakaoId: string;
  wechatId: string;
  newPassword: string;
  newPasswordConfirm: string;
};

export async function applyStudentProfileUpdate(
  studentId: number,
  input: ProfileUpdateInput,
): Promise<{ error?: string; passwordChanged?: boolean }> {
  const { newPassword, newPasswordConfirm } = input;

  if (newPassword && newPassword !== newPasswordConfirm) {
    return { error: "새 비밀번호와 비밀번호 확인이 일치하지 않습니다." };
  }
  if (newPassword && newPassword.length < 4) {
    return { error: "비밀번호는 4자 이상이어야 합니다." };
  }

  await prisma.student.update({
    where: { id: studentId },
    data: {
      englishName: input.englishName || null,
      sex: input.sex ? (input.sex as Sex) : null,
      birthDate: input.birthDate ? new Date(input.birthDate) : null,
      occupation: input.occupation || null,
      region: input.region ? (input.region as ResidenceRegion) : null,
      address: input.address || null,
      mobilePhone: input.mobilePhone || null,
      email: input.email || null,
      preferredClassMethod: input.preferredClassMethod || null,
      teamsId: input.teamsId || null,
      kakaoId: input.kakaoId || null,
      wechatId: input.wechatId || null,
      ...(newPassword ? { passwordHash: await bcrypt.hash(newPassword, 10) } : {}),
    },
  });

  return { passwordChanged: !!newPassword };
}

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

export async function getStudentProfileSnapshot(studentId: number): Promise<StudentProfileSnapshot | null> {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student || student.deletedAt) return null;
  return {
    studentId: student.id,
    loginId: student.loginId,
    name: student.name,
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
    kakaoLinked: !!student.kakaoUserId,
  };
}
