#!/usr/bin/env node
/**
 * CRMdiscount.ai blog builder.
 *
 *   node tools/build-blog.mjs
 *
 * Reads:   blog/_src/*.md          one Markdown file per article
 *          blog/_template.html     the article shell
 * Writes:  blog/<slug>/index.html  one page per article
 *          blog/index.html         page 1 of the listing
 *          blog/page/N/index.html  pages 2..n
 *          blog/feed.xml           RSS
 *          sitemap.xml             every page on the site
 *
 * No dependencies, no build step on Vercel. Run it locally, commit the output.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ─────────────────────────────────────────────────────────────
// Settings — change SITE_URL here when the domain changes.
// ─────────────────────────────────────────────────────────────
const SITE_URL     = "https://try.crmdiscount.ai";
const PER_PAGE     = 6;
const BLOG_TITLE   = "HubSpot pricing, plainly explained";
const BLOG_INTRO   = "What HubSpot actually costs, what you can drop, and where buyers overpay. Written by a certified Solutions Partner who is paid to right-size the deal, not to grow it.";
const STATIC_PAGES = ["/", "/privacy.html"];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC  = join(ROOT, "blog", "_src");

const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 30'%3E%3Crect x='2' y='6' width='26' height='18' rx='4' fill='%2312172B'/%3E%3Ccircle cx='10' cy='15' r='3.4' fill='none' stroke='%234F46E5' stroke-width='2'/%3E%3Cpath d='M17 20 L23 10' stroke='%234F46E5' stroke-width='2' stroke-linecap='round'/%3E%3Ccircle cx='17.5' cy='11.5' r='1.6' fill='%234F46E5'/%3E%3Ccircle cx='22.5' cy='18.5' r='1.6' fill='%234F46E5'/%3E%3C/svg%3E";

const LOGO_SVG = `<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <rect x="2" y="6" width="26" height="18" rx="4" fill="#12172B"/>
        <circle cx="10" cy="15" r="3.4" fill="none" stroke="#4F46E5" stroke-width="2"/>
        <path d="M17 20 L23 10" stroke="#4F46E5" stroke-width="2" stroke-linecap="round"/>
        <circle cx="17.5" cy="11.5" r="1.6" fill="#4F46E5"/>
        <circle cx="22.5" cy="18.5" r="1.6" fill="#4F46E5"/>
      </svg>`;

/** The single source of truth for site navigation. */
const topbar = (current) => `<div class="topbar">
  <div class="wrap">
    <a class="logo" href="/">
      ${LOGO_SVG}
      CRM<em>discount</em>.ai
    </a>
    <nav class="nav" aria-label="Main">
      <a href="/"${current === "home" ? ' aria-current="page"' : ""}>Home</a>
      <a href="/blog/"${current === "blog" ? ' aria-current="page"' : ""}>Blog</a>
    </nav>
    <div class="partner-chip">Certified HubSpot Solutions Partner</div>
  </div>
</div>`;

const FOOTER = `<footer>
  <div class="wrap">
    <p class="legal">&copy; 2026 CRMdiscount.ai &mdash; a buyer-side HubSpot scoping service operated by a certified HubSpot Solutions Partner agency. We are not HubSpot, Inc., and we are not affiliated with, sponsored by or endorsed by HubSpot, Inc. HubSpot is a registered trademark of HubSpot, Inc. All figures shown are illustrative estimates based on publicly listed rates and do not constitute a quote, an offer, or a guarantee of savings. Only HubSpot, Inc. can price your subscription.</p>
    <div class="links"><a href="/">Home</a><a href="/blog/">Blog</a><a href="/privacy.html">Privacy Policy</a></div>
  </div>
</footer>`;

// ─────────────────────────────────────────────────────────────
// Tiny Markdown renderer (headings, lists, tables, quotes, images,
// links, bold/italic/code, raw HTML passthrough). Deliberately small:
// it covers what a GoDaddy blog post contains and nothing more.
// ─────────────────────────────────────────────────────────────
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");

function inline(t) {
  return t
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (_, alt, src, title) => `<img src="${escAttr(src)}" alt="${escAttr(alt)}"${title ? ` title="${escAttr(title)}"` : ""} loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, href) => {
      const ext = /^https?:\/\//.test(href) && !href.includes("crmdiscount.ai");
      return `<a href="${escAttr(href)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${txt}</a>`;
    })
    .replace(/`([^`]+)`/g, (_, c) => `<code>${esc(c)}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

