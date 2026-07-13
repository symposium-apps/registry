# SYM App Registry

Public, generated catalog for apps published by the [`symposium-apps`](https://github.com/symposium-apps) organization.

The SYM-OS App Store reads [`apps.json`](./apps.json). Each listed app is derived from the repository's root `sym-app.json` plus package and GitHub metadata. There is no hand-maintained fake app inventory.

## App repository requirements

A publishable app repository must be public, active, and contain:

- `sym-app.json` at the repository root;
- a valid `id`, `name`, and `schema_version`;
- marketplace metadata including `subtitle`, `category`, and `icon`;
- the icon committed at the manifest path;
- package/runtime files required by its manifest.

## Generate locally

```bash
npm run generate
npm run check
```

`GITHUB_TOKEN` is optional for local generation and supplied automatically in GitHub Actions. Public unauthenticated generation is sufficient for a small catalog but is subject to GitHub's public API rate limit.

## Updates

The registry workflow regenerates the catalog automatically. Installed app updates are managed by SYM/sym-node; the App Store deliberately has no manual update controls.
