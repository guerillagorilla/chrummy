import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SRC_ROOT = path.join(ROOT, "src");
const PUBLIC_ROOT = path.join(ROOT, "public");

async function copyFileToPublic(srcPath, destPath) {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.copyFile(srcPath, destPath);
}

async function copyDirToPublic(srcDir, destDir) {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);
      if (entry.isDirectory()) {
        await copyDirToPublic(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    })
  );
}

async function build() {
  await fs.rm(path.join(PUBLIC_ROOT, "engine"), { recursive: true, force: true });
  await copyFileToPublic(
    path.join(SRC_ROOT, "app.js"),
    path.join(PUBLIC_ROOT, "app.js")
  );
  await copyFileToPublic(
    path.join(SRC_ROOT, "styles.css"),
    path.join(PUBLIC_ROOT, "styles.css")
  );
  await copyDirToPublic(
    path.join(SRC_ROOT, "engine"),
    path.join(PUBLIC_ROOT, "engine")
  );
}

build().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
