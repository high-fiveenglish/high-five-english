// Mock login accounts. There is no real backend, so this list stands in for a user
// table — passwords are plaintext demo values ONLY because nothing here is real; a real
// backend must hash/salt passwords and never keep this file's shape as-is.
import type { PermissionKey, Role } from "../lib/auth/types";

export type Account = {
  id: string;
  password: string;
  name: string;
  role: Role;
  /** studentId for a student account, teacherId for a teacher account, null otherwise. */
  linkedId: string | null;
  /** Only used for role "general_admin" — the specific permissions a Manager granted. */
  permissions?: PermissionKey[];
};

export const ACCOUNTS: Account[] = [
  { id: "manager", password: "manager123", name: "김대표", role: "general_manager", linkedId: null },
  {
    id: "admin1",
    password: "admin123",
    name: "박관리",
    role: "general_admin",
    linkedId: null,
    permissions: ["students", "teachers", "lessons", "schedule"],
  },
  {
    id: "admin2",
    password: "admin123",
    name: "이운영",
    role: "general_admin",
    linkedId: null,
    permissions: ["evaluations", "attendance", "meetingLinks", "holidays"],
  },
  { id: "james", password: "teacher123", name: "제임스", role: "teacher", linkedId: "james" },
  { id: "sarah", password: "teacher123", name: "사라", role: "teacher", linkedId: "sarah" },
  { id: "emily", password: "teacher123", name: "에밀리", role: "teacher", linkedId: "emily" },
  {
    id: "demo-student",
    password: "student123",
    name: "김민준",
    role: "student",
    linkedId: "demo-student",
  },
  { id: "student-2", password: "student123", name: "이서연", role: "student", linkedId: "student-2" },
  { id: "student-3", password: "student123", name: "박도윤", role: "student", linkedId: "student-3" },
  { id: "student-4", password: "student123", name: "최지우", role: "student", linkedId: "student-4" },
  { id: "student-5", password: "student123", name: "정하은", role: "student", linkedId: "student-5" },
  { id: "student-6", password: "student123", name: "강태오", role: "student", linkedId: "student-6" },
];
