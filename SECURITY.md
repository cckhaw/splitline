# Security policy

## Reporting a vulnerability

Please report security issues privately by email to the site operator (see the contact address in the
Privacy Policy at `/privacy`) rather than opening a public issue. Include steps to reproduce; you'll get an
acknowledgement within a few days.

## Optional hardening env vars

| Variable | Effect |
| --- | --- |
| `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Enables Cloudflare Turnstile on signup and login. |
| `ADMIN_TOTP_SECRET` | Base32 secret; when set, admin login also requires an authenticator code. |
| `ADMIN_ALLOWED_IPS` | Comma-separated IPs allowed to attempt admin login. |
| `AI_DAILY_CAP` | Global max AI generations per 24h (default 1000); an `[ALERT]` line is logged when hit. |

## Database migration

Re-run `schema.sql` after pulling changes (it is idempotent). It adds `users.session_version`, `rate_limits`
and `processed_stripe_events`. The app tolerates the migration being a few minutes late (rate limiting and
Stripe dedupe fail open; sessions treat everyone as version 0), but session revocation is only enforced once
the column exists.