function markdown(src) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;

  const row = (line, cell) =>
    "<tr>" + line.trim().replace(/^\||\|$/g, "").split("|")
      .map((c) => `<${cell}>${inline(c.trim())}</${cell}>`).join("") + "</tr>";

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // raw HTML block — passed through untouched
    if (/^\s*</.test(line)) {
      const buf = [];
      while (i < lines.length && lines[i].trim()) buf.push(lines[i++]);
      out.push(buf.join("\n"));
      continue;
    }
    // horizontal rule
    if (/^(---|\*\*\*|___)\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
    // heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    // "#" and "##" both become h2 — the page <h1> is the article title.
    if (h) { const lvl = Math.min(Math.max(h[1].length, 2), 4); out.push(`<h${lvl}>${inline(h[2].trim())}</h${lvl}>`); i++; continue; }
    // blockquote
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
      out.push(`<blockquote>${markdown(buf.join("\n"))}</blockquote>`);
      continue;
    }
    // table
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
      const head = row(lines[i], "th"); i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) body.push(row(lines[i++], "td"));
      out.push(`<table><thead>${head}</thead><tbody>${body.join("")}</tbody></table>`);
      continue;
    }
    // lists
    const bullet = /^\s*[-*+]\s+/, numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const re = ordered ? numbered : bullet;
      const items = [];
      while (i < lines.length && re.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(re, "").trim())}</li>`);
      out.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    // paragraph
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>\s?|\s*[-*+]\s|\s*\d+[.)]\s|\s*\||\s*<)/.test(lines[i])) buf.push(lines[i++]);
    out.push(`<p>${inline(buf.join(" ").trim())}</p>`);
  }
  return out.join("\n");
}

// ─────────────────────────────────────────────────────────────
// Front matter
// ─────────────────────────────────────────────────────────────
function parsePost(file) {
  const raw = readFileSync(join(SRC, file), "utf8").replace(/^\uFEFF/, "");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing --- front matter block at the top`);

  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (kv) meta[kv[1].trim()] = kv[2].trim().replace(/^["'](.*)["']$/, "$1");
  }
  const slug = meta.slug || file.replace(/\.md$/, "");
  for (const req of ["title", "description", "date"]) {
    if (!meta[req]) throw new Error(`${file}: front matter is missing "${req}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) throw new Error(`${file}: date must be YYYY-MM-DD`);

  const body = m[2].trim();
  const words = body.split(/\s+/).length;
  return {
    ...meta,
    slug,
    body,
    html: markdown(body),
    reading: Math.max(1, Math.round(words / 220)),
    url: `${SITE_URL}/blog/${slug}/`,
    path: `/blog/${slug}/`,
    iso: new Date(meta.date + "T09:00:00Z").toISOString(),
    human: new Date(meta.date + "T09:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

// ─────────────────────────────────────────────────────────────
// Page writers
// ─────────────────────────────────────────────────────────────
const write = (rel, html) => {
  const full = join(ROOT, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, html);
};

function card(p) {
  return `      <a class="post-card" href="${p.path}">
        <div class="meta">${p.human}</div>
        <div>
          <h2>${esc(p.title)}</h2>
          <p>${esc(p.description)}</p>
        </div>
      </a>`;
}

function listingPage(posts, page, totalPages) {
  const start = (page - 1) * PER_PAGE;
  const slice = posts.slice(start, start + PER_PAGE);
  const canonical = page === 1 ? `${SITE_URL}/blog/` : `${SITE_URL}/blog/page/${page}/`;
  const prev = page === 2 ? "/blog/" : page > 2 ? `/blog/page/${page - 1}/` : null;
  const next = page < totalPages ? `/blog/page/${page + 1}/` : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${page > 1 ? `Blog — page ${page}` : "Blog"} | CRMdiscount.ai</title>
<meta name="description" content="${escAttr(BLOG_INTRO)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${canonical}">
${prev ? `<link rel="prev" href="${SITE_URL}${prev}">\n` : ""}${next ? `<link rel="next" href="${SITE_URL}${next}">\n` : ""}<meta name="theme-color" content="#12172B">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="HubSpot pricing, plainly explained | CRMdiscount.ai">
<meta property="og:description" content="${escAttr(BLOG_INTRO)}">
<link rel="icon" type="image/svg+xml" href="${FAVICON}">
<link rel="alternate" type="application/rss+xml" title="CRMdiscount.ai blog" href="/blog/feed.xml">

<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-T832KNFG');</script>
<!-- End Google Tag Manager -->

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">
</head>
<body>
<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-T832KNFG"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->

${topbar("blog")}

<header class="blog-head">
  <div class="wrap">
    <h1>${esc(BLOG_TITLE)}</h1>
    <p>${esc(BLOG_INTRO)}</p>
  </div>
</header>

<main class="post-list">
  <div class="wrap">
${slice.length ? slice.map(card).join("\n") : `      <p class="empty">No articles published yet.</p>`}
  </div>
</main>

${totalPages > 1 ? `<div class="wrap">
  <nav class="pager" aria-label="Pagination">
    ${prev ? `<a href="${prev}" rel="prev">Newer articles</a>` : `<span></span>`}
    <span class="count">Page ${page} of ${totalPages}</span>
    ${next ? `<a href="${next}" rel="next">Older articles</a>` : `<span></span>`}
  </nav>
</div>` : ""}

${FOOTER}
</body>
</html>
`;
}

function postPage(p, others) {
  const tpl = readFileSync(join(ROOT, "blog", "_template.html"), "utf8");
  const jsonld = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title,
    description: p.description,
    datePublished: p.iso,
    dateModified: p.iso,
    mainEntityOfPage: p.url,
    author: { "@type": "Organization", name: "CRMdiscount.ai" },
    publisher: { "@type": "Organization", name: "CRMdiscount.ai" },
  });
  const more = others.length
    ? `    <section class="more">
      <p class="kicker">Keep reading</p>
${others.slice(0, 2).map(card).join("\n")}
    </section>`
    : "";

  return tpl
    .replaceAll("{{TITLE}}", escAttr(p.title))
    .replaceAll("{{DESCRIPTION}}", escAttr(p.description))
    .replaceAll("{{CANONICAL}}", p.url)
    .replaceAll("{{DATE_ISO}}", p.iso)
    .replaceAll("{{DATE_HUMAN}}", p.human)
    .replaceAll("{{READING}}", String(p.reading))
    .replaceAll("{{FAVICON}}", FAVICON)
    .replaceAll("{{JSONLD}}", jsonld)
    .replaceAll("{{TOPBAR}}", topbar("blog"))
    .replaceAll("{{FOOTER}}", FOOTER)
    .replaceAll("{{MORE}}", more)
    .replaceAll("{{BODY}}", p.html);
}

