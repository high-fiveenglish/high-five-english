// One-off exporter: inlines the Vite dist/ build (CSS, JS, audio) into a
// single self-contained HTML file suitable for publishing as an Artifact.
// Run after `vite build --base ./` with HashRouter + Google Fonts swapped in.
import { readFileSync, writeFileSync } from "node:fs";

const css = readFileSync("dist/assets/index-CPuK4UQQ.css", "utf-8");
const js = readFileSync("dist/assets/index-BvTWjWkc.js", "utf-8");

const audioFiles = ["intro-1", "intro-2", "intro-3", "intro-4"];
let jsWithAudio = js;
for (const name of audioFiles) {
  const buf = readFileSync(`dist/audio/${name}.wav`);
  const dataUri = `data:audio/wav;base64,${buf.toString("base64")}`;
  jsWithAudio = jsWithAudio.split(`/audio/${name}.wav`).join(dataUri);
}

const fontLink =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&display=swap">';

const out = `<title>하이파이브 잉글리쉬</title>
${fontLink}
<style>${css}</style>
<div id="root"></div>
<script type="module">${jsWithAudio}</script>
`;

writeFileSync("artifact-export.html", out, "utf-8");
console.log("wrote artifact-export.html", (out.length / 1024).toFixed(0) + "KB");
