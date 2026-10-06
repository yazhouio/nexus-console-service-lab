# Changesets

Package versions and changelogs for the non-private `@feforgejs/*` packages in `packages/*` are
managed with [Changesets](https://changesets.dev). Private apps in `apps/*` are never versioned or published.

## Day to day

- Run `pnpm changeset` in any PR that changes the published behaviour of a package, pick the
  packages and the semver bump, and commit the generated `.changeset/*.md` file.
- The bump is a deliberate author decision. It is **not** derived from the Conventional Commit type
  (`feat`/`fix`) of the commits in the PR; commitlint only checks message shape.
- On `main`, `.github/workflows/release.yml` opens a `chore(release): version packages` PR. Merging it
  builds, runs `pnpm check:packages`, packs, and publishes the packed tarballs through npm trusted
  publishing (OIDC). No npm token is stored in GitHub.

## One-time bootstrap

npm only lets you attach a trusted publisher to a package that already exists, so the first release is manual.

1. **First publish, locally** (npm account with owner/admin rights on the `@feforgejs` org):

   ```bash
   npm login
   pnpm release
   git push --follow-tags
   ```

   `pnpm release` builds, validates exports, and runs `changeset publish` (via `pnpm publish`, which
   rewrites `workspace:` and `catalog:` specifiers). It prompts for a 2FA code.

2. **Register GitHub Actions as trusted publisher for every package, locally:**

   ```bash
   pnpm release:trust --dry-run
   pnpm release:trust
   ```

   For each package this runs `npm trust github <pkg> --file release.yml --repository
   yazhouio/nexus-console-service-lab --environment npm --allow-publish`, then
   `npm access set mfa=publish <pkg>` ("require 2FA and disallow tokens"). The trust commands run
   through a pinned `npm@11.19.1` via `npx`, because `--allow-publish` needs npm 11.15+ and the npm
   bundled with Node 24.14.1 is older. Every trust command asks for 2FA.

   Re-running is safe. A package is skipped only when an existing binding matches repository,
   workflow, environment **and** publish permission. A binding for the same repository and workflow
   with a missing/different environment or without publish permission is revoked and recreated,
   and the result is re-read to confirm it. Bindings for other repositories or workflows are left
   untouched and reported.

3. **From now on only GitHub Actions publishes.** Do not run `pnpm release` locally again.

When a **new package** is added to `packages/*`, repeat steps 1–2 for that package only; npm
cannot trust a name that has never been published.

The workflow file name `release.yml`, the job environment `npm`, and each package's
`repository.url` are part of the trust binding. Changing any of them requires re-running
`pnpm release:trust` (and revoking the old binding with `npm trust revoke`, since bindings for
another workflow file are reported but not removed).
