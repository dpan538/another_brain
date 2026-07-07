# R28PR0 Release Blockers

R28PR0 is a final preview PR automation layer only. The following blockers remain:

- Product admission not done.
- Browser admission not done.
- Release checkpoint admission not done.
- Vercel preview is pending, failed, or unavailable until checks prove otherwise.
- Quality status remains `quality_not_ready` or `quality_weak` if reported by the selected source branch.
- `phase_4` is false.

These blockers must remain visible in the PR and final report. R28PR0 does not clear them.
