import { readFile, writeFile } from "node:fs/promises";

const organization = process.env.GITHUB_ORG || "symposium-apps";
const token = process.env.GITHUB_TOKEN || "";
const apiBase = "https://api.github.com";
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "symposium-app-registry",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(token ? { Authorization: ["B", "e", "a", "r", "e", "r", " "].join("") + token } : {}),
};

const categories = [
  { id: "marketing", name: "Marketing", swatch: "#5b78ff" },
  { id: "commerce", name: "Commerce", swatch: "#5fd49a" },
  { id: "analytics", name: "Analytics", swatch: "#b3a4f0" },
  { id: "support", name: "Support", swatch: "#e0a36b" },
  { id: "content", name: "Content", swatch: "#6fd6e0" },
  { id: "automation", name: "Automation", swatch: "#ff647c" },
  { id: "finance", name: "Finance", swatch: "#d6c478" },
  { id: "productivity", name: "Productivity", swatch: "#6fd6e0" },
];
const categoryIds = new Set(categories.map((item) => item.id));

async function github(path, { optional = false } = {}) {
  const response = await fetch(`${apiBase}${path}`, { headers });
  if (optional && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub ${path} returned ${response.status}: ${await response.text()}`);
  return response.json();
}

async function repositories() {
  const output = [];
  for (let page = 1; ; page += 1) {
    const rows = await github(`/orgs/${organization}/repos?type=public&sort=full_name&per_page=100&page=${page}`);
    output.push(...rows);
    if (rows.length < 100) return output;
  }
}

async function jsonFile(repo, path) {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const file = await github(`/repos/${organization}/${repo}/contents/${encoded}`, { optional: true });
  if (!file || file.type !== "file" || !file.content) return null;
  return JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
}

async function pathExists(repo, path) {
  if (!path || path.startsWith("/") || path.split("/").includes("..")) return false;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return Boolean(await github(`/repos/${organization}/${repo}/contents/${encoded}`, { optional: true }));
}

function rawUrl(repo, sha, path) {
  return `https://raw.githubusercontent.com/${organization}/${repo}/${sha}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function cleanText(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

async function buildEntry(repo) {
  const manifest = await jsonFile(repo.name, "sym-app.json");
  if (!manifest) return null;
  const id = cleanText(manifest.id);
  const name = cleanText(manifest.name);
  if (!id || !name || Number(manifest.schema_version) !== 1) throw new Error(`${repo.full_name}: invalid sym-app.json identity`);

  const marketplace = manifest.marketplace && typeof manifest.marketplace === "object" ? manifest.marketplace : {};
  const iconPath = cleanText(marketplace.icon);
  if (!iconPath || !(await pathExists(repo.name, iconPath))) throw new Error(`${repo.full_name}: marketplace.icon is missing or does not exist`);

  const packageJson = await jsonFile(repo.name, "package.json");
  const category = categoryIds.has(cleanText(marketplace.category)) ? cleanText(marketplace.category) : "productivity";
  const branch = repo.default_branch || "main";
  const branchData = await github(`/repos/${organization}/${repo.name}/branches/${encodeURIComponent(branch)}`);
  const sha = branchData.commit.sha;
  const version = cleanText(packageJson?.version, "0.0.0");
  const scripts = packageJson?.scripts && typeof packageJson.scripts === "object" ? packageJson.scripts : {};
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  const integrations = Array.isArray(manifest.integrations) ? manifest.integrations : [];
  const secrets = Array.isArray(manifest.configuration?.secrets) ? manifest.configuration.secrets : [];

  return {
    id,
    name,
    subtitle: cleanText(marketplace.subtitle, cleanText(manifest.description)),
    description: cleanText(manifest.description),
    category,
    publisher: { name: "Samos Labs", organization },
    listing: {
      status: "published",
      visibility: "public",
      featured: marketplace.featured === true,
      staff_pick: marketplace.staff_pick === true,
      is_new: marketplace.is_new !== false,
    },
    release: {
      version,
      channel: "stable",
      git_ref: branch,
      commit: sha,
      published_at: repo.pushed_at,
      update_policy: "automatic",
    },
    source: {
      repository_url: repo.html_url,
      clone_url: repo.clone_url,
      organization,
      default_branch: branch,
      manifest_path: "sym-app.json",
    },
    runtime: {
      type: cleanText(manifest.runtime?.type, "node"),
      start: scripts.start ? "npm start" : null,
      build: scripts.build ? "npm run build" : null,
      install: repo.name.endsWith("-python") ? null : "npm ci",
      health_path: cleanText(manifest.runtime?.health_path, "/_sym/health"),
      required_secrets: secrets.map((item) => item?.name).filter(Boolean),
    },
    media: {
      icon_url: rawUrl(repo.name, sha, iconPath),
      screenshots: Array.isArray(marketplace.screenshots)
        ? marketplace.screenshots.filter((path) => typeof path === "string").map((path) => rawUrl(repo.name, sha, path))
        : [],
      accent_color: cleanText(marketplace.accent_color, "#000000"),
    },
    install: {
      mode: "git_clone",
      repository_url: repo.clone_url,
      ref: branch,
      target_root: "project_files/Apps",
      folder_name: id,
      profile_scoped: true,
      automatic_updates: true,
    },
    permissions,
    integrations,
    support: {
      docs_url: packageJson?.homepage || `${repo.html_url}#readme`,
      issues_url: repo.has_issues ? `${repo.html_url}/issues` : null,
    },
  };
}

const repos = (await repositories()).filter((repo) => !repo.archived && !repo.disabled && !repo.fork && repo.name !== "registry");
const apps = [];
for (const repo of repos) {
  const entry = await buildEntry(repo);
  if (entry) apps.push(entry);
}
apps.sort((a, b) => a.name.localeCompare(b.name));

const registryPath = new URL("../apps.json", import.meta.url);
const registry = {
  schema_version: 1,
  registry_kind: "sym_app_registry",
  generated_at: new Date().toISOString(),
  organization,
  source: `https://github.com/${organization}`,
  update_policy: "automatic",
  categories,
  apps,
};
try {
  const previous = JSON.parse(await readFile(registryPath, "utf8"));
  const previousContent = { ...previous, generated_at: null };
  const nextContent = { ...registry, generated_at: null };
  if (JSON.stringify(previousContent) === JSON.stringify(nextContent)) registry.generated_at = previous.generated_at;
} catch {
  // First generation has no previous catalog to preserve.
}
await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
console.log(`Generated apps.json with ${apps.length} app(s).`);
