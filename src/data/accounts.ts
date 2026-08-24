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
  /** Each account's own UI language — completely independent of every other account's.
   * A general_manager's "en" here never affects what a student with "zh" sees, and vice
   * versa. Language code, not validated against SUPPORTED_LANGUAGES here to avoid a
   * circular import from src/i18n/config.ts — callers validate at the edge (LanguageContext). */
  preferredLanguage?: string;
};

export const ACCOUNTS: Account[] = [
  {
    id: "admin",
    password: "0000",
    name: "관리자",
    role: "general_manager",
    linkedId: null,
    preferredLanguage: "ko",
  },
  {
    id: "manager",
    password: "manager123",
    name: "김대표",
    role: "general_manager",
    linkedId: null,
    preferredLanguage: "en",
  },
  {
    id: "admin1",
    password: "admin123",
    name: "박관리",
    role: "general_admin",
    linkedId: null,
    permissions: ["students", "teachers", "lessons", "schedule"],
    preferredLanguage: "en",
  },
  {
    id: "admin2",
    password: "admin123",
    name: "이운영",
    role: "general_admin",
    linkedId: null,
    permissions: ["evaluations", "attendance", "meetingLinks", "holidays"],
    preferredLanguage: "ko",
  },
  { id: "james", password: "teacher123", name: "제임스", role: "teacher", linkedId: "james", preferredLanguage: "en" },
  { id: "sarah", password: "teacher123", name: "사라", role: "teacher", linkedId: "sarah", preferredLanguage: "en" },
  { id: "emily", password: "teacher123", name: "에밀리", role: "teacher", linkedId: "emily", preferredLanguage: "en" },
  {
    id: "demo-student",
    password: "student123",
    name: "김민준",
    role: "student",
    linkedId: "demo-student",
    preferredLanguage: "ko",
  },
  {
    id: "student-2",
    password: "student123",
    name: "이서연",
    role: "student",
    linkedId: "student-2",
    preferredLanguage: "ko",
  },
  {
    id: "student-3",
    password: "student123",
    name: "박도윤",
    role: "student",
    linkedId: "student-3",
    preferredLanguage: "en",
  },
  {
    id: "student-4",
    password: "student123",
    name: "최지우",
    role: "student",
    linkedId: "student-4",
    preferredLanguage: "zh",
  },
  {
    id: "student-5",
    password: "student123",
    name: "정하은",
    role: "student",
    linkedId: "student-5",
    preferredLanguage: "vi",
  },
  {
    id: "student-6",
    password: "student123",
    name: "강태오",
    role: "student",
    linkedId: "student-6",
    preferredLanguage: "zh",
  },
];
