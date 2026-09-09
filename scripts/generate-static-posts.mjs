#!/usr/bin/env node
/**
 * 정적 블로그 페이지 생성 스크립트 (SSG)
 * -----------------------------------------------------------
 * 1. Supabase에서 posts 테이블을 읽어온다 (환경변수 우선, 없으면
 *    js/supabase-config.js에 적힌 값 사용, 그마저 실패하면
 *    js/default-posts.js 기본 글로 폴백).
 * 2. 글마다 /posts/{slug}.html 정적 페이지를 생성한다.
 *    -> 검색엔진/카카오톡·페이스북 공유 미리보기가 JS 없이도
 *       제목/설명/이미지/본문/JSON-LD를 그대로 읽을 수 있다.
 * 3. index.html의 <!-- SSR:POSTS:START --> ~ <!-- SSR:POSTS:END -->
 *    사이를 최신 글 목록 정적 마크업으로 교체한다.
 * 4. sitemap.xml을 홈 + 전체 글 URL로 재생성한다.
 *
 * 실행:
 *   node scripts/generate-static-posts.mjs
 *
 * 배포 자동화 예시 (GitHub Actions):
 *   - Supabase에 글이 추가/수정될 때마다, 혹은 매시간 cron으로
 *     이 스크립트를 실행 후 변경분을 커밋/푸시하면
 *     GitHub Pages가 최신 정적 페이지로 자동 배포된다.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE_ORIGIN = "https://xn--c79a54j61g9zg5zbf5l.kr";

/* ==================== 1. 설정값 읽기 ==================== */

async function readSupabaseConfigFromJs() {
  const jsPath = path.join(ROOT, "js", "supabase-config.js");
  const text = await fs.readFile(jsPath, "utf-8");
  const url = text.match(/SUPABASE_URL\s*=\s*"([^"]+)"/)?.[1];
  const key = text.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/)?.[1];
  return { url, key };
}

async function getSupabaseCreds() {
  const fromEnv = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
  };
  if (fromEnv.url && fromEnv.key) return fromEnv;
  return readSupabaseConfigFromJs();
}

/* ==================== 2. 글 목록 가져오기 ==================== */

async function fetchPostsFromSupabase() {
  const { url, key } = await getSupabaseCreds();
  if (!url || !key) throw new Error("Supabase URL/KEY를 찾을 수 없습니다.");

  const endpoint =
    `${url}/rest/v1/posts?select=id,title,date,author,summary,cover_image,content,created_at,updated_at` +
    `&order=date.desc,created_at.desc`;

  const res = await fetch(endpoint, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    throw new Error(`Supabase 요청 실패 (${res.status}): ${await res.text()}`);
  }
  const rows = await res.json();
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    date: r.date,
    author: r.author,
    summary: r.summary,
    coverImage: r.cover_image,
    content: r.content,
    updatedAt: r.updated_at,
  }));
}

async function fetchPostsFromDefaultFile() {
  const jsPath = path.join(ROOT, "js", "default-posts.js");
  const text = await fs.readFile(jsPath, "utf-8");
  // 브라우저 전역 스코프에 의존하지 않고 안전하게 배열만 추출/평가
  const match = text.match(/const\s+DEFAULT_POSTS\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) return [];
  // eslint-disable-next-line no-new-func
  const arr = new Function(`return ${match[1]};`)();
  return arr;
}

async function getAllPosts() {
  try {
    const posts = await fetchPostsFromSupabase();
    console.log(`Supabase에서 글 ${posts.length}건을 불러왔습니다.`);
    return posts;
  } catch (err) {
    console.warn(`⚠️ Supabase 연동 실패, 기본 글로 폴백합니다: ${err.message}`);
    const posts = await fetchPostsFromDefaultFile();
    console.log(`기본 글 ${posts.length}건을 사용합니다.`);
    return posts;
  }
}

/* ==================== 3. 유틸 (app.js와 동일한 로직) ==================== */

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// 제목 전체를 파일명에 넣으면(특히 한글) 경로가 너무 길어져
// 윈도우 압축 해제·체크아웃 오류(MAX_PATH 260자)가 날 수 있어
// 슬러그의 제목 부분은 최대 이 길이로 자른다. 고유성은 shortId가 보장한다.
const SLUG_TITLE_MAX_LENGTH = 50;

function getShortId(post) {
  return String(post.id || "").replace(/-/g, "").slice(0, 8) || "0000";
}

