# R28PR0 Manual PR Steps

Use this only when both GitHub CLI authentication and `GITHUB_TOKEN` are unavailable.

## Manual URL

Open:

`https://github.com/dpan538/another_brain/compare/main...r28pr0-final-preview-pr?expand=1`

## Required PR Fields

- Base: `main`
- Head: `r28pr0-final-preview-pr`
- Title: `R28PR0 final preview candidate`
- Body: contents of `docs/r28/R28PR0_FINAL_PREVIEW_PR.md`

## Manual Required Rule

If this path is used, R28PR0 must report `manual_required`. It must not claim that the PR was created automatically.

## Do Not Do

- Do not merge the PR.
- Do not approve product admission.
- Do not approve browser admission.
- Do not approve release checkpoint admission.
- Do not approve phase 4.
