// Base URL of the separate admin/LMS backend (Next.js + Prisma + PostgreSQL, see
// admin/src/app/api/public/*). Only /api/public/* routes there accept unauthenticated
// cross-origin requests — everything else requires the admin session cookie and is not
// reachable from this site.
export const ADMIN_API_URL = import.meta.env.VITE_ADMIN_API_URL ?? "http://localhost:3001";