// 단어(하이픈) 경계에서 잘라 슬러그가 어색하게 끊기지 않게 한다.
function truncateSlugBase(base, maxLen) {
  if (base.length <= maxLen) return base;
  const cut = base.slice(0, maxLen);
  const lastHyphen = cut.lastIndexOf("-");
  return (lastHyphen >= 10 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/g, "");
}

// 현재(짧은) 슬러그 - 실제로 사용되는 URL/파일명
function getPostSlug(post) {
  const base = truncateSlugBase(slugify(post.title) || "post", SLUG_TITLE_MAX_LENGTH);
  return `${base}-${getShortId(post)}`;
}

// 과거(제목 전체) 슬러그 - 이미 검색엔진에 색인됐을 수 있는 예전 URL.
// 이 경로에는 새 URL로 안내하는 리다이렉트 스텁을 생성해 404를 방지한다.
function getLegacyPostSlug(post) {
  const base = slugify(post.title) || "post";
  return `${base}-${getShortId(post)}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  }[c]));
}

function toPlainText(html) {
  return String(html || "").replace(/<[^>]*>?/gm, "").replace(/\s+/g, " ").trim();
}

function ensureHtmlParagraphs(content) {
  const c = String(content || "");
  if (c.includes("<p>") || c.includes("<div>") || c.includes("<h2>")) return c;
  return c.split("\n\n").map(p => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
}

/* ==================== 4. 정적 글 페이지 생성 ==================== */

// 제목에서 의미 있는 키워드 토큰 추출 (조사/기호 등 제거 후 2글자 이상만 사용)
const TITLE_STOPWORDS = new Set([
  "부천코엔이비인후과", "부천코엔이비인후과의원", "이비인후과", "안내", "가이드",
  "및", "수", "것", "위한", "때", "왜", "그리고", "부천",
]);

function extractTitleTokens(title) {
  return String(title || "")
    .replace(/[\[\]!?·,./|:()"'“”]/g, " ")
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !TITLE_STOPWORDS.has(t));
}

// 현재 글과 가장 관련 있는 다른 글 N개를 골라 반환 (제목 키워드 겹침 우선, 동점이면 최신순)
function getRelatedPosts(post, allPosts, count = 3) {
  const currentTokens = new Set(extractTitleTokens(post.title));
  const currentSlug = getPostSlug(post);

  const scored = allPosts
    .filter(p => getPostSlug(p) !== currentSlug)
    .map(p => {
      const tokens = extractTitleTokens(p.title);
      const overlap = tokens.filter(t => currentTokens.has(t)).length;
      return { post: p, overlap };
    });

  scored.sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap;
    return String(b.post.date || "").localeCompare(String(a.post.date || ""));
  });

  return scored.slice(0, count).map(s => s.post);
}

function renderRelatedPostsBlock(post, allPosts) {
  const related = getRelatedPosts(post, allPosts, 3);
  if (related.length === 0) return "";

  const items = related
    .map(p => {
      const href = `${encodeURIComponent(getPostSlug(p))}.html`;
      const title = escapeHtml(p.title);
      const date = escapeHtml(p.date || "");
      return `<li><a href="${href}" class="block p-3 rounded-lg border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition"><span class="block text-sm font-semibold text-slate-800 leading-snug">${title}</span><time datetime="${date}" class="block mt-1 text-[11px] text-slate-400">${date}</time></a></li>`;
    })
    .join("\n          ");

  return `<nav aria-label="관련 글" class="mt-10 pt-6 border-t border-slate-200">
        <h2 class="text-sm font-bold text-slate-900 mb-3">함께 보면 좋은 글</h2>
        <ul class="grid gap-2 sm:grid-cols-3">
          ${items}
        </ul>
      </nav>`;
}

async function renderPostPage(template, post, allPosts) {
  const slug = getPostSlug(post);
  const url = `${SITE_ORIGIN}/posts/${encodeURIComponent(slug)}.html`;
  const title = post.title;
  const plain = toPlainText(post.content);
  const description = (post.summary && post.summary.trim()) || plain.slice(0, 140);
  const image = post.coverImage
    ? (post.coverImage.startsWith("http") ? post.coverImage : `${SITE_ORIGIN}/${post.coverImage}`)
    : `${SITE_ORIGIN}/assets/hero-doctor.jpg`;
  const author = post.author || "부천코엔이비인후과 원장 최성웅";
  const date = post.date || "";
  const content = ensureHtmlParagraphs(post.content);

  const coverImageBlock = post.coverImage
    ? `<div class="mb-6 rounded-2xl overflow-hidden shadow-sm bg-slate-50 border border-slate-100 flex items-center justify-center p-1"><img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" class="w-full h-auto max-h-[550px] object-contain rounded-xl" loading="lazy" /></div>`
    : "";

  const relatedPostsBlock = renderRelatedPostsBlock(post, allPosts);

  return template
    .replaceAll("{{TITLE}}", escapeHtml(title))
    .replaceAll("{{DESCRIPTION}}", escapeHtml(description))
    .replaceAll("{{IMAGE}}", escapeHtml(image))
    .replaceAll("{{URL}}", url)
    .replaceAll("{{AUTHOR}}", escapeHtml(author))
    .replaceAll("{{DATE}}", escapeHtml(date))
    .replaceAll("{{CONTENT}}", content)
    .replaceAll("{{COVER_IMAGE_BLOCK}}", coverImageBlock)
    .replaceAll("{{RELATED_POSTS_BLOCK}}", relatedPostsBlock)
    .replaceAll("{{TITLE_JSON}}", JSON.stringify(title))
    .replaceAll("{{DESCRIPTION_JSON}}", JSON.stringify(description))
    .replaceAll("{{IMAGE_JSON}}", JSON.stringify(image))
    .replaceAll("{{DATE_JSON}}", JSON.stringify(date))
    .replaceAll("{{AUTHOR_JSON}}", JSON.stringify(author))
    .replaceAll("{{URL_JSON}}", JSON.stringify(url));
}

