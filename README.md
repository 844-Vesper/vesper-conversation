# Vesper — A Conversation

A private invitation page for `conversation.844vesper.org`, built with HTML, CSS, vanilla JavaScript and two small Cloudflare Pages API routes. No framework, application database, application dependencies or custom scheduling system. A private Durable Object helper reserves each invitation to its first browser for 30 days.

The only visitor input is the invitation code. Vesper does not request, log or save names, email addresses, phone numbers, residence information or booking details. Cal.com handles booking inside a modal, and is contacted only after the visitor selects **Choose a Time**. The font and logo are served locally.

**Upgrading the existing live site:** follow [SETUP-INVITE-LOCKS.md](SETUP-INVITE-LOCKS.md) before pushing this version. It adds a private storage helper, a Pages binding, and two secrets. Missing lock configuration fails closed for ordinary invitations.

## 1. Preview the design locally

Install Node.js 22 or later and Python 3 if they are not already installed. Open a terminal in this folder, then run:

```sh
node build.mjs
python3 -m http.server 8080 --bind 127.0.0.1 --directory dist
```

Open `http://localhost:8080`. Stop with Control-C. Run `node build.mjs` again after editing source files, then refresh.

This static preview shows the initial invitation page. It cannot validate invitations; trying Continue displays a subdued service-unavailable message. Use the next section to test the complete flow. Do not serve the repository root: it can contain your local secret file.

## 2. Test Cloudflare Pages Functions locally

If you do not already have `.dev.vars`, copy the example configuration. Keep your existing file if it is already configured:

```sh
cp .dev.vars.example .dev.vars
```

Open `.dev.vars` locally. Set these five values:

| Setting | Value |
| --- | --- |
| `INVITE_CODES` | A JSON array of your invitation codes, inside single quotes in this local file. Start with a newly generated test code. |
| `SESSION_SECRET` | A random secret of at least 32 characters. Generate one with `openssl rand -hex 32`. |
| `CALCOM_EVENT_URL` | Replace `CALCOM_EVENT_URL_HERE` with the full HTTPS Cal.com event URL. |
| `INVITE_LOCK_SECRET` | A separate stable random secret, generated with `openssl rand -hex 32`. |
| `ADMIN_INVITE_CODE` | Optional founders-only override, generated with `openssl rand -hex 16`. Keep it separate from the ordinary codes. |

Generate a code with `openssl rand -hex 12`. The array syntax is `["your-first-generated-code","your-second-generated-code"]`; these words are placeholders, not usable invitations. Do not include recipient names or other personal details in codes.

Start the local storage helper in one terminal:

```sh
npx wrangler dev --config workers/invite-locks/wrangler.jsonc --port 8787
```

In a second terminal in the repository root, run:

```sh
node build.mjs
npx wrangler pages dev dist --local-protocol=https --do INVITE_LOCKS=InviteLock@vesper-invite-locks
```

Wrangler downloads on first use. Open `https://localhost:8788` and accept the local development certificate warning. HTTPS is used so the secure session cookie behaves like production. `.dev.vars` is read by Wrangler, ignored by Git, and never copied to `dist`. Restart Wrangler after changing it. The generated `.wrangler` development folder is also ignored.

Run the automated security and packaging checks with:

```sh
node --test tests/*.test.mjs
```

Tests generate temporary credentials in memory; no actual invitation codes are committed.

See Cloudflare's [local development guide](https://developers.cloudflare.com/pages/functions/local-development/) for Wrangler details.

## 3. Configure Cal.com

Paste the final URL into **`CALCOM_EVENT_URL`**, locally in `.dev.vars` and in Cloudflare's encrypted production settings. This is deliberately server-side: the public HTML and JavaScript do not reveal your calendar link. Do not replace anything in `script.js`.

Use the full event URL, in the form `https://cal.com/your-account/your-event`, without a query string, fragment, credentials or custom host. Configure all availability, booking questions, confirmation email, rescheduling and cancellation in Cal.com. Leave analytics and tracking integrations disabled in Cal.com if you want the booking experience to remain free of them.

The page uses Cal.com's official embed inside a native, keyboard-accessible dialog. Escape or **Close** dismisses it. The [supported booking-success event](https://cal.com/help/embedding/embed-events) displays “Until then.”; the handler ignores its data. Use an ordinary free conversation event with automatic confirmation and no payment flow. If your event requires payment, approval or additional post-booking steps, remove the `bookingSuccessfulV2` listener in `script.js` to keep Cal.com's full confirmation screen instead.

