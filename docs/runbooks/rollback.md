# Rollback

<!-- nav -->

<sub><a href="../../README.md">Project README</a> · <a href="../README.md">Documentation index</a></sub>

> [!WARNING]
> Use this when a deploy has broken production. Restore service first, then fix the cause.

> [!NOTE]
> Application deploys run once `CLOUDFLARE_ENABLED` is `true` (see [DEPLOYMENT.md](../DEPLOYMENT.md)). For an immediate rollback, open the Worker in the Cloudflare dashboard → **Deployments** and roll back to the previous version.

1. Revert the bad change on `main` (`git revert <bad-commit-sha>`), open it as a pull request and merge once CI passes.
2. If a Firestore rules change caused the problem, the revert republishes the rules through **Deploy Firestore rules**.
3. The revert also redeploys the application; confirm `/healthz` returns `ok` and that staff can sign in.

Afterwards, record what happened and the fix in the pull request that resolves the root cause.
