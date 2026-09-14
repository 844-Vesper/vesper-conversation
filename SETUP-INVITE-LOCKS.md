# Enable invitations reserved to one browser

The first successful use reserves an invitation for that browser for **30 days**. The same browser can enter it again; another browser receives the existing unrecognized-code message. The two-hour sign-in session still works as before. After 30 days, the code can be reserved again if it remains in `INVITE_CODES`.

The restriction uses a random, secure HttpOnly cookie, not IP addresses, names, email addresses, hardware fingerprinting or localStorage. A copied code alone is insufficient after first use. People can still deliberately share both cookies or the Cal.com link: this is practical sharing deterrence, not verified identity or a limit on the number of bookings. Cal.com remains responsible for bookings.

Switching Wi-Fi or using mobile data is fine. Switching browsers, using another device, closing a private-browsing session or clearing cookies loses the browser credential. Give that person a **new invitation code**. Do not test a recipient's real code first: your test browser would reserve it. Use dedicated test codes.

`ADMIN_INVITE_CODE` is a separate secret entered in the same invitation field. It gives founders access from any browser, without claiming or changing ordinary invitations. It does not unlock another person's code. Do not give this shared founder credential to recipients. Admin sessions also last two hours. Leaving this setting blank disables the override.

## Why a private helper Worker is necessary

A cookie alone cannot stop another browser entering the same code. Cloudflare needs a shared record of which browser first claimed each invitation. This implementation uses a small **Durable Object** per invitation to serialize claims, including simultaneous attempts in different regions. There is no application database to manage and no new npm dependency.

Cloudflare requires Durable Objects used by Pages to be hosted in a separate Worker. Your website **stays on Pages**, at its existing address. The new `vesper-invite-locks` Worker is only a private storage helper: it has no public URL or website, needs no secrets itself, and is unrelated to the earlier accidental Workers deployment. [Cloudflare Pages Durable Object bindings](https://developers.cloudflare.com/pages/functions/bindings/#durable-objects)

Only a keyed invitation fingerprint, a keyed random-browser fingerprint, and an expiry are stored. The record expires 30 days after first use; revisits do not extend it. A Cloudflare alarm removes expired records. Cloudflare manages the underlying storage and backups; this is not a promise of immediate deletion from infrastructure backups.

## Activate on your existing site

Do these steps **before pushing the updated Pages code**, so ordinary invitations do not encounter a missing storage binding.

1. **Prepare two additional secrets.** In `.dev.vars`, set `INVITE_LOCK_SECRET` to a separate random value of at least 32 characters, and `ADMIN_INVITE_CODE` to a separate random code of 16–128 characters. Neither belongs in `INVITE_CODES`. Generate values with `openssl rand -hex 32`. If these were generated for you already, use the existing values. Keep `.dev.vars` private and leave `.dev.vars.example` blank.

2. **Deploy the private helper from your computer.** Open VS Code's terminal in the repository root and run:

   ```sh
   npx wrangler login
   npx wrangler deploy --config workers/invite-locks/wrangler.jsonc
   ```

   The first command opens Cloudflare sign-in in your browser. Authorize it, then run the second command. This publishes only the helper; it does not replace Pages or publish `.dev.vars`. Run these commands in your own interactive terminal, **not in the Cloudflare Pages build command**. Use the same Cloudflare account as the Pages project.

3. **Connect Pages to the helper.** Open your existing Pages project, choose the Production environment, and go to **Settings → Bindings → Add → Durable Object**. Use variable name **`INVITE_LOCKS`** and select the **`InviteLock`** namespace belonging to **`vesper-invite-locks`**. Save.

4. **Add the two secrets to Pages.** Under **Settings → Variables and Secrets**, select Production and add encrypted secrets named **`INVITE_LOCK_SECRET`** and **`ADMIN_INVITE_CODE`**, using your private local values. Paste each value without quotes. Keep the existing `INVITE_CODES`, `SESSION_SECRET`, and `CALCOM_EVENT_URL` settings.

5. **Commit and push the updated source.** Include `workers/invite-locks/`, `server/invite-locks.js`, the changed API files, tests and documentation. `.dev.vars` must remain excluded. The GitHub push triggers a Pages deployment with the new binding and settings. Keep the Pages build command **`node build.mjs`** and output directory **`dist`**.

6. **Verify the deployed behavior** using the steps below before sending invitations.

If Preview deployments are enabled, either leave them without credentials (they fail closed), or use a separate test helper Worker/namespace and test secrets. Do not let preview testing reserve production codes. Custom domains and `pages.dev` have separate cookies; recipients should consistently use `https://conversation.844vesper.org`.

## Local preview

Use two terminals, both starting in the repository root. This uses local test storage; it does not touch production locks.

Terminal 1:

```sh
npx wrangler dev --config workers/invite-locks/wrangler.jsonc --port 8787
```

Terminal 2:

```sh
node build.mjs
npx wrangler pages dev dist --local-protocol=https --do INVITE_LOCKS=InviteLock@vesper-invite-locks
```

Open `https://localhost:8788`. If Wrangler selects a different available port, use the one it prints. Keep both terminals running. Restart the Pages preview after changing `.dev.vars`. [Cloudflare local Durable Object binding instructions](https://developers.cloudflare.com/pages/functions/bindings/#interact-with-your-durable-object-namespaces-locally)

## Test before sending invitations

1. Put a dedicated, randomly generated test code in the approved list. Redeploy if testing production.
2. In a normal browser window, enter it. Confirm scheduling opens and a refresh stays signed in.
3. In a different browser or private window, enter that same code. It must fail.
4. Return to the original browser. The code must still work. Changing networks should not matter.
5. In the second browser, enter the admin code. It must work. The original invitation should still be blocked in any other fresh browser afterward.
6. Remove the test code when finished. Use fresh, unclaimed codes for recipients.

Run automated checks with `node --test tests/*.test.mjs`. These cover the 30-day boundary, no expiry extension on reuse, simultaneous claims, cookie copying, missing storage, admin override, and cleanup alarms without waiting a month.

## Maintenance

- **New recipient:** generate a fresh random code, add it to the encrypted `INVITE_CODES` list, and deploy. No lock is created until successful use.
- **Lost browser access:** issue a fresh code and revoke the old one. Do not share the admin override as a recovery method.
- **Revoke a code:** remove it from `INVITE_CODES` and redeploy. Its stored reservation can expire normally; re-adding the same code within 30 days restores its original browser restriction.
- **Rotate founder access:** change `ADMIN_INVITE_CODE` and redeploy. Set it to an empty value or remove it to disable the override.
- **Keep `INVITE_LOCK_SECRET` stable.** Changing it resets the mapping for all reservations. Normal invitation-list changes and `SESSION_SECRET` rotation do not reset reservations.
- Changing the invitation list, admin code or `SESSION_SECRET` invalidates current two-hour sessions. Returning recipients can re-enter valid codes in their reserved browser. Installing this upgrade also expires the earlier, unrestricted sessions.
- A missing/broken binding or lock secret causes ordinary validation to fail closed with the existing temporary-unavailable message. The admin override can still work without the lock helper, provided the main invitation configuration is valid.
- Old Pages deployments retain their old code and settings. Retire obsolete deployment URLs that still run the unrestricted gate. This upgrade does not rewrite historical deployments or invalidate a Cal.com URL already learned by a visitor.
- Keep the helper Worker; deleting it or its namespace discards reservations. Its configuration disables public routes and observability. The application never logs invitation values, browser credentials, IP addresses or booking data.