If the embed fails or takes too long, a link to the same calendar in a new tab appears inside the dialog. With the URL unconfigured, visitors see a quiet unavailable message instead of a broken placeholder iframe. Real availability, email delivery and successful booking can only be verified after the final event is configured.

## 4. Configure Cloudflare secrets

In your **Pages project → Settings → Variables and Secrets**, add `INVITE_CODES`, `SESSION_SECRET`, `CALCOM_EVENT_URL`, `INVITE_LOCK_SECRET`, and `ADMIN_INVITE_CODE`. Select the encrypted **Secret** type. Choose **Production** for the real site.

For `INVITE_CODES`, enter the JSON array directly, **without** the outer single quotes used in `.dev.vars`. For `SESSION_SECRET`, paste the random secret generated above. Never put these values in GitHub, HTML, JavaScript, a build command, URL parameters or `wrangler` configuration. The `INVITE_LOCKS` Durable Object binding is required for ordinary invitations. Deploy and connect the private helper as described in [SETUP-INVITE-LOCKS.md](SETUP-INVITE-LOCKS.md). No D1 database or Workers KV namespace is needed.

Save the settings and create a new deployment so the new values take effect. Configure Preview separately with test codes and a test calendar, or leave it unconfigured so it fails closed. Disable automatic preview branch deployments if they are unnecessary.

