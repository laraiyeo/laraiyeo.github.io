#!/usr/bin/env node
// Script: convert-hrefs-to-combiner.js
// Purpose: find common ESPN href usages in `src/screens/**` (except mlb & esports)
// and replace `.headshot?.href`, `.logo?.href`, `.logos[0]?.href` forms with
// `combinerUrl(..., 200, 200)` calls. Default is dry-run. Use `--apply` to write.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SCREENS_DIR = path.join(ROOT, "src", "screens");
const UTILS_PATH = path.join(ROOT, "src", "utils", "imageUtils.js");

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");

function walkDir(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach((f) => {
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      // skip mlb and esports
      if (f.toLowerCase() === "mlb" || f.toLowerCase() === "esports") return;
      walkDir(full, fileList);
    } else if (stat.isFile() && /\.(js|jsx|ts|tsx)$/.test(f)) {
      fileList.push(full);
    }
  });
  return fileList;
}

function ensureImport(content, relImportPath) {
  // If combinerUrl is already imported, skip
  if (/combinerUrl\s*\}/.test(content) || /combinerUrl\s*from/.test(content))
    return content;

  // insert after the last import statement at the top of the file, or at the top
  const importRegex = /(^import[\s\S]*?;\s*)/m;
  const allImports = content.match(/(^import[\s\S]*?;\s*)+/m);
  const importLine = `import { combinerUrl } from '${relImportPath.replace(
    /\\/g,
    "/"
  )}';\n`;
  if (allImports && allImports.length > 0) {
    // insert after imports block
    const importsBlock = allImports[0];
    return content.replace(importsBlock, importsBlock + importLine);
  }

  // No import block found, add at top
  return importLine + content;
}

function processFile(filePath) {
  const original = fs.readFileSync(filePath, "utf8");
  let content = original;

  // Skip binary-ish files
  if (content.indexOf("\n") === -1) return { filePath, changed: false };

  // Build relative import path from file to utils
  const fileDir = path.dirname(filePath);
  let relPath = path.relative(fileDir, UTILS_PATH).replace(/\\/g, "/");
  if (!relPath.startsWith(".")) relPath = "./" + relPath;
  relPath = relPath.replace(/\.js$/, ""); // remove .js for import

  // Patterns to replace. We'll capture the left-hand prefix so we can inject it.
  // 1) prefix.headshot?.href  => combinerUrl(prefix.headshot?.href,200,200)
  content = content.replace(
    /([A-Za-z0-9_\$\)\]\.'\"]+)\.headshot\?\.href/g,
    (m, p) => {
      return `combinerUrl(${p}.headshot?.href,200,200)`;
    }
  );

  // 2) prefix.logo?.href
  content = content.replace(
    /([A-Za-z0-9_\$\)\]\.'\"]+)\.logo\?\.href/g,
    (m, p) => {
      return `combinerUrl(${p}.logo?.href,200,200)`;
    }
  );

  // 3) prefix.logos[0]?.href and prefix.logos?.[0]?.href and prefix.logos?.[0]?.href variants
  content = content.replace(
    /([A-Za-z0-9_\$\)\]\.'\"]+)\.logos(?:\?\.)?\[\s*0\s*\](?:\?\.)?href/g,
    (m, p) => {
      return `combinerUrl(${p}.logos?.[0]?.href,200,200)`;
    }
  );

  // 4) plain prefix.logoHref or .href patterns often used: try to catch `.href` where left token includes team/logo/headshot
  // Only attempt shallow replacement to avoid false positives: look for `team.logo?.href` etc already covered; skip broad .href changes.

  let changed = content !== original;
  if (changed) {
    // Ensure combinerUrl import exists
    content = ensureImport(content, relPath);

    if (APPLY) {
      fs.writeFileSync(filePath, content, "utf8");
      return { filePath, changed: true, applied: true };
    }
    return { filePath, changed: true, applied: false };
  }

  return { filePath, changed: false };
}

function main() {
  console.log(
    "Scanning src/screens for href patterns (excluding mlb and esports)..."
  );
  const files = walkDir(SCREENS_DIR);
  console.log(`Found ${files.length} candidate files.`);

  const results = [];
  for (const f of files) {
    try {
      const r = processFile(f);
      if (r.changed) results.push(r);
    } catch (e) {
      console.error("Error processing", f, e.message);
    }
  }

  console.log(`Modified ${results.length} files${APPLY ? "" : " (dry-run)"}:`);
  results.forEach((r) => console.log(r.filePath));
  if (!APPLY) {
    console.log(
      "\nDry-run complete. Re-run with `node scripts/convert-hrefs-to-combiner.js --apply` to apply changes."
    );
  } else {
    console.log("\nApplied changes. Please review diffs and run your app.");
  }
}

main();
