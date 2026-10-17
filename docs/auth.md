# Sign-in and public deployment

Open Cinema identifies each creator so their jobs, media and Elements stay separate. The web Worker chooses how with the `AUTH_MODE` variable in [`apps/web/wrangler.jsonc`](../apps/web/wrangler.jsonc). The implementation is [`apps/web/src/server/session.ts`](../apps/web/src/server/session.ts). Any unrecognised or incomplete configuration fails closed with `401`.

| `AUTH_MODE`         | Who it is for                   | Identity                                    |
| ------------------- | ------------------------------- | ------------------------------------------- |
| `local` (default)   | Development on your own machine | Random `local-…` owner in a signed cookie   |
| `cloudflare-access` | Any deployment on a public URL  | `access-<sub>` from a verified Access token |

The Settings page shows the active mode and whether it is ready.

## Local test sessions

Used by `bun run dev` and `bun run preview`. Requires all of:

- `LOCAL_MVP_ENABLED=true` and a `LOCAL_SESSION_SECRET` of at least 32 characters in `apps/web/.dev.vars`;
- a loopback request host (`127.0.0.1`, `localhost` or `[::1]`).

**Start local session** in Studio sets an HttpOnly, SameSite=Strict cookie for 24 hours. The browser never chooses its owner ID. Public hosts are always refused, even if the flag is set by mistake.

## Deploying behind Cloudflare Access

[Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/) puts a sign-in page (one-time email PIN, Google, GitHub or your SSO) in front of the Worker. Only people your policy allows can reach the studio, so you control who spends your Comfy credits. Access is free for up to 50 users.

1. In the Cloudflare dashboard open **Zero Trust → Access → Applications → Add an application → Self-hosted**.
2. Add the web Worker's hostname (a custom domain, or its `*.workers.dev` address). Protect the whole hostname.
3. Add an **Allow** policy, for example `Emails` → your address, or `Emails ending in` → your domain. Choose login methods under **Settings → Authentication** (One-time PIN works with no extra setup).
4. Copy the application's **Audience (AUD) tag** from its overview, and your team domain (`<team>.cloudflareaccess.com`) from **Settings → Custom Pages**.
5. Configure the web Worker for the environment you deploy:

   ```jsonc
   "vars": {
     "AUTH_MODE": "cloudflare-access",
     "CF_ACCESS_TEAM_DOMAIN": "<team>.cloudflareaccess.com",
     "CF_ACCESS_AUD": "<audience tag>"
   }
   ```

   Set `LOCAL_MVP_ENABLED` to `false` for that environment. Wrangler still lists `LOCAL_SESSION_SECRET` as a required secret; give it any random value, it is unused in this mode.

6. Deploy (see the README). Visiting the URL now shows the Access sign-in first.

On every request the Worker verifies the `Cf-Access-Jwt-Assertion` header (or the `CF_Authorization` cookie): RS256 signature against your team's published keys (cached for an hour and refetched once for an unknown key ID), issuer, audience, expiry and not-before. The owner is derived from the token's subject, so the same person keeps the same work across devices. Server functions still require a same-origin `Origin` header for state changes.

Why Access instead of in-app accounts: the studio is open source and meant to be self-hosted by one creator or a small team. Access gives real authentication, MFA and revocation without the app storing passwords, and it rejects unauthenticated traffic before it reaches the Worker. In-app accounts (for a multi-tenant hosted service) remain future work; they would add a third mode here without changing how the rest of the app reads the session.

## Not covered yet

- Per-creator spending limits. Everyone allowed by the Access policy shares the deployment's Comfy key and credits.
- Migrating work from a `local-…` identity to an Access identity.