/* ==================== 5. 목록 페이지(index.html) 정적 마크업 ==================== */

function renderListItemHtml(post) {
  const slug = getPostSlug(post);
  const href = `posts/${encodeURIComponent(slug)}.html`;
  const title = escapeHtml(post.title);
  const author = escapeHtml(post.author || "부천코엔이비인후과 원장 최성웅");
  const date = escapeHtml(post.date || "");
  const plain = toPlainText(post.content);
  const summary = escapeHtml(post.summary || (plain.slice(0, 130) + (plain.length > 130 ? "..." : "")));
  const image = post.coverImage
    ? `<img src="${escapeHtml(post.coverImage)}" alt="${title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" loading="lazy">`
    : "";
  const imageBox = post.coverImage
    ? `<div class="w-full sm:w-48 h-40 sm:h-32 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">${image}</div>`
    : "";

  return `<article class="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all group hover:border-blue-300"><div class="flex flex-col sm:flex-row gap-5">${imageBox}<div class="flex-1 flex flex-col justify-between"><div><div class="flex items-center gap-2 text-xs text-slate-400 mb-1.5"><span class="font-medium text-slate-600">${author}</span><span>•</span><time datetime="${date}">${date}</time></div><h3 class="text-base sm:text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug mb-2"><a href="${href}" class="hover:underline">${title}</a></h3><p class="text-slate-600 text-xs sm:text-sm line-clamp-2 sm:line-clamp-3 leading-relaxed">${summary}</p></div></div></div></article>`;
}

async function injectListIntoIndex(posts) {
  const indexPath = path.join(ROOT, "index.html");
  let html = await fs.readFile(indexPath, "utf-8");

  const startMarker = "<!-- SSR:POSTS:START -->";
  const endMarker = "<!-- SSR:POSTS:END -->";
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    console.warn("⚠️ index.html에서 SSR:POSTS 마커를 찾지 못해 목록 주입을 건너뜁니다.");
    return;
  }

  const listHtml = posts.map(renderListItemHtml).join("\n          ");
  const before = html.slice(0, startIdx + startMarker.length);
  const after = html.slice(endIdx);
  html = `${before}\n          ${listHtml}\n          ${after}`;

  // 카운트 배지도 실제 글 개수로 맞춰준다 (초기 페인트 기준, JS가 이후 다시 갱신함)
  html = html.replace(
    /(<span id="posts-count-badge"[^>]*>)\d+(<\/span>)/,
    `$1${posts.length}$2`
  );

  await fs.writeFile(indexPath, html, "utf-8");
  console.log(`index.html에 정적 글 목록 ${posts.length}건을 주입했습니다.`);
}

/* ==================== 6. sitemap.xml 재생성 ==================== */

