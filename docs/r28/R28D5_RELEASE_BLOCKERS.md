# R28D5 Release Blockers

RT1 real q4 token-id forward smoke passed, so the remaining release blockers are:

- product admission not done
- browser admission not done
- release checkpoint admission not done
- Vercel preview not checked
- manual QA required
- tokenizer text decode is not available in the committed runtime tokenizer metadata
- phase_4 is false

These blockers are intentional for D5. D5 creates a final prelaunch PR candidate, not a release admission.
