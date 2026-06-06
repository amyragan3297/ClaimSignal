import fs from "fs";
import path from "path";

let LOGO_BASE64 = "";
try {
  const logoPath = path.resolve("attached_assets/claimsignal_logo_transparent.png");
  const buf = fs.readFileSync(logoPath);
  LOGO_BASE64 = `data:image/png;base64,${buf.toString("base64")}`;
} catch {
  LOGO_BASE64 = "";
}

export function ssrShell({
  title,
  description,
  canonical,
  schemaJson,
  body,
  breadcrumbs,
}: {
  title: string;
  description: string;
  canonical: string;
  schemaJson?: object;
  body: string;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}): string {
  const schema = schemaJson
    ? `<script type="application/ld+json">${JSON.stringify(schemaJson)}</script>`
    : "";

  const breadcrumbHtml =
    breadcrumbs && breadcrumbs.length > 0
      ? `<nav class="breadcrumb" aria-label="Breadcrumb">
          <ol>
            <li><a href="/">ClaimSignal</a></li>
            ${breadcrumbs
              .map((b) =>
                b.href
                  ? `<li><a href="${b.href}">${b.label}</a></li>`
                  : `<li aria-current="page">${b.label}</li>`
              )
              .join("")}
          </ol>
        </nav>`
      : "";

  const logoImg = LOGO_BASE64
    ? `<img src="${LOGO_BASE64}" alt="ClaimSignal" style="height:36px;width:auto;object-fit:contain;" />`
    : `<span style="font-weight:700;font-size:1.1rem;letter-spacing:-.02em;">CLAIMSIGNAL</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escHtml(description)}" />
  <link rel="canonical" href="${escHtml(canonical)}" />
  <meta property="og:site_name" content="ClaimSignal" />
  <meta property="og:title" content="${escHtml(title)}" />
  <meta property="og:description" content="${escHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escHtml(canonical)}" />
  <meta property="og:image" content="https://claimsignal1.com/favicon.png" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:site" content="@ClaimSignal" />
  <meta name="twitter:title" content="${escHtml(title)}" />
  <meta name="twitter:description" content="${escHtml(description)}" />
  <meta name="twitter:image" content="https://claimsignal1.com/favicon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  ${schema}
  <style>${globalCss()}</style>
</head>
<body>
  ${siteHeader(logoImg)}
  <main class="main">
    ${breadcrumbHtml}
    ${body}
  </main>
  ${siteFooter()}
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function siteHeader(logoImg: string): string {
  return `<header class="site-header">
    <div class="header-inner">
      <a href="/" class="logo-link">${logoImg}</a>
      <nav class="header-nav">
        <a href="/learn">Intelligence Glossary</a>
        <a href="/carriers">Carrier Intelligence</a>
        <a href="/claims">Claim Patterns</a>
        <a href="/login" class="nav-cta">Log In</a>
      </nav>
    </div>
  </header>`;
}

function siteFooter(): string {
  return `<footer class="site-footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <span class="footer-logo-text">CLAIMSIGNAL&#8482;</span>
        <p class="footer-tagline">Operational intelligence for property insurance claims.</p>
      </div>
      <div class="footer-cols">
        <div class="footer-col">
          <p class="footer-col-title">Intelligence</p>
          <a href="/learn">Glossary</a>
          <a href="/carriers">Carrier Profiles</a>
          <a href="/claims">Claim Patterns</a>
        </div>
        <div class="footer-col">
          <p class="footer-col-title">Platform</p>
          <a href="/">Home</a>
          <a href="/login">Log In</a>
          <a href="/#platform">Platform Overview</a>
        </div>
      </div>
    </div>
    <div class="footer-legal">
      <span>© ${new Date().getFullYear()} ClaimSignal™. All rights reserved.</span>
      <span>All carrier information is educational and informational only. Not legal advice.</span>
    </div>
  </footer>`;
}

function globalCss(): string {
  return `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: hsl(222, 47%, 11%);
  --bg2: hsl(222, 40%, 14%);
  --bg3: hsl(222, 35%, 17%);
  --fg: hsl(222, 20%, 95%);
  --fg2: hsl(222, 20%, 70%);
  --primary: hsl(217, 91%, 55%);
  --primary-dim: hsl(217, 91%, 45%);
  --border: hsl(222, 25%, 20%);
  --border2: hsl(222, 25%, 24%);
  --radius: 8px;
  --font: 'Inter', -apple-system, sans-serif;
}
html { font-family: var(--font); background: var(--bg); color: var(--fg); line-height: 1.6; }
body { min-height: 100vh; }
a { color: var(--primary); text-decoration: none; }
a:hover { text-decoration: underline; }

