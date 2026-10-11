import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const html = readFileSync("src/web/index.html", "utf8");

mkdirSync("public", { recursive: true });
writeFileSync("public/index.html", html);

writeFileSync(
  "src/worker/index-html.js",
  `// 自動生成ファイル。直接編集しないこと\nmodule.exports = ${JSON.stringify(html)};\n`
);

console.log("built: public/index.html, src/worker/index-html.js");