async function regenerateSitemap(posts) {
  const today = new Date().toISOString().split("T")[0];
  const urls = [
    { loc: `${SITE_ORIGIN}/`, lastmod: today, changefreq: "weekly", priority: "1.0" },
    ...posts.map(post => ({
      loc: `${SITE_ORIGIN}/posts/${encodeURIComponent(getPostSlug(post))}.html`,
      lastmod: (post.updatedAt || post.date || today).slice(0, 10),
      changefreq: "monthly",
      priority: "0.8",
    })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(
      u => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    )
    .join("\n")}\n</urlset>\n`;

  await fs.writeFile(path.join(ROOT, "sitemap.xml"), xml, "utf-8");
  console.log(`sitemap.xml을 URL ${urls.length}개로 재생성했습니다.`);
}

/* ==================== 5-1. 예전(긴) URL 리다이렉트 스텁 ==================== */

function renderRedirectStub(newUrl, title) {
  const safeUrl = escapeHtml(newUrl);
  const safeTitle = escapeHtml(title || "");
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="refresh" content="0; url=${safeUrl}" />
  <link rel="canonical" href="${safeUrl}" />
  <meta name="robots" content="noindex, follow" />
  <title>${safeTitle}</title>
</head>
<body>
  <p>페이지가 이동되었습니다. 자동으로 이동하지 않으면 <a href="${safeUrl}">여기</a>를 눌러주세요.</p>
</body>
</html>
`;
}

// 슬러그가 짧아지면서 예전(제목 전체) URL로 이미 색인된 링크가 있을 수 있으므로,
// 그 경로에 새 URL로 안내하는 정적 리다이렉트 페이지를 함께 생성해 404를 막는다.
async function writeLegacyRedirectStubs(posts) {
  let count = 0;
  for (const post of posts) {
    const legacySlug = getLegacyPostSlug(post);
    const currentSlug = getPostSlug(post);
    if (legacySlug === currentSlug) continue; // 원래 짧았던 슬러그는 스텁 불필요

    const newUrl = `${SITE_ORIGIN}/posts/${encodeURIComponent(currentSlug)}.html`;
    const outPath = path.join(ROOT, "posts", `${legacySlug}.html`);
    await fs.writeFile(outPath, renderRedirectStub(newUrl, post.title), "utf-8");
    count++;
  }
  if (count > 0) {
    console.log(`  -> 예전 URL 리다이렉트 스텁 ${count}건 생성`);
  }
}

/* ==================== 6-1. rss.xml 재생성 ==================== */

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;",
  }[c]));
}

function toRfc822(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
}

async function regenerateRss(posts) {
  const siteTitle = "부천코엔이비인후과 수면클리닉";
  const siteDescription = "부천 수면다원검사, 코골이 및 수면무호흡증 진단, 양압기 처방 및 관리 수면클리닉, 부천코엔이비인후과입니다.";
  const feedUrl = `${SITE_ORIGIN}/rss.xml`;
  const now = new Date().toUTCString();

  // 최신 글 30건만 노출 (RSS 관례)
  const recent = posts.slice(0, 30);

  const items = recent
    .map(post => {
      const url = `${SITE_ORIGIN}/posts/${encodeURIComponent(getPostSlug(post))}.html`;
      const title = escapeXml(post.title);
      const plain = toPlainText(post.content);
      const description = escapeXml((post.summary && post.summary.trim()) || plain.slice(0, 140));
      const pubDate = toRfc822(post.date);
      const author = escapeXml(post.author || "부천코엔이비인후과 원장 최성웅");

      return `  <item>
    <title>${title}</title>
    <link>${url}</link>
    <guid isPermaLink="true">${url}</guid>
    <pubDate>${pubDate}</pubDate>
    <description>${description}</description>
    <author>${author}</author>
  </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${escapeXml(siteTitle)}</title>
  <link>${SITE_ORIGIN}/</link>
  <description>${escapeXml(siteDescription)}</description>
  <language>ko-kr</language>
  <lastBuildDate>${now}</lastBuildDate>
  <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
${items}
</channel>
</rss>
`;

  await fs.writeFile(path.join(ROOT, "rss.xml"), xml, "utf-8");
  console.log(`rss.xml을 최신 글 ${recent.length}건으로 재생성했습니다.`);
}

/* ==================== 7. 메인 ==================== */

async function main() {
  const posts = await getAllPosts();
  const template = await fs.readFile(path.join(ROOT, "templates", "post.html"), "utf-8");

  await fs.mkdir(path.join(ROOT, "posts"), { recursive: true });

  for (const post of posts) {
    const html = await renderPostPage(template, post, posts);
    const slug = getPostSlug(post);
    const outPath = path.join(ROOT, "posts", `${slug}.html`);
    await fs.writeFile(outPath, html, "utf-8");
    console.log(`  -> posts/${slug}.html 생성`);
  }

  await writeLegacyRedirectStubs(posts);
  await injectListIntoIndex(posts);
  await regenerateSitemap(posts);
  await regenerateRss(posts);

  console.log("완료.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