/* Header */
.site-header { position: sticky; top: 0; z-index: 50; background: hsl(222,47%,11%,0.92); backdrop-filter: blur(8px); border-bottom: 1px solid var(--border); }
.header-inner { max-width: 1120px; margin: 0 auto; padding: 0 24px; height: 60px; display: flex; align-items: center; justify-content: space-between; }
.logo-link { display: flex; align-items: center; text-decoration: none; }
.header-nav { display: flex; align-items: center; gap: 28px; font-size: 14px; }
.header-nav a { color: var(--fg2); text-decoration: none; transition: color .15s; }
.header-nav a:hover { color: var(--fg); }
.header-nav .nav-cta { background: var(--primary); color: #fff; padding: 7px 16px; border-radius: var(--radius); font-weight: 600; }
.header-nav .nav-cta:hover { background: var(--primary-dim); text-decoration: none; }

/* Main */
.main { max-width: 1120px; margin: 0 auto; padding: 48px 24px 80px; }

/* Breadcrumb */
.breadcrumb { margin-bottom: 24px; }
.breadcrumb ol { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; font-size: 13px; color: var(--fg2); }
.breadcrumb li + li::before { content: '/'; margin-right: 6px; }
.breadcrumb a { color: var(--fg2); }
.breadcrumb a:hover { color: var(--fg); }

/* Footer */
.site-footer { border-top: 1px solid var(--border); background: var(--bg); margin-top: 80px; }
.footer-inner { max-width: 1120px; margin: 0 auto; padding: 48px 24px 32px; display: flex; flex-wrap: wrap; gap: 40px; justify-content: space-between; }
.footer-brand { max-width: 240px; }
.footer-logo-text { font-weight: 700; font-size: 14px; letter-spacing: .06em; color: var(--fg); }
.footer-tagline { font-size: 13px; color: var(--fg2); margin-top: 8px; line-height: 1.5; }
.footer-cols { display: flex; gap: 48px; flex-wrap: wrap; }
.footer-col { display: flex; flex-direction: column; gap: 10px; }
.footer-col-title { font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--fg2); }
.footer-col a { font-size: 14px; color: var(--fg2); }
.footer-col a:hover { color: var(--fg); }
.footer-legal { max-width: 1120px; margin: 0 auto; padding: 16px 24px; display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; border-top: 1px solid var(--border); font-size: 12px; color: var(--fg2); }

/* Cards */
.card { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }
.card-sm { padding: 16px; }

/* Badges */
.badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 9999px; font-size: 12px; font-weight: 500; }
.badge-blue { background: hsl(217,91%,20%); color: hsl(217,91%,70%); }
.badge-amber { background: hsl(38,95%,15%); color: hsl(38,95%,65%); }
.badge-muted { background: var(--bg3); color: var(--fg2); border: 1px solid var(--border); }
.badge-green { background: hsl(142,72%,13%); color: hsl(142,72%,55%); }

/* Hero */
.hero { margin-bottom: 56px; }
.hero h1 { font-size: clamp(1.75rem, 4vw, 2.5rem); font-weight: 700; line-height: 1.2; margin-bottom: 16px; }
.hero p { font-size: 1.0625rem; color: var(--fg2); max-width: 620px; line-height: 1.7; }

/* Grid */
.grid-2 { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
.grid-3 { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }

/* Section */
.section { margin-bottom: 56px; }
.section-title { font-size: 1.125rem; font-weight: 700; margin-bottom: 6px; }
.section-sub { font-size: 14px; color: var(--fg2); margin-bottom: 24px; }

/* Intelligence module */
.intel-module { background: var(--bg3); border: 1px dashed var(--border2); border-radius: var(--radius); padding: 20px; display: flex; align-items: center; gap: 14px; }
.intel-module-icon { width: 36px; height: 36px; border-radius: 8px; background: var(--primary); opacity: .15; flex-shrink: 0; }
.intel-module-label { font-size: 13px; font-weight: 600; color: var(--fg2); }
.intel-module-note { font-size: 12px; color: var(--fg2); opacity: .7; margin-top: 3px; }
.intel-module.real { background: var(--bg2); border-style: solid; border-color: var(--border); }
.intel-module-value { font-size: 1.75rem; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--fg); min-width: 64px; text-align: right; }
.intel-module-meta { flex: 1; }
.intel-good { color: hsl(142,72%,55%) !important; }
.intel-bad { color: hsl(0,72%,55%) !important; }
.intel-warning { color: hsl(38,95%,65%) !important; }
.intel-neutral { color: var(--fg2) !important; }

/* Table */
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th { text-align: left; padding: 10px 14px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--fg2); border-bottom: 1px solid var(--border); }
td { padding: 12px 14px; border-bottom: 1px solid var(--border); color: var(--fg); }
tr:last-child td { border-bottom: none; }

/* Disclaimer */
.disclaimer { background: hsl(38,95%,10%); border: 1px solid hsl(38,95%,20%); border-radius: var(--radius); padding: 14px 18px; font-size: 13px; color: hsl(38,95%,70%); margin-bottom: 32px; }

/* CTA block */
.cta-block { background: linear-gradient(135deg, hsl(217,91%,15%) 0%, hsl(222,40%,16%) 100%); border: 1px solid hsl(217,91%,25%); border-radius: var(--radius); padding: 40px; text-align: center; margin-top: 56px; }
.cta-block h2 { font-size: 1.5rem; font-weight: 700; margin-bottom: 10px; }
.cta-block p { color: var(--fg2); margin-bottom: 24px; font-size: 15px; }
.btn { display: inline-flex; align-items: center; gap: 8px; padding: 11px 24px; border-radius: var(--radius); font-weight: 600; font-size: 14px; cursor: pointer; text-decoration: none; transition: background .15s; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover { background: var(--primary-dim); text-decoration: none; }
.btn-outline { background: transparent; color: var(--fg); border: 1px solid var(--border2); margin-left: 12px; }
.btn-outline:hover { background: var(--bg3); text-decoration: none; }

@media (max-width: 640px) {
  .header-nav a:not(.nav-cta) { display: none; }
  .main { padding: 32px 16px 60px; }
  .footer-inner { flex-direction: column; }
}
`;
}
