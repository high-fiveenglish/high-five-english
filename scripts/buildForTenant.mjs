#!/usr/bin/env node
// 협력사별로 실제 도메인이 따로 생기면, 하나의 빌드가 브라우저에서 도메인을 보고
// 스스로 판단하는 지금 구조를 유지할 필요가 없다 — 이미 협력사마다 따로 빌드해서
// 따로 배포하고 있으므로(hifive-mnmenglish-preview / hifive-synergyenglish-preview
// 등), 빌드 시점에 그 협력사의 실제 브랜딩을 정적 index.html에 미리 박아넣으면
// 반응형 JS가 로딩되기 전 잠깐 본사 기본값이 스치는 문제가 완전히 사라진다.
//
// 사용법: VITE_TENANT_DOMAIN=<그 협력사에 연결된 도메인> VITE_ADMIN_API_URL=<admin
// 서버 주소> node scripts/buildForTenant.mjs
// VITE_TENANT_DOMAIN을 안 주면 기존 `npm run build`와 완전히 동일하게 동작한다
// (본사 기본값 그대로, 이 스크립트를 안 쓰는 것과 차이 없음).
import fs from "fs";
import { execSync } from "child_process";

const INDEX_PATH = "index.html";
const DEFAULT_ADMIN_URL = "http://localhost:3001";

async function fetchTenantSeo(domain, adminUrl) {
  const res = await fetch(`${adminUrl}/api/public/agency-branding?domain=${encodeURIComponent(domain)}`);
  if (!res.ok) throw new Error(`agency-branding ${res.status}`);
  return res.json();
}

function injectSeo(html, seo) {
  const name = seo.isHeadquarters ? "하이파이브 잉글리쉬" : seo.name;
  const tagline = seo.brandTagline ?? "1:1 화상영어";
  const title = `${name} | ${tagline}`;
  const description = `${name} - EFL 환경에 최적화된 1:1 화상영어. 원어민·전문 외국인 강사와의 인터랙티브 수업으로 실전 영어를 완성하세요.`;

  let out = html
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${description}" />`);

  if (seo.logoUrl) {
    out = out.replace(
      /<link rel="icon"[^>]*\/>/,
      `<link rel="icon" href="${seo.logoUrl}" />`,
    );
  }
  return out;
}

async function main() {
  const domain = process.env.VITE_TENANT_DOMAIN;
  const adminUrl = process.env.VITE_ADMIN_API_URL ?? DEFAULT_ADMIN_URL;
  const original = fs.readFileSync(INDEX_PATH, "utf8");

  if (domain) {
    try {
      const seo = await fetchTenantSeo(domain, adminUrl);
      fs.writeFileSync(INDEX_PATH, injectSeo(original, seo), "utf8");
      console.log(`[buildForTenant] domain=${domain} → "${seo.isHeadquarters ? "하이파이브 잉글리쉬" : seo.name}" 기준으로 index.html 임시 수정`);
    } catch (err) {
      console.warn(`[buildForTenant] agency-branding 조회 실패(${err.message}) — 기본 index.html로 빌드합니다.`);
    }
  }

  try {
    execSync("npx tsc -b && npx vite build", { stdio: "inherit" });
  } finally {
    // 빌드가 성공하든 실패하든 소스 트리는 항상 원상 복구한다.
    fs.writeFileSync(INDEX_PATH, original, "utf8");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
