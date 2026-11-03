# Setting up the services (Neon, Resend, Slack)

Nothing here needs code changes. Put each value in the repo's secrets (never in chat or in a file).

## 1. Database: Neon (neon.com)
1. Create a project (free plan is enough for a pilot). Pick the region closest to your customers.
2. In the project, open **Connection details** and copy the connection string for the default owner role. That is `DATABASE_URL`. Keep it secret: it can read every customer's data.
3. Start the API once with `DATABASE_URL` set (plus a placeholder `DATABASE_APP_URL` and `TOKEN_KEY`). It applies `db/*.sql` and creates the `app_user` role.
4. In Neon's SQL editor run `ALTER ROLE app_user PASSWORD '<a long random password>';`. Build `DATABASE_APP_URL` from the same connection string with `app_user` and that password. The API uses this role for every customer write, so row-level security applies.
5. Generate `TOKEN_KEY` with `openssl rand -hex 32`. It encrypts Slack bot tokens. **Losing it means customers have to reconnect Slack**, so back it up.
6. Turn on Neon's point-in-time restore (history retention) before real customers arrive.

## 2. Sign-in emails: Resend (resend.com)
1. Create an account, add and verify your sending domain (DNS records).
2. Create an API key: `RESEND_API_KEY`. Set `EMAIL_FROM` to an address on that domain and `APP_URL` to the website address.

## 3. Slack app (api.slack.com/apps)
1. Create an app from scratch. Under **OAuth & Permissions** add the redirect URL `<API address>/api/slack/callback` and the bot scopes `app_mentions:read`, `chat:write`, `im:history`, `im:read`, `im:write`.
2. Under **Event Subscriptions** set the request URL to `<API address>/api/slack/events` and subscribe to bot events `app_mention` and `message.im`.
3. Under **App Home** turn on the Messages tab.
4. Copy **Client ID**, **Client Secret** and **Signing Secret** into `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`. Set `SLACK_REDIRECT_URI` to the redirect URL from step 1.

## Production checks
The API refuses to start in production (`NODE_ENV=production`) without `SESSION_SECRET`, `DATABASE_URL`, `DATABASE_APP_URL`, `TOKEN_KEY`, `RESEND_API_KEY`, `EMAIL_FROM` and `APP_URL`, and refuses if `ALLOW_DEV_AUTH=1`.
