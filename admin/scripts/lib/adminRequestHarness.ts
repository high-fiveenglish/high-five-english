// 관리자 페이지/서버 액션/API 라우트를 Next 서버 없이 직접 호출해 보는 테스트용 하네스.
//
// 실제 요청 안에서만 동작하는 next/headers(cookies)와 next/cache(revalidatePath)를 가짜로 바꿔 끼운다.
// 앱 코드(requireBackofficeActor, 페이지, 서버 액션)는 한 줄도 바꾸지 않고 그대로 실행되므로
// "쿠키로 로그인한 사용자가 이 페이지/액션을 부르면 어떻게 되는가"를 그대로 검증할 수 있다.
// 반드시 앱 모듈(@/lib/...)보다 먼저 import 해야 한다.
import Module from "node:module";

type CookieEntry = { name: string; value: string };
const jar = new Map<string, CookieEntry>();

const fakeCookies = {
  get: (name: string) => jar.get(name),
  getAll: () => [...jar.values()],
  has: (name: string) => jar.has(name),
  set: (name: string, value?: string) => {
    jar.set(name, { name, value: value ?? "" });
  },
  delete: (name: string) => {
    jar.delete(name);
  },
};

const stubs: Record<string, unknown> = {
  "next/headers": {
    cookies: async () => fakeCookies,
    headers: async () => new Headers(),
  },
  "next/cache": {
    revalidatePath: () => {},
    revalidateTag: () => {},
    unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn,
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M = Module as any;
const originalLoad = M._load;
M._load = function (request: string, ...rest: unknown[]) {
  if (request in stubs) return stubs[request];
  return originalLoad.call(this, request, ...rest);
};

/** 쿠키를 모두 비운다(= 로그아웃 상태). */
export function clearCookies() {
  jar.clear();
}

export function cookieNames(): string[] {
  return [...jar.keys()];
}

/** Next가 notFound()/redirect()가 던지는 오류를 구분한다. */
export function classifyThrown(err: unknown): "notFound" | "redirect" | "forbidden" | "other" {
  const e = err as { digest?: unknown; name?: unknown; message?: unknown } | null;
  const digest = typeof e?.digest === "string" ? e.digest : "";
  if (digest.startsWith("NEXT_REDIRECT")) return "redirect";
  if (digest === "NEXT_NOT_FOUND" || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404")) return "notFound";
  if (e?.name === "ForbiddenError") return "forbidden";
  return "other";
}

export type Outcome = { kind: "ok"; value: unknown } | { kind: "notFound" | "redirect" | "forbidden" | "other"; error: unknown };

export async function attempt(fn: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { kind: "ok", value: await fn() };
  } catch (err) {
    return { kind: classifyThrown(err), error: err };
  }
}
