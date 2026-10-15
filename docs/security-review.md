# Public signup security review

Scope: magic-link authentication, API abuse, upload/file access, deployment configuration, and production dependency advisories. This is a code review with automated checks, not a penetration test or a guarantee against denial of service.

## Fixed locally; pending deployment

### [SEVERITY: High] — Uploaded photos were shared across authenticated users
- **Files**: `server/index.js`, `server/coverAccess.js`, `server/api.js`, `server/upload.js`.
- **Issue**: Authentication protected `/covers`, but file ownership was not checked. Knowing a photo URL was enough to request it from another account. Submitted photo references and scan tickets also needed ownership checks.
- **Risk**: Exposure or reuse of another reader's personal scans.
- **Fix**: Check saved photo ownership, scope pending upload tickets to the uploader, reject foreign references, and prevent client changes to book IDs. Shared catalog covers remain shareable.

### [SEVERITY: Medium] — Email throttling could be bypassed across IPs and restarts
- **Files**: `server/auth.js`, `server/db.js`, `server/rateLimit.js`.
- **Issue**: Unknown-address attempts were not counted, and the old IP-only limiter reset on restart or map overflow.
- **Risk**: Mailbox flooding and exhausted sending quotas.
- **Fix**: Bound IP request counters, persist per-recipient cooldowns and hourly limits in SQLite, impose global hourly/daily sending budgets, and require server-validated Turnstile tokens for public signup. Overflow fails closed. Production no longer prints usable login links when mail is unconfigured.

### [SEVERITY: Medium] — Expensive API routes lacked request limits
- **Files**: `server/index.js`, `server/api.js`, `server/upload.js`.
- **Issue**: Repeated catalog requests and uploads could consume third-party quotas and disk space.
- **Risk**: Reduced availability and excess network usage.
- **Fix**: API/IP, catalog/user and upload/user limits; upload concurrency ceiling; free-space check before accepting photos. These controls reduce abuse but do not eliminate distributed traffic or cumulative storage exhaustion.

### [SEVERITY: Low] — Canonical login URL and response hardening
- **Files**: `fly.toml`, `server/auth.js`, `server/index.js`, `src/lib/auth.js`.
- **Issue**: Links fell back to the request host; health responses exposed the DB path; malformed cookie escaping could throw; client auth failures assumed open mode.
- **Risk**: Misleading login destinations, information exposure, and unreliable authentication UI.
- **Fix**: Pin Fly's `APP_URL`, require an HTTPS origin for public signup, add no-referrer/no-store protection, handle malformed cookies, remove the health-path disclosure, fail closed in the client, and reject cross-site browser mutations.

## Remaining limitations

### [SEVERITY: Medium] — Application throttles do not cap Fly bandwidth bills
- **Files**: `fly.toml`, `server/rateLimit.js`.
- **Issue**: DNS-only Cloudflare records route visitors directly to Fly. Distributed clients and static asset traffic can still reach the origin; the API limiter is not a network firewall.
- **Risk**: Availability or bandwidth charges under sustained abusive traffic.
- **Fix**: For broader exposure, configure edge protection and origin access controls together; proxying the custom domain alone leaves the Fly hostname as an alternate route. Monitor actual billing. No hard spending guarantee is provided by these changes.

### [SEVERITY: Medium] — Public accounts share finite storage
- **Files**: `server/upload.js`, `server/api.js`, `server/db.js`.
- **Issue**: There is no cumulative storage quota per account. The upload reserve does not cover catalog downloads or arbitrary growth of book data.
- **Risk**: Valid accounts can eventually exhaust the 1 GB volume, affecting everyone.
- **Fix**: Add cumulative per-account storage/book quotas before scaling public registration, and monitor free space. Upload request limits alone are not a storage quota.

### [SEVERITY: Low] — Some throttles are process-local
- **File**: `server/rateLimit.js:1`.
- **Issue**: API/IP/upload counters reset on restart and are not shared across replicas. Email sending budgets are persistent.
- **Risk**: Limits weaken if the deployment grows beyond its current single machine.
- **Fix**: Use shared counters before adding replicas.

## Verification

- All 15 test files pass, including public email verification, foreign photo/ticket rejection, persistent email budgets, multipart upload limits, bounded API counters, email templates and account preferences.
- Production build passes; Vite retains its existing bundle-size warning.
- Browser checks cover English/Spanish login, bot-token gating, HTTP 429 feedback and fresh-token retry. Shelf checks cover desktop/mobile in both languages.
- `npm audit --omit=dev` reports no known production dependency vulnerabilities.
- `.env` is ignored and absent from the tracked Git history checked here. Provider-side key restrictions, real email delivery, live Turnstile validation and production load were not tested.

Finding counts (fixed items included):

| Severity | Count | Fixed locally | Remaining |
|----------|-------|---------------|-----------|
| Critical | 0 | 0 | 0 |
| High | 1 | 1 | 0 |
| Medium | 4 | 2 | 2 |
| Low | 2 | 1 | 1 |
| Info | 0 | 0 | 0 |

Overall residual risk for public registration: **Medium**. Public signup remains disabled pending provider setup and deployment.