// ─────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────
const files = existsSync(SRC) ? readdirSync(SRC).filter((f) => f.endsWith(".md")) : [];
const posts = files.map(parsePost).sort((a, b) => b.date.localeCompare(a.date));
const totalPages = Math.max(1, Math.ceil(posts.length / PER_PAGE));

// clear generated post folders so deleted/renamed articles do not linger
for (const d of readdirSync(join(ROOT, "blog"), { withFileTypes: true })) {
  if (d.isDirectory() && !d.name.startsWith("_") && d.name !== "page" && d.name !== "assets") {
    if (!posts.some((p) => p.slug === d.name)) rmSync(join(ROOT, "blog", d.name), { recursive: true, force: true });
  }
}
if (existsSync(join(ROOT, "blog", "page"))) rmSync(join(ROOT, "blog", "page"), { recursive: true, force: true });

posts.forEach((p) => write(`blog/${p.slug}/index.html`, postPage(p, posts.filter((o) => o.slug !== p.slug))));
for (let n = 1; n <= totalPages; n++) {
  write(n === 1 ? "blog/index.html" : `blog/page/${n}/index.html`, listingPage(posts, n, totalPages));
}

write("blog/feed.xml", `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>CRMdiscount.ai blog</title>
<link>${SITE_URL}/blog/</link>
<description>${esc(BLOG_INTRO)}</description>
<language>en</language>
${posts.map((p) => `<item>
  <title>${esc(p.title)}</title>
  <link>${p.url}</link>
  <guid isPermaLink="true">${p.url}</guid>
  <pubDate>${new Date(p.iso).toUTCString()}</pubDate>
  <description>${esc(p.description)}</description>
</item>`).join("\n")}
</channel></rss>
`);

const urls = [
  ...STATIC_PAGES.map((u) => SITE_URL + u),
  `${SITE_URL}/blog/`,
  ...Array.from({ length: totalPages - 1 }, (_, k) => `${SITE_URL}/blog/page/${k + 2}/`),
  ...posts.map((p) => p.url),
];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>
`);

console.log(`Built ${posts.length} article(s) across ${totalPages} listing page(s).`);
posts.forEach((p) => console.log(`  ${p.path}  ${p.title}`));
