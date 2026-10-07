# Gmail OAuth (follow-ups / referrals send)

Queued referral follow-ups send from the **user's Gmail** via the Gmail API (`users.messages.send`), using Better Auth Google tokens (offline refresh).

## GCP setup

1. Same project as OAuth client (`production-510916` or yours) → **APIs & Services** → enable **Gmail API**.
2. **OAuth consent screen**:
   - Add scope: `https://www.googleapis.com/auth/gmail.send` (Send email on your behalf).
   - Keep app in **Testing** and add test users while unverified (sensitive scope).
3. **Credentials** → your Web OAuth client:
   - Authorized JavaScript origins: `http://localhost:3000`, `https://aavedak.vercel.app`
   - Redirect URIs:
     - `http://localhost:3000/api/auth/callback/google`
     - `https://aavedak.vercel.app/api/auth/callback/google`

## App env (no secrets in git)

| Key                                       | Purpose                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `GOOGLE_CLIENT_ID`                        | OAuth Web client ID                                                      |
| `GOOGLE_CLIENT_SECRET`                    | OAuth Web client secret                                                  |
| `BETTER_AUTH_SECRET`                      | ≥32 chars; encrypts stored tokens                                        |
| `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` | Canonical app URL                                                        |
| `CRON_SECRET`                             | Bearer for `/api/cron/process-follow-ups` (every 10 min) and jobs ingest |

Better Auth Google provider is configured with:

- `scope`: `gmail.send` (plus default openid/email/profile)
- `accessType`: `offline`
- `prompt`: `select_account consent` (so refresh tokens are issued)

## Re-consent (existing users)

Users who signed in **before** `gmail.send` was added must re-authorize:

1. In-app: Referrals / Follow-ups / Profile → **Authorize Gmail send** (calls `linkSocial` with `gmail.send`).
2. Or revoke Aavedak under [Google Account → Third-party access](https://myaccount.google.com/permissions), then sign in again and accept Gmail send.
3. Confirm `/api/gmail/status` returns `ready: true` (has refresh token + send scope).

## Runtime

- Queue: `POST /api/referrals/queue` (requires Gmail ready; ~10 min `send_after`).
- Process (user): `POST /api/referrals/process-queue`
- Process (cron): `GET/POST /api/cron/process-follow-ups` every 10 minutes (`vercel.json`)
- Statuses: `queued` → `sent` (Gmail message id stored) or `failed` (see `send_error`)

## Local smoke

```bash
# After authorizing Gmail in the UI:
curl -X POST http://localhost:3000/api/cron/process-follow-ups \
  -H "Authorization: Bearer $CRON_SECRET"
```

Do not print or commit OAuth client secrets, refresh tokens, or service-account keys.
