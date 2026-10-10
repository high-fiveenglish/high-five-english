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

// ── 외부 연동 격리 ──────────────────────────────────────────────────────────────────
// 앱 코드를 그대로 부르는 테스트라서, 로컬 셸에 운영 키가 있으면 서버 액션이 실제 Google Sheets / R2 / AI / AssemblyAI에
// 접근할 수 있다. ① 외부 서비스 환경변수를 지우고(아무 연동도 설정되어 있지 않으면 앱은 "건너뜀"으로 동작한다)
// ② 로컬(localhost) 밖으로 나가는 모든 TCP 연결을 막아 기록한다. 테스트는 마지막에 기록이 비어 있는지 확인한다.
import net from "node:net";

const EXTERNAL_ENV = /^(GOOGLE_|R2_|ANTHROPIC_|ASSEMBLYAI_|RECORDING_|KAKAO_|AWS_|SSO_SHARED_SECRET|MARKETING_SITE_URL|NETLIFY_|CLAUDE_)/;
export const clearedEnvKeys: string[] = [];
export const blockedExternalConnections: string[] = [];

export function isolateExternalServices() {
  for (const key of Object.keys(process.env)) {
    if (EXTERNAL_ENV.test(key)) {
      clearedEnvKeys.push(key);
      delete process.env[key];
    }
  }
  process.env.SSO_SHARED_SECRET = "rbac-integration-test-sso-secret"; // 서명 키만 가짜 값으로(임의 외부 서비스 아님)

  const proto = net.Socket.prototype as unknown as { connect: (...args: unknown[]) => unknown };
  const original = proto.connect;
  proto.connect = function (this: unknown, ...args: unknown[]) {
    // net.connect()는 Socket.connect([옵션, 콜백]) 처럼 배열 하나로 넘겨 부른다
    const first = Array.isArray(args[0]) ? (args[0] as unknown[])[0] : args[0];
    let host = "localhost";
    if (first && typeof first === "object") {
      const o = first as { host?: string; path?: string };
      if (o.path) return original.apply(this, args); // unix socket
      host = o.host ?? "localhost";
    } else if (typeof first === "number" || (typeof first === "string" && /^\d+$/.test(first))) {
      host = typeof args[1] === "string" ? (args[1] as string) : "localhost";
    } else if (typeof first === "string") {
      return original.apply(this, args); // path
    }
    if (!["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(host)) {
      blockedExternalConnections.push(host);
      throw new Error(`blocked external connection to ${host}`);
    }
    return original.apply(this, args);
  };
}
