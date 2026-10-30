# Authentication

Docker deployments use `AUTH_MODE=local` or `AUTH_MODE=password`. Unknown or incomplete configurations fail closed. The implementation is in `apps/web/src/server/session.ts` and `packages/runtime/src/auth.ts`.

## Local sessions

Local mode accepts only loopback URLs (`localhost`, `127.0.0.1`, `[::1]`) and requires `LOCAL_MVP_ENABLED=true`. The default Compose port binding is loopback-only. The studio's session action creates a signed, HTTP-only, SameSite=Strict cookie lasting 24 hours. The signing secret is generated once in the persistent volume unless `LOCAL_SESSION_SECRET` or its `_FILE` setting is supplied.

This mode is for local use. Do not expose it publicly with a proxy that rewrites the host to a loopback address. Use password mode for hosted access.

## Hosted studio

Set:

```dotenv
AUTH_MODE=password
BASIC_AUTH_USER=studio
BASIC_AUTH_PASSWORD=replace-with-a-strong-password
APP_ORIGIN=https://cinema.example.com
```

Use HTTPS through a reverse proxy. The browser's standard HTTP authentication dialog asks for the username and password. All users of those credentials share one studio account. The owner ID derives from the username, so password rotation preserves work; changing the username selects a different account. This deployment does not provide individual accounts, SSO or an account-management UI.

Passwords can be mounted through `BASIC_AUTH_PASSWORD_FILE`. Missing credentials produce 401 with a login challenge; an empty configured password or unsupported mode produces 503 at the HTTP boundary. Password comparison uses fixed-length hashes and a timing-safe comparison. The application does not trust proxy-supplied identity headers.

Database queries still enforce owner scope. Writes and WebSocket upgrades also require the same Origin as the request, resolved from `APP_ORIGIN` when configured. Status sockets are read-only and close when their session expires.

The health endpoint is public. Signed media GET/HEAD requests bypass the password challenge only to reach the media route's signature verification. Invalid or expired signatures cannot read objects. Other media and all generation commands require authentication.

See [Docker deployment](deployment.md) for complete configuration and secret mounting.
