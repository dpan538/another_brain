# R28PR0 Preview Status

R28PR0 watches the final preview PR after the wrapper branch is pushed.

## Target

- Repository: `dpan538/another_brain`
- Base branch: `main`
- Head branch: `r28pr0-final-preview-pr`
- Preferred PR title: `R28PR0 final preview candidate`

## Watch Strategy

1. Prefer `gh pr view` and `gh pr checks` when the GitHub CLI is available and authenticated.
2. Fall back to GitHub REST API when `GITHUB_TOKEN` is available.
3. Record `unavailable` when neither path can read PR checks.
4. Poll pending checks for up to 10 minutes at 30 second intervals.
5. Extract Vercel preview URLs from check details URLs when available.
6. Record failing check name, conclusion, and details URL on failure.

## Status Values

- `passed`: checks exist and no pending or failing checks remain.
- `pending`: at least one check is queued, expected, or in progress.
- `failed`: at least one check failed, errored, timed out, was cancelled, or requires action.
- `unavailable`: PR checks could not be read with local credentials.

## Boundaries

The watcher never merges, closes, approves, or admits the PR. It only reports preview state and the available first failure metadata.
