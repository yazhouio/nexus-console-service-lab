// Commit messages are validated for Conventional Commits shape only.
// They do not drive package versions: semver bumps come exclusively from .changeset/*.md.
export default {
  extends: ['@commitlint/config-conventional'],
};
