# R28P1 Release Blockers

R28P1 is suitable for prelaunch demo review only. The following blockers remain open:

1. Real model assets are not admitted or committed.
2. Same-origin model shard loader has not been tested with real committed shards.
3. Product model admission is not done.
4. Browser admission is not done.
5. Release checkpoint admission is not done.
6. Vercel preview still must pass.
7. 100MB margin is tight: `1614407` bytes under the limit by the A12 full static estimate.
8. Final merge to `main` is pending.

These blockers are intentional. R28P1 should not clear them or convert the branch into product admission.
