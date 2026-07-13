import { readFile } from "node:fs/promises";

const registry = JSON.parse(await readFile(new URL("../apps.json", import.meta.url), "utf8"));
if (registry.schema_version !== 1 || registry.registry_kind !== "sym_app_registry") throw new Error("Invalid registry envelope");
if (!Array.isArray(registry.categories) || !Array.isArray(registry.apps)) throw new Error("Registry categories/apps must be arrays");
const ids = new Set();
for (const app of registry.apps) {
  for (const field of ["id", "name", "subtitle", "description", "category"]) if (!app[field]) throw new Error(`App is missing ${field}`);
  if (ids.has(app.id)) throw new Error(`Duplicate app id: ${app.id}`);
  ids.add(app.id);
  if (!app.media?.icon_url?.startsWith("https://raw.githubusercontent.com/symposium-apps/")) throw new Error(`${app.id}: invalid icon URL`);
  if (!app.source?.repository_url?.startsWith("https://github.com/symposium-apps/")) throw new Error(`${app.id}: invalid source repository`);
  if (app.release?.update_policy !== "automatic" || app.install?.automatic_updates !== true) throw new Error(`${app.id}: automatic update policy missing`);
  if ("update_available" in (app.preview_state || {})) throw new Error(`${app.id}: manual update state is forbidden`);
}
console.log(`Registry is valid with ${registry.apps.length} app(s).`);
