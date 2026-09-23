// vite.config.ts의 localeBundlePlugin이 제공하는 virtual module의 타입 — 언어당
// 1개, { namespace: 내용 } 형태로 원본 namespace JSON 파일들을 묶어서 반환한다.
declare module "virtual:locale-bundle/*" {
  const bundle: Record<string, Record<string, unknown>>;
  export default bundle;
}
