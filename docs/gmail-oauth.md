# Gmail OAuth (follow-ups / referrals send)

Queued referral follow-ups send from the **user's Gmail** via the Gmail API (`users.messages.send`), using Better Auth Google tokens (offline refresh).

## GCP setup

1. Same project as OAuth client (`production-510916` or yours) → **APIs & Services** → enable **Gmail API**.
2. **OAuth consent screen** (Google Auth Platform → Audience / Data access):
   - Data access → add scope `https://www.googleapis.com/auth/gmail.send` (sensitive).
   - **Sign-in only requests `openid email profile`** (non-sensitive). `gmail.send` is asked later via
     **Authorize Gmail send** (`linkSocial`).
   - Audience: either
     - **Testing** → every user must be in **Test users** (else Google shows
       `Error 403: access_denied … has not completed the Google verification process`), or
     - **Publish app** (In production) → anyone can sign in with no verification (basic scopes).
       Authorize Gmail send then shows "Google hasn't verified this app" → Advanced → Continue
       (unverified sensitive-scope cap: 100 users; Aavedak caps at 8 anyway).
3. **Credentials** → your Web OAuth client:
   - Authorized JavaScript origins: `http://localhost:3000`, `https://aavedak.vercel.app`
   - Redirect URIs:
     - `http://localhost:3000/api/auth/callback/google`
     - `https://aavedak.vercel.app/api/auth/callback/google`

## Reply detection (gmail.readonly)

Optional second consent. Sending works without it. With it, Aavedak reads only the threads of mails
it sent (`users.threads.get`), stores replies in `mail_replies`, and shows them under the mail in
Outreach. Reads run from **Check replies** (per user) and the daily `/api/cron/sync-replies` cron.

- Scope: `https://www.googleapis.com/auth/gmail.readonly` (restricted). It shares the same unverified
  screen and 100-user cap as `gmail.send`; our 8-user limit fits.
- Requested by `ReplyDetectionBanner` (Outreach) via `linkSocial` with `GMAIL_READ_REAUTH_SCOPES`.
- Troubleshooting: "Gmail read permission missing" means the read scope was not granted; authorize
  reply detection again. Revoking the app in Google Account → Security removes both scopes.

## App env (no secrets in git)

| Key                                       | Purpose                                                           |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`                        | OAuth Web client ID                                               |
| `GOOGLE_CLIENT_SECRET`                    | OAuth Web client secret                                           |
| `BETTER_AUTH_SECRET`                      | ≥32 chars; encrypts stored tokens                                 |
| `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` | Canonical app URL                                                 |
| `CRON_SECRET`                             | Bearer for `/api/cron/process-follow-ups` (daily) and jobs ingest |

Better Auth Google provider is configured with:

- **Sign-in**: default `openid email profile` only, `prompt: select_account` — no sensitive
  scopes, no offline access, so any Google account can sign in once the app is **In production**.
- **Authorize Gmail send** (`GmailConnectBanner` on Referrals / Follow-ups / Profile settings):
  `authClient.linkSocial({ scopes: [gmail.send], additionalParams: { access_type: "offline", prompt: "consent" } })`.
  Better Auth merges the scope into `account.scope` and stores the refresh token.
- `include_granted_scopes=true` (Better Auth default) + sign-in never overwriting `scope` /
  missing refresh tokens means later sign-ins keep Gmail send working.

## Publish for any Google account

1. Google Auth Platform → **Branding**: app name, support email, logo (optional), app home page,
   privacy policy, terms, and authorized domains (see domain ownership below).
2. **Audience** → Publishing status → **Publish app** → confirm (In production).
3. Sign-in (basic scopes) works for everyone immediately — no verification needed.
4. Until `gmail.send` is verified, Authorize Gmail send shows "Google hasn't verified this app"
   (Advanced → Continue); 100-user lifetime cap for unverified sensitive scopes.
5. To remove that screen: **Verification Center** → submit for sensitive-scope / brand verification
   (justification + demo video of the Gmail send flow; homepage, privacy, terms must be live).

### Fix: “home page URL is not registered to you”

Google will **not** accept `*.vercel.app` as a domain you own for brand / sensitive-scope
verification. You need a **custom domain** you control (e.g. `aavedak.com` or `app.aavedak.com`).

1. Buy / own a domain and attach it to the Vercel project (**Settings → Domains**).
2. In [Google Search Console](https://search.google.com/search-console), add a **Domain** property
   for the root (e.g. `aavedak.com`) and verify via **DNS TXT** (same Google account that is
   Owner/Editor on the GCP project).
3. Wait until Search Console shows Verified (often minutes; Google says wait up to 24h before retry).
4. OAuth consent **Branding**:
   - Home page: `https://yourdomain.com/` (public, not login-only; describe the app)
   - Privacy: `https://yourdomain.com/privacy`
   - Terms: `https://yourdomain.com/terms`
   - Authorized domains: `yourdomain.com` (root only)
5. OAuth client: add origins/redirects for the custom domain
   (`https://yourdomain.com/api/auth/callback/google`).
6. Update `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` to the custom domain, redeploy, then retry
   verification.

## Troubleshooting

- `Error 403: access_denied` / "has not completed the Google verification process": consent screen is
  in Testing and that Google account is not a test user. Add it under Audience → Test users (or
  publish the app). This happens on Google's side; the app never receives the request.
- `redirect_uri_mismatch`: the Web client is missing the exact callback URI above.

## Re-consent (existing users)

Users who signed in **before** `gmail.send` was added must re-authorize:

1. In-app: Referrals / Follow-ups / Profile → **Authorize Gmail send** (calls `linkSocial` with `gmail.send`).
2. Or revoke Aavedak under [Google Account → Third-party access](https://myaccount.google.com/permissions), then sign in again and accept Gmail send.
3. Confirm `/api/gmail/status` returns `ready: true` (has refresh token + send scope).

## Runtime

- Queue: `POST /api/referrals/queue` (requires Gmail ready; ~10 min `send_after`).
- Process (user): `POST /api/referrals/process-queue`
- Process (cron): `GET/POST /api/cron/process-follow-ups` daily `0 7 * * *` (07:00 UTC ≈ 12:30 IST; Hobby once/day). In-app **Process due queue** anytime.
- Statuses: `queued` → `sent` (Gmail message id stored) or `failed` (see `send_error`)

## Local smoke

```bash
# After authorizing Gmail in the UI:
curl -X POST http://localhost:3000/api/cron/process-follow-ups \
  -H "Authorization: Bearer $CRON_SECRET"
```

Do not print or commit OAuth client secrets, refresh tokens, or service-account keys.