Cloudflare documents [Pages environment variables and secrets](https://developers.cloudflare.com/pages/functions/bindings/#environment-variables) in its bindings guide.

## 5. Add or revoke invitations

Edit the encrypted `INVITE_CODES` array in Cloudflare, then redeploy the current commit. Add a new, long, randomly generated code for each invitation, or remove an existing code to revoke it. No source change or GitHub commit is needed.

Codes are case-insensitive and surrounding whitespace is ignored. Internal punctuation and spaces remain significant. An empty array `[]` rejects ordinary invitations; the separately configured admin override still works.

Sessions last two hours and do not renew on refresh. The signed HttpOnly, Secure, SameSite=Strict session cookie contains an expiry, random nonce, and keyed reservation fingerprints. A separate random browser credential cookie lasts 30 days and is required alongside an ordinary session. Neither contains an invitation code, IP address or booking details. Changing the normalized code list or `SESSION_SECRET` invalidates **all existing sessions** on the new deployment. Remaining recipients can enter their still-valid codes again.

The first browser using a code reserves it for 30 days. A different browser is rejected even if it has a copy of the two-hour session cookie alone. Clearing cookies or changing browsers requires a fresh code; changing IP addresses does not matter. Reuse by the first browser does not extend the reservation. `ADMIN_INVITE_CODE` bypasses reservations without modifying them. Keep `INVITE_LOCK_SECRET` stable: changing it resets all reservations.

Each incorrect attempt incurs a one-second delay. Five incorrect attempts in ten minutes trigger a sixty-second cooldown using a signed cookie. This is modest deterrence: deleting cookies or making parallel requests can bypass the per-browser cooldown. It does not collect IP addresses. Only the browser reservations use persistent storage. Use long random codes.

An authorized visitor can still share the Cal.com URL after receiving it. This gate stops casual access to scheduling from the Vesper link; it cannot make Cal.com's separate event URL private. Removing a code does not cancel any booking. `robots.txt` and noindex directives discourage indexing; they are not authentication.

Previously deployed Pages versions retain their old configuration. When revoking access, also delete obsolete preview deployments and avoid leaving old production URLs accessible with old codes; use Cloudflare's deployment controls. Rotating a secret on the current deployment does not rewrite historical deployments.

## 6. Deploy from a private GitHub repository

1. Create a **private** GitHub repository. Upload the source files, `functions/`, `server/`, `workers/`, `assets/`, `tests/`, and the dotfiles `.gitignore` and `.dev.vars.example`. Never upload `.dev.vars`, `.env`, `.wrangler/` or generated `dist/`. GitHub Desktop is a convenient way to publish this folder; review its file list before committing.
2. In Cloudflare, open **Workers & Pages**, create a **Pages** project, and connect the private GitHub repository. Authorize access only to the repository you need.
3. Select the production branch, usually `main`. Use these settings:

   | Build setting | Value |
   | --- | --- |
   | Framework preset | None |
   | Build command | `node build.mjs` |
   | Build output directory | `dist` |
   | Root directory | Leave blank (repository root) |

4. Deploy the private helper and add its binding following [SETUP-INVITE-LOCKS.md](SETUP-INVITE-LOCKS.md). Add the encrypted production settings from section 4, then deploy Pages. Before secrets are configured, the page is visible but the gate fails closed.
5. Test the generated HTTPS `pages.dev` address before attaching the domain. Do not enable Cloudflare Web Analytics. Keep any optional script injection, such as Rocket Loader, disabled for this site.

The build only copies the allowlisted public files to a clean `dist/`. The `functions/` directory stays at the repository root, where Pages compiles it as server code. `server/` is bundled into those functions, never deployed as static assets. Do not change the output directory to `.`. Use Git integration or Wrangler deployment, not a dashboard drag-and-drop of the static files, which would omit the functions.

Cloudflare's [Git integration guide](https://developers.cloudflare.com/pages/get-started/git-integration/) describes repository connection. This project has no npm install or framework build step; its build script only copies files.

## 7. Attach conversation.844vesper.org

In the Pages project, open **Custom domains → Set up a domain**, enter `conversation.844vesper.org`, and follow the prompts. Add the domain here **before** adding a standalone DNS record.

If `844vesper.org` already uses Cloudflare DNS, Cloudflare can create the record. If DNS is elsewhere, add a CNAME named `conversation` pointing to your project's `your-project.pages.dev` hostname as instructed. Do not change unrelated domain, mail or website records. Wait for the domain and HTTPS certificate to show as active, then test `https://conversation.844vesper.org`.

See the [Cloudflare custom-domain guide](https://developers.cloudflare.com/pages/configuration/custom-domains/) for DNS details.

## 8. Check the deployed invitation flow

- Open a private browser window. Only the logo, invitation copy, code form and footer should appear. No Cal.com script or iframe should load yet.
- Enter an incorrect code: confirm “That invitation code was not recognized.” After five failures, confirm the brief cooldown.
- Enter an approved code, also testing lowercase and leading/trailing spaces. Confirm the second-conversation state. Refresh: it should stay unlocked. JavaScript cannot read the HttpOnly session cookie.
- Enter the same test code in another browser: it should fail. Enter the admin code there: it should succeed without changing the test code’s reservation.
- Select **Choose a Time**. Confirm the Cal.com modal opens, uses dark styling, shows the correct event and offers the correct booking fields. Close with the button and Escape; keyboard focus should return to Choose a Time.
- Using a dedicated test code (not a recipient’s code), make an intentional test booking using your own details in Cal.com. Confirm “Until then.” and the confirmation email. Cancel the test booking in Cal.com afterward. Do not use real recipient data to test.
- Test on a narrow phone and desktop, at 200% zoom, with keyboard only, and with reduced motion enabled. Check focus visibility and scrolling through the modal's booking form.
- Remove the test code in Cloudflare and redeploy. Refresh the previously unlocked page: it should ask for a code again. The removed code should fail.
- Visit `/api/scheduling` without a session: it should return 401 without a calendar URL. The verification route returns only a `valid` boolean, never the code list. `/robots.txt` should disallow all crawlers.
- In browser developer tools, check for no failed asset loads or Content Security Policy errors. Check that the initial page makes no third-party requests, no application data appears in local/session storage, and no analytics or tracking has been enabled on either service.

## Files and maintenance

| File | Purpose |
| --- | --- |
| `index.html`, `tokens.css`, `styles.css`, `script.js` | Page, visual design, and invitation/modal interactions |
| `assets/vesper-mark.svg` | Transparent bone rendering of the supplied mark; original pixels embedded losslessly, with no external asset references |
| `assets/vesper-logo.png` | Preserved original, not copied into the deployment |
| `assets/cormorant-garamond.ttf` and license | Locally served Cormorant Garamond |
| `functions/api/verify-invite.js` | Code checks, session restoration and cooldown |
| `functions/api/scheduling.js` | Reveals the event URL only with a valid session |
| `server/invitation.js` | Shared signing, request validation and response helpers |
| `server/invite-locks.js` | Generates random browser credentials and communicates with reservation storage |
| `workers/invite-locks/` | Private Durable Object helper and deployment configuration |
| `SETUP-INVITE-LOCKS.md` | Activation, local testing and maintenance instructions for browser reservations |
| `_headers`, `_routes.json`, `robots.txt` | Security headers, API routing and indexing instructions |
| `build.mjs` | Copies only public assets to `dist/` |
| `.dev.vars.example`, `.gitignore` | Safe configuration template and exclusions |
| `tests/` | Built-in Node tests; no testing packages required |

See [DESIGN.md](DESIGN.md) for the independently maintained Vesper tokens, typography, and component conventions.

The site has no application logging or analytics. Cloudflare and Cal.com still handle their own infrastructure and service data; the Vesper source does not control their retention settings. Do not enable request-body logging for the invitation endpoint.
