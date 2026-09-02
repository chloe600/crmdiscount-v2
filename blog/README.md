# The blog — how it works and how to add a post

Static HTML, generated locally, committed to the repo. Vercel still has **no build step**:
it serves the files exactly as they are in `main`, same as the landing page.

## Layout

```
blog/
  _src/<slug>.md          ← YOU EDIT THESE. One Markdown file per article.
  _template.html          ← the shell every article is poured into
  blog.css                ← all blog styling (tokens copied from index.html)
  README.md               ← this file
  <slug>/index.html       ← GENERATED. Do not edit by hand.
  page/2/index.html       ← GENERATED. Listing pages 2, 3, …
  index.html              ← GENERATED. Listing page 1.
  feed.xml                ← GENERATED. RSS.
sitemap.xml               ← GENERATED. Every URL on the site.
tools/build-blog.mjs      ← the generator
```

Anything marked GENERATED is overwritten on every build. Edit the Markdown, not the HTML.

## Adding an article

1. Create `blog/_src/my-article-slug.md`. The file name becomes the URL:
   `/blog/my-article-slug/`.

2. Start it with a front matter block. All four fields are required except `source`:

```
---
title: What HubSpot's onboarding fee actually buys you
description: One or two sentences. Used as the meta description and the excerpt on the listing page.
date: 2026-08-28
source: https://old-blog-url-if-migrated
---
```

3. Write the body in Markdown below the closing `---`. Supported: `##` and `###`
   headings, `**bold**`, `*italic*`, links, images, bullet and numbered lists,
   `>` quotes, `|` tables, `---` rules, and raw HTML if you need it.

4. Images go in `blog/assets/` and are referenced as `/blog/assets/name.jpg`.

5. Build and push:

```powershell
Set-Location C:\Projects\crmdiscount-v2
node tools\build-blog.mjs
git add .
git commit -m "blog: add my-article-slug"
git push
```

Vercel redeploys in about a minute.

## Notes

- **Sort order is by `date`, newest first.** Six articles per listing page; change
  `PER_PAGE` at the top of `tools/build-blog.mjs`.
- **Deleting an article** means deleting its `.md` file and rebuilding. The build
  removes the orphaned folder for you.
- **When the domain changes**, edit `SITE_URL` at the top of `tools/build-blog.mjs`
  and rebuild — that fixes every canonical, the RSS feed and the sitemap in one go.
- **Navigation lives in one place**: the `topbar()` function in the build script,
  for blog pages, and the `.topbar` block in `index.html` for the landing page.
  Change both if you add a nav item.
- **No Node installed?** Copy an existing `<slug>/index.html`, edit the title, date
  and body by hand, and add a matching `<a class="post-card">` block to
  `blog/index.html`. It works, it is just easy to get wrong — installing Node is
  the better answer.
