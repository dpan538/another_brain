# R28M1 Release Blockers

R28M1 does not clear release blockers.

Open blockers:

- Product model admission not done.
- Browser inference not admitted unless a later R28RT0-style runtime pass verifies real browser inference.
- Release checkpoint admission not done.
- Vercel preview not checked in this local branch.
- `phase_4=false`.

R28M1 only admits q4 static assets into the repository as same-origin engineering assets.
