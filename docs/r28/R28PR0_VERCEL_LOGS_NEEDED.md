# R28PR0 Vercel Logs Needed

If the Vercel preview fails and local automation cannot read the deployment log, copy these fields from Vercel Deployment Details:

1. Branch/SHA
2. Install command
3. Build command
4. Output directory
5. Root directory
6. Node version
7. First failing command
8. Exit code
9. Stack trace around first failure
10. Dashboard overrides
11. Environment variable errors

R28PR0 should report the failing GitHub check name, conclusion, and details URL when those are visible, but it must not guess the Vercel root cause without logs.
