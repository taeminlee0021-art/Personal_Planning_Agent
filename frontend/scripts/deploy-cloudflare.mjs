// Deploy the existing Vinext build to the owner's Cloudflare Workers account.
// This is independent of ChatGPT Sites: dist/server/wrangler.json is left as
// built, and a sibling wrangler.cloudflare.json is generated next to it so the
// relative `main` and `assets` paths keep resolving.
//
//   $env:CF_BACKEND_API_URL = "https://<backend>"; npm run deploy:cloudflare
//   npm run deploy:cloudflare -- --skip-build   # reuse the current dist/
//   npm run deploy:cloudflare -- --dry-run      # validate without uploading
//
// APP_INTERNAL_TOKEN is never written here. Add it after Access is confirmed:
//   npx wrangler secret put APP_INTERNAL_TOKEN --name personal-planning-agent
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WORKER_NAME = "personal-planning-agent";
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const serverDir = path.join(projectRoot, "dist", "server");
const builtConfig = path.join(serverDir, "wrangler.json");
const deployConfig = path.join(serverDir, "wrangler.cloudflare.json");
const args = process.argv.slice(2);
const skipBuild = args.includes("--skip-build");
const dryRun = args.includes("--dry-run");

process.env.WRANGLER_SEND_METRICS ||= "false";
process.chdir(projectRoot);

function run(label, command, commandArgs) {
  console.log(`\n[deploy-cloudflare] ${label}`);
  const result = spawnSync(command, commandArgs, { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`[deploy-cloudflare] ${label} failed (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}

const backendUrl = (process.env.CF_BACKEND_API_URL || "").trim();
let parsed;
try { parsed = new URL(backendUrl); } catch { parsed = null; }
if (!parsed || parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) {
  console.error("[deploy-cloudflare] Set CF_BACKEND_API_URL to the backend origin, e.g. https://example.onrender.com");
  process.exit(1);
}
const normalizedBackend = parsed.origin;

if (!skipBuild) {
  run("Building with the existing Sites build", process.execPath, [
    path.join(projectRoot, "scripts", "run-framework.mjs"), "build",
  ]);
}
if (!existsSync(builtConfig)) {
  console.error(`[deploy-cloudflare] Missing ${builtConfig}. Run a build first.`);
  process.exit(1);
}

const base = JSON.parse(readFileSync(builtConfig, "utf8"));
const forbidden = ["APP_INTERNAL_TOKEN", "OPENAI_API_KEY"];
const leaked = forbidden.filter((name) => name in (base.vars ?? {}));
if (leaked.length) {
  console.error(`[deploy-cloudflare] Refusing to deploy: ${leaked.join(", ")} present in build vars.`);
  process.exit(1);
}
const config = {
  ...base,
  name: WORKER_NAME,
  topLevelName: WORKER_NAME,
  workers_dev: true,
  // Preview URLs would bypass the Access policy on the production hostname.
  preview_urls: false,
  vars: { ...(base.vars ?? {}), BACKEND_API_URL: normalizedBackend },
};
writeFileSync(deployConfig, JSON.stringify(config, null, 2) + "\n");
console.log(`[deploy-cloudflare] Wrote ${path.relative(projectRoot, deployConfig)} (worker ${WORKER_NAME}, backend ${normalizedBackend})`);

run(dryRun ? "Validating (dry run)" : "Deploying", process.execPath, [
  path.join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js"),
  "deploy", "--config", deployConfig, ...(dryRun ? ["--dry-run"] : []),
]);
