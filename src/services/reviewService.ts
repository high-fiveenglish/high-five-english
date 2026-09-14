// Review board service layer — bridges to the real admin/LMS backend's public API
// (admin/src/app/api/public/reviews). Reading and writing both require login: the board
// itself needs a real studentApiToken (only a real student account can post/reply), and
// the Vite site's own mock admin panel (/admin/reviews) can list/delete via adminApiToken
// for moderation — the "홈페이지 노출용" curation feature that used to exist here
// (featuredOnHome/listPublishedReviews/setFeaturedOnHome) has been removed entirely; the
// board is only ever visible after login, never previewed on the public homepage.
import type { AuthErrorCode, ServiceResult } from "../lib/auth/types";
import { errResult, okResult } from "../lib/auth/types";
import type { ReviewPost } from "../lib/community/types";
import { ADMIN_API_URL } from "../lib/adminApi";

async function parseErrorCode(res: Response): Promise<AuthErrorCode> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error === "forbidden") return "FORBIDDEN_ROLE";
    if (data.error === "not_found" || data.error === "parent_not_found") return "NOT_FOUND";
  } catch {
    /* fall through */
  }
  return res.status === 401 ? "UNAUTHENTICATED" : "NOT_FOUND";
}

/** token: studentApiToken (게시판 열람용) 또는 adminApiToken(관리자 패널 모니터링용) —
 * 둘 중 하나만 있으면 된다. 없으면 애초에 호출하지 않는다(RouteGuard/canSubmit이 미리
 * 막는다). */
export async function listBoardPosts(token: string | null): Promise<ServiceResult<ReviewPost[]>> {
  if (!token) return errResult("UNAUTHENTICATED", "로그인이 필요합니다.");
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/reviews`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return errResult("NOT_FOUND", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  if (!res.ok) return errResult(await parseErrorCode(res), "게시글을 불러오지 못했습니다.");
  return okResult((await res.json()) as ReviewPost[]);
}

export async function getBoardPost(token: string | null, id: string): Promise<ServiceResult<ReviewPost>> {
  if (!token) return errResult("UNAUTHENTICATED", "로그인이 필요합니다.");
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/reviews/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return errResult("NOT_FOUND", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  if (!res.ok) return errResult(await parseErrorCode(res), "게시글을 찾을 수 없습니다.");
  return okResult((await res.json()) as ReviewPost);
}

export async function createBoardPost(
  studentApiToken: string | null,
  input: { title: string; content: string; parentId?: string },
): Promise<ServiceResult<ReviewPost>> {
  if (!studentApiToken) return errResult("UNAUTHENTICATED", "로그인이 필요합니다.");
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || !content) return errResult("NOT_FOUND", "제목과 내용을 모두 입력해주세요.");

  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentApiToken}` },
      body: JSON.stringify({ title, content, parentId: input.parentId }),
    });
  } catch {
    return errResult("NOT_FOUND", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  if (!res.ok) return errResult(await parseErrorCode(res), "게시글을 등록하지 못했습니다.");
  return okResult((await res.json()) as ReviewPost);
}

export async function updateBoardPost(
  studentApiToken: string | null,
  id: string,
  input: { title: string; content: string },
): Promise<ServiceResult<void>> {
  if (!studentApiToken) return errResult("UNAUTHENTICATED", "로그인이 필요합니다.");
  const title = input.title.trim();
  const content = input.content.trim();
  if (!title || !content) return errResult("NOT_FOUND", "제목과 내용을 모두 입력해주세요.");

  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/reviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${studentApiToken}` },
      body: JSON.stringify({ title, content }),
    });
  } catch {
    return errResult("NOT_FOUND", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  if (!res.ok) return errResult(await parseErrorCode(res), "게시글을 수정하지 못했습니다.");
  return okResult(undefined);
}

/** token: 작성자 본인의 studentApiToken 또는 모더레이션하는 관리자의 adminApiToken. */
export async function deleteBoardPost(token: string | null, id: string): Promise<ServiceResult<void>> {
  if (!token) return errResult("UNAUTHENTICATED", "로그인이 필요합니다.");
  let res: Response;
  try {
    res = await fetch(`${ADMIN_API_URL}/api/public/reviews/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return errResult("NOT_FOUND", "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }
  if (!res.ok) return errResult(await parseErrorCode(res), "게시글을 삭제하지 못했습니다.");
  return okResult(undefined);
}
