# R28PR1 Vercel Failure Log Request

If the final preview PR has a failing Vercel preview/deployment check, do not guess the root cause from the check name alone.

Copy these fields from Vercel Deployment Details:

1. Branch
2. Commit SHA
3. Build command
4. Install command
5. Output directory
6. Root directory
7. Node version
8. First failing command
9. Exit code
10. Stack trace around first failure
11. Dashboard build-command override
12. Dashboard output-directory override
13. Environment variable errors

Also copy the GitHub failing check name and details URL if visible.

R28PR1 should only diagnose from local reproduction, checked build configuration, or copied deployment logs. It must not infer a Vercel root cause without evidence.
