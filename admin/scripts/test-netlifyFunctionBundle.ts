// Netlify bundles every file in netlify/functions to CommonJS. In a CommonJS bundle esbuild turns `import.meta` into an empty object, so any
// project code that reads `import.meta.url` throws as soon as the function is loaded ("The "path" argument must be of type string or an
// instance of URL. Received undefined" — seen in production on recover-transcribed-recordings, which is why no recording was ever analysed).
// The generated Prisma client did exactly that until `moduleFormat = "cjs"` was set in prisma/schema.prisma.
//
// This test reproduces the production conditions without Netlify: it bundles each function to CJS the way Netlify does (project code bundled,
// node_modules kept external), then LOADS the bundle in a clean Node process. Handlers are not invoked, no database is contacted
// (DATABASE_URL is an unreachable dummy), and no API key is needed. Run from the admin directory: npx tsx scripts/test-netlifyFunctionBundle.ts
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else {
    failed++;
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const adminDir = process.cwd();
const functionsDir = path.join(adminDir, "netlify", "functions");
const generatedDir = path.join(adminDir, "src", "generated", "prisma");

async function main() {
  // 1. Static guard: nothing in the generated client may depend on import.meta (it is empty in a CJS bundle).
  const generatedFiles: string[] = [];
  (function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(ts|js|mjs|cjs)$/.test(entry.name)) generatedFiles.push(p);
    }
  })(generatedDir);
  check("the generated Prisma client exists (run `npx prisma generate` first)", generatedFiles.length > 0);
  const usingImportMeta = generatedFiles.filter((f) => fs.readFileSync(f, "utf8").includes("import.meta"));
  check("the generated Prisma client does not use import.meta (set moduleFormat = \"cjs\" in the generator)", usingImportMeta.length === 0, usingImportMeta.map((f) => path.relative(adminDir, f)).join(", "));

  // 2. Bundle every function to CJS like Netlify and load it.
  const entries = fs.readdirSync(functionsDir).filter((f) => /\.(ts|mts|js)$/.test(f));
  check("there are Netlify functions to check", entries.length >= 2, `found ${entries.length}`);
  const outDir = fs.mkdtempSync(path.join(adminDir, ".fn-bundle-")); // inside admin so external packages resolve from admin/node_modules
  try {
    for (const entry of entries) {
      const name = entry.replace(/\.(ts|mts|js)$/, "");
      const outfile = path.join(outDir, `${name}.cjs`);
      await build({
        entryPoints: [path.join(functionsDir, entry)],
        outfile,
        bundle: true,
        platform: "node",
        format: "cjs",
        packages: "external",
        logLevel: "silent",
        absWorkingDir: adminDir,
      });
      const loader = [
        "try {",
        "  const m = require(process.env.FUNCTION_BUNDLE);",
        "  if (typeof m.default !== 'function') { console.log('NO DEFAULT HANDLER'); process.exit(2); }",
        "} catch (e) {",
        "  console.log(String((e && e.name) || 'Error') + ': ' + String(e && e.message).slice(0, 200));",
        "  process.exit(1);",
        "}",
      ].join("\n");
      const run = spawnSync(process.execPath, ["--no-warnings", "-e", loader], {
        cwd: adminDir,
        encoding: "utf8",
        timeout: 60_000,
        env: { ...process.env, FUNCTION_BUNDLE: outfile, DATABASE_URL: "postgresql://dummy:dummy@127.0.0.1:1/dummy", NODE_ENV: "production" },
      });
      check(`${name}: the CJS bundle loads and exports a handler`, run.status === 0, `${(run.stdout || "") + (run.stderr || "")}`.trim().split("\n")[0]);
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.log("ERROR:", String(e?.message ?? e).slice(0, 300));
  process.exit(1);
});
