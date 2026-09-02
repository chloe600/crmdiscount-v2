/* ============================================================
   CRMdiscount — GoDaddy blog extractor
   ------------------------------------------------------------
   HOW TO RUN
   1. Open https://crmdiscount.godaddysites.com/blog-1?blog=y in Chrome.
   2. Press F12 → Console tab.
   3. Chrome may ask you to type "allow pasting" first. Do that.
   4. Paste this whole file, press Enter, wait.
   5. It downloads godaddy-blog-export.json. Upload that back to Claude.

   It only reads pages you can already see. Nothing is sent anywhere;
   the file is written by your own browser.
   ============================================================ */

(async () => {
  const ORIGIN = location.origin;
  const found = new Set();
  const log = (...a) => console.log("%c[extract]", "color:#4F46E5;font-weight:bold", ...a);

  const looksLikePost = (href) => {
    try {
      const u = new URL(href, ORIGIN);
      if (u.origin !== ORIGIN) return false;
      const p = u.pathname.toLowerCase();
      if (!/blog|post|article|news/.test(p)) return false;
      // skip the listing pages themselves
      if (/^\/(blog|blog-\d*|blog-1)\/?$/.test(p) && !u.searchParams.get("p")) return false;
      return true;
    } catch { return false; }
  };

  const harvest = (doc, base) => {
    let n = 0;
    doc.querySelectorAll("a[href]").forEach((a) => {
      const href = new URL(a.getAttribute("href"), base).href;
      if (looksLikePost(href) && !found.has(href)) { found.add(href); n++; }
    });
    return n;
  };

  const getDoc = async (url) => {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error(res.status + " " + url);
    const text = await res.text();
    return { doc: new DOMParser().parseFromString(text, "text/html"), html: text };
  };

  // ---- 1. sitemap first, it is the definitive list -------------
  try {
    const res = await fetch(ORIGIN + "/sitemap.xml");
    if (res.ok) {
      const xml = new DOMParser().parseFromString(await res.text(), "text/xml");
      const locs = [...xml.querySelectorAll("loc")].map((l) => l.textContent.trim());
      locs.filter(looksLikePost).forEach((u) => found.add(u));
      log(`sitemap.xml: ${locs.length} URLs, ${found.size} look like posts`);
    } else {
      log("no sitemap.xml (" + res.status + ")");
    }
  } catch { log("no sitemap.xml"); }

  // ---- 2. this page, then walk pagination ----------------------
  harvest(document, location.href);
  log(`after this page: ${found.size} candidates`);

  for (let page = 2; page <= 15; page++) {
    const before = found.size;
    let gained = 0;
    for (const pattern of [`?blog=y&page=${page}`, `?page=${page}`, `/page/${page}`]) {
      try {
        const { doc } = await getDoc(new URL(location.pathname + pattern, ORIGIN).href);
        gained += harvest(doc, ORIGIN);
      } catch { /* pattern not supported, try the next */ }
    }
    log(`listing page ${page}: +${found.size - before}`);
    if (!gained) break;
  }

  const urls = [...found].sort();
  if (!urls.length) {
    console.warn("No post URLs found. Copy the HTML of one post link and send it over so the selector can be adjusted.");
    return;
  }
  log(`fetching ${urls.length} posts…`);

  // ---- 3. fetch each post, keep the raw HTML -------------------
  const posts = [];
  for (const [i, url] of urls.entries()) {
    try {
      const { doc, html } = await getDoc(url);
      posts.push({
        url,
        title: (doc.querySelector("h1")?.textContent || doc.title || "").trim(),
        html,
      });
      log(`  ${i + 1}/${urls.length}  ${posts.at(-1).title || url}`);
    } catch (e) {
      console.warn("  failed:", url, e.message);
      posts.push({ url, title: "", html: "", error: String(e.message) });
    }
    await new Promise((r) => setTimeout(r, 250)); // be gentle
  }

  // ---- 4. download ---------------------------------------------
  const blob = new Blob([JSON.stringify({ source: ORIGIN, extracted: new Date().toISOString(), posts }, null, 2)],
    { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "godaddy-blog-export.json";
  document.body.appendChild(a); a.click(); a.remove();

  log(`done — ${posts.length} posts written to godaddy-blog-export.json`);
})();
