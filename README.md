# veragentic.ai

The one-page site for Veragentic, which designs and builds secure AI agents for specific businesses.

It is plain static HTML, CSS and vanilla JS, with no framework, no build step and no dependencies. Deploys copy only the site files into `_site/` (see the command in `deploy.yml`), so this README and `scripts/` are not served by the site.

## Layout

```
index.html                    the page (markup, meta, JSON-LD; no inline JS/CSS, strict CSP)
404.html                      not-found page (noindex)
assets/css/site.css           all styles, shared by both pages
assets/js/config.js           THE edit point: MEASUREMENT_ID, FORM_ENDPOINT
assets/js/main.js             GA loader, CTA focus/tracking, form validation + submit
assets/fonts/                 Source Serif 4 (subset variable WOFF2) + OFL.txt licence
assets/img/og.svg, og.png     social preview image (source + render)
favicon.svg / favicon.ico / apple-touch-icon.png / icon-512.png
robots.txt, sitemap.xml, CNAME, .nojekyll
scripts/subset-font.sh        one-time: rebuilds the font subset
scripts/render-images.sh      one-time: re-renders PNGs/ICO from the SVGs (headless Chrome + Pillow)
scripts/check.sh              verification: URLs, screenshots, budget, contrast, form/GA test, Lighthouse
scripts/form-test.mjs         Chrome DevTools Protocol behaviour test (used by check.sh, no npm deps)
.github/workflows/deploy.yml  GitHub Pages deploy on push to main
```

The scripts are not a build step. Their outputs are committed and the site never runs them.

## Configure

Edit **`assets/js/config.js`**. It holds two strings and nothing else:

```js
MEASUREMENT_ID: "",   // "G-XXXXXXXXXX" turns on GA4; empty = no GA script, no requests, no cookies
FORM_ENDPOINT: "https://formsubmit.co/ajax/hello@veragentic.ai"   // empty = form opens a prefilled email instead
```

If you ever switch form provider, also add its host to `connect-src` and `form-action` in the CSP `<meta>` in **both** `index.html` and `404.html`.

## Form: email relay (FormSubmit)

The form posts to FormSubmit (formsubmit.co), which emails each inquiry to **hello@veragentic.ai**. No account, no server of our own.

1. **One-time activation:** the first inquiry sent from the live site triggers a "confirm your form" email to hello@veragentic.ai. Click the link once. Until then FormSubmit answers `success: "false"` and the page shows the "email us directly" fallback, so nothing is silently lost.
2. Each inquiry arrives with the subject "Inquiry from veragentic.ai" and the visitor's address as Reply-To, so you can just hit reply.
3. Optional: after activation, FormSubmit's email shows a random alias for the endpoint. Swap it into `FORM_ENDPOINT` (`https://formsubmit.co/ajax/<alias>`) if you'd rather not have the address in the page source (it's printed on the page anyway).

## Google Analytics 4

1. Create a GA4 property, add a **Web** data stream for `https://veragentic.ai`, and copy the `G-…` ID into `MEASUREMENT_ID`.
2. In GA, go to Admin → Events and mark **`generate_lead`** as a key event.

Events sent:
- `cta_click` with `{location: "hero"}`.
- `generate_lead` on a successful form submit. It carries no parameters, and no email or message text is ever sent to GA.
- `mailto_open` when `FORM_ENDPOINT` is empty and the form hands off to the visitor's email app. This is not a confirmed lead, so do not mark it as a key event.

Leave **Google Signals** off in GA. If you turn it on, add `https://*.g.doubleclick.net https://*.google.com` to `img-src` and `connect-src` in the CSP of both pages.

## Hosting: GitHub Pages

The repo is public and GitHub Pages serves it at https://veragentic.ai. `.github/workflows/deploy.yml` runs on every push to `main` and publishes **only the site files** (copied into `_site/`), so README and `scripts/` are not served.

- Pages settings: Source **GitHub Actions**, custom domain `veragentic.ai`, **Enforce HTTPS** on once the certificate is issued (usually 15 to 60 minutes after DNS resolves).
- Recommended: verify the domain under GitHub → Settings (your account) → Pages → **Add a verified domain**. This gives you the TXT record below and stops anyone else claiming veragentic.ai on GitHub.

### Squarespace DNS for GitHub Pages

Go to Squarespace → Domains → veragentic.ai → DNS → DNS Settings.

- Delete the **Squarespace Defaults** preset first, because its A and CNAME records would conflict.
- **Keep every existing MX, SPF, DKIM and DMARC record**, so that hello@veragentic.ai keeps receiving mail.

| Type  | Host | Value |
|-------|------|-------|
| A     | @    | 185.199.108.153 |
| A     | @    | 185.199.109.153 |
| A     | @    | 185.199.110.153 |
| A     | @    | 185.199.111.153 |
| AAAA  | @    | 2606:50c0:8000::153 |
| AAAA  | @    | 2606:50c0:8001::153 |
| AAAA  | @    | 2606:50c0:8002::153 |
| AAAA  | @    | 2606:50c0:8003::153 |
| CNAME | www  | tituslungu.github.io |
| TXT   | _github-pages-challenge-tituslungu | (value shown on GitHub's verify-domain screen) |

Check with `dig +short veragentic.ai A`, `dig +short www.veragentic.ai CNAME` and `curl -I https://veragentic.ai`.

## Deploy option B: Cloudflare Pages (free, works with private repos)

1. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → pick the repo. Set framework preset **None**, build command `mkdir _site && cp -r index.html 404.html assets favicon.svg favicon.ico apple-touch-icon.png icon-512.png robots.txt sitemap.xml _site/` and output directory `_site`. Every push to `main` then deploys.
2. Disable Pages on GitHub or delete `.github/workflows/deploy.yml`.
3. A custom **apex** domain on Cloudflare Pages requires Cloudflare DNS:
   1. Add the site `veragentic.ai` to Cloudflare (Free plan). Cloudflare imports the existing records; **confirm that MX, SPF and DKIM came across**.
   2. At Squarespace → Domains → veragentic.ai → DNS → Nameservers, choose **Use custom nameservers** and enter the two `*.ns.cloudflare.com` names Cloudflare assigns.
   3. Once the zone is active, go to the Pages project → Custom domains and add `veragentic.ai` and `www.veragentic.ai`.
   4. Add a redirect rule from www to the apex.
4. Optional: a `_headers` file can send the CSP and HSTS as real HTTP headers. Add it to the copy list in the build command.

## Local preview and checks

```sh
python3 -m http.server 8765        # then open http://localhost:8765
./scripts/check.sh                 # URLs, screenshots (.screenshots/), budget, contrast, form + GA behaviour
LIGHTHOUSE=1 ./scripts/check.sh    # also runs Lighthouse mobile + desktop via npx
```
