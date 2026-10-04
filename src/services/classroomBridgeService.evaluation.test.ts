import { afterEach, describe, expect, it, vi } from "vitest";
import { EVALUATION_FETCH_TIMEOUT_MS, fetchRealLessonEvaluation } from "./classroomBridgeService";

const VALID = {
  lessonId: 4689,
  date: "2026-08-18",
  content: "📘 Title\n\nBody",
  contentTranslated: "📘 제목\n\n본문",
  translatedLangLabel: "한국어",
};

function respond(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchRealLessonEvaluation", () => {
  it("sends the student bearer token and the lesson id, and returns the evaluation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, VALID));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchRealLessonEvaluation("tok-123", 4689);
    expect(res).toEqual({ status: "ok", evaluation: VALID });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/public/classroom/evaluation?lessonId=4689");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
  });

  it("accepts an evaluation without a translation (English only)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, { ...VALID, contentTranslated: null, translatedLangLabel: null })));
    const res = await fetchRealLessonEvaluation("t", 1);
    expect(res.status).toBe("ok");
    if (res.status === "ok") expect(res.evaluation.contentTranslated).toBeNull();
  });

  it("maps 404 (not published yet / not this student's lesson) to not_found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(404, { error: "not_found" })));
    expect(await fetchRealLessonEvaluation("t", 1)).toEqual({ status: "not_found" });
  });

  it("maps 401 to session_expired", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(401, { error: "invalid_or_expired_token" })));
    expect(await fetchRealLessonEvaluation("t", 1)).toEqual({ status: "session_expired" });
  });

  it("maps server errors to an error result (never an endless loading state)", async () => {
    for (const status of [400, 403, 500, 502, 503]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(status, { error: "x" })));
      expect(await fetchRealLessonEvaluation("t", 1)).toEqual({ status: "error", kind: "server" });
    }
  });

  it("maps a network failure to an error result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await fetchRealLessonEvaluation("t", 1)).toEqual({ status: "error", kind: "network" });
  });

  it("rejects an unexpected 200 body instead of rendering it", async () => {
    for (const body of [{}, { ...VALID, content: undefined }, { ...VALID, lessonId: "4689" }, { ...VALID, contentTranslated: 5 }, "text", null, []]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, body)));
      expect(await fetchRealLessonEvaluation("t", 1)).toEqual({ status: "error", kind: "server" });
    }
  });

  it("rejects a 200 response that is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>oops</html>", { status: 200 })));
    expect(await fetchRealLessonEvaluation("t", 1)).toEqual({ status: "error", kind: "network" });
  });

  it("gives up after the timeout when the server never answers", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))),
    );
    const pending = fetchRealLessonEvaluation("t", 1);
    await vi.advanceTimersByTimeAsync(EVALUATION_FETCH_TIMEOUT_MS + 1);
    expect(await pending).toEqual({ status: "error", kind: "network" });
  });
});
