/**
 * Supabase 기반 블로그 메인 앱
 * - 각 포스팅이 고유 URL(쿼리스트링 ?post=슬러그)을 갖도록 라우팅 추가
 * - 상세 진입 시 title / description / og:* / twitter:* / canonical / JSON-LD 동적 갱신
 * - 새로고침, 직접 URL 접속, 뒤로가기/앞으로가기(popstate) 모두 지원
 */

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;"
  }[c]));
}

/* ==================== URL / 슬러그 유틸 ==================== */

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// 예: "부천-수면다원검사-안내-3fa85f64" 형태의 사람이 읽기 좋은 슬러그
function getPostSlug(post) {
  const base = slugify(post.title) || "post";
  const shortId = String(post.id || "").replace(/-/g, "").slice(0, 8) || "0000";
  return `${base}-${shortId}`;
}

// 실제로 크롤러/공유 미리보기가 접근할 정적 페이지 URL.
// 이 URL은 scripts/generate-static-posts.mjs가 생성하는 /posts/{slug}.html과 반드시 일치해야 합니다.
//
// 주의: 이 값은 반드시 "페이지 최초 로드 시점"의 location.pathname을 기준으로 한 번만
// 계산해서 캐시해야 합니다. 글 상세를 열 때마다 history.pushState로 주소창 경로 자체가
// 바뀌기 때문에, 매번 location.pathname을 다시 읽으면 이미 바뀐(오염된) 경로를 기준으로
// 다음 URL을 또 만들게 되어 "/posts/글A.html/posts/글B.html"처럼 경로가 계속 누적되는
// 버그가 발생합니다.
const HOME_BASE_PATH = (() => {
  const path = location.pathname.replace(/index\.html$/, "");
  return path.endsWith("/") ? path : path + "/";
})();

function getPostsBasePath() {
  return HOME_BASE_PATH;
}

function getPostUrl(post) {
  return `${location.origin}${getPostsBasePath()}posts/${encodeURIComponent(getPostSlug(post))}.html`;
}

// URL의 ?post= 값(슬러그 또는 구식 id)으로 실제 post 객체 탐색
function findPostByIdentifier(posts, identifier) {
  if (!identifier) return null;
  return (
    posts.find(p => getPostSlug(p) === identifier) ||
    posts.find(p => p.id === identifier) ||
    null
  );
}

/* ==================== 메타태그 동적 갱신 (SEO) ==================== */

function getMetaContent(selector) {
  const el = document.querySelector(selector);
  return el ? el.getAttribute("content") : "";
}

function setMetaContent(selector, value) {
  const el = document.querySelector(selector);
  if (el && value) el.setAttribute("content", value);
}

// 페이지 최초 로드 시점의 기본 메타값을 저장해두고, 상세 닫을 때 복원
const DEFAULT_META = {
  title: document.title,
  description: getMetaContent('meta[name="description"]'),
  canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") || (location.origin + location.pathname),
  ogTitle: getMetaContent('meta[property="og:title"]'),
  ogDescription: getMetaContent('meta[property="og:description"]'),
  ogImage: getMetaContent('meta[property="og:image"]'),
  ogUrl: getMetaContent('meta[property="og:url"]'),
  twitterTitle: getMetaContent('meta[name="twitter:title"]'),
  twitterDescription: getMetaContent('meta[name="twitter:description"]'),
  twitterImage: getMetaContent('meta[name="twitter:image"]'),
};

function applyPostMeta(post) {
  const plain = String(post.content || "").replace(/<[^>]*>?/gm, "").replace(/\s+/g, " ").trim();
  const desc = (post.summary && post.summary.trim()) || plain.slice(0, 140);
  const image = post.coverImage || DEFAULT_META.ogImage;
  const url = getPostUrl(post);
  const fullTitle = `${post.title} | 부천코엔이비인후과 수면클리닉`;

  document.title = fullTitle;
  setMetaContent('meta[name="description"]', desc);
  setMetaContent('meta[property="og:title"]', fullTitle);
  setMetaContent('meta[property="og:description"]', desc);
  setMetaContent('meta[property="og:image"]', image);
  setMetaContent('meta[property="og:url"]', url);
  setMetaContent('meta[name="twitter:title"]', fullTitle);
  setMetaContent('meta[name="twitter:description"]', desc);
  setMetaContent('meta[name="twitter:image"]', image);

  const canonicalEl = document.querySelector('link[rel="canonical"]');
  if (canonicalEl) canonicalEl.setAttribute("href", url);

  upsertPostJsonLd(post, url, desc, image);
}

function resetMetaToDefault() {
  document.title = DEFAULT_META.title;
  setMetaContent('meta[name="description"]', DEFAULT_META.description);
  setMetaContent('meta[property="og:title"]', DEFAULT_META.ogTitle);
  setMetaContent('meta[property="og:description"]', DEFAULT_META.ogDescription);
  setMetaContent('meta[property="og:image"]', DEFAULT_META.ogImage);
  setMetaContent('meta[property="og:url"]', DEFAULT_META.ogUrl);
  setMetaContent('meta[name="twitter:title"]', DEFAULT_META.twitterTitle);
  setMetaContent('meta[name="twitter:description"]', DEFAULT_META.twitterDescription);
  setMetaContent('meta[name="twitter:image"]', DEFAULT_META.twitterImage);

  const canonicalEl = document.querySelector('link[rel="canonical"]');
  if (canonicalEl) canonicalEl.setAttribute("href", DEFAULT_META.canonical);

  removePostJsonLd();
}

function upsertPostJsonLd(post, url, desc, image) {
  removePostJsonLd();
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = "post-jsonld";
  script.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": desc,
    "image": image,
    "datePublished": post.date,
    "author": { "@type": "Organization", "name": post.author || "부천코엔이비인후과" },
    "mainEntityOfPage": url
  });
  document.head.appendChild(script);
}

function removePostJsonLd() {
  const el = document.getElementById("post-jsonld");
  if (el) el.remove();
}

/* ==================== 목록 렌더링 ==================== */

async function renderBlogPosts() {
  const container = document.getElementById("posts-list-container");
  const emptyView = document.getElementById("no-posts-view");
  const countBadge = document.getElementById("posts-count-badge");
  if (!container) return;

  try {
    const posts = await getStoredPosts();
    const isAdmin = await isAdminLoggedIn();

    if (countBadge) countBadge.innerText = posts.length;
    if (posts.length === 0) {
      container.innerHTML = "";
      if (emptyView) emptyView.classList.remove("hidden");
      return;
    }
    if (emptyView) emptyView.classList.add("hidden");

    container.innerHTML = posts.map(post => {
      const postUrl = getPostUrl(post);
      const plain = String(post.content || "").replace(/<[^>]*>?/gm, "").replace(/\n+/g, " ");
      const cleanSummary = escapeHtml(post.summary || (plain.substring(0, 130) + (plain.length > 130 ? "..." : "")));
      const title = escapeHtml(post.title);
      const author = escapeHtml(post.author || "부천코엔이비인후과");
      const date = escapeHtml(post.date || "");
      const image = post.coverImage ? `<img src="${escapeHtml(post.coverImage)}" alt="${title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" onerror="this.style.display='none'">` : "";
      const imageBox = post.coverImage ? `<div class="w-full sm:w-48 h-40 sm:h-32 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">${image}</div>` : "";
      const adminControls = isAdmin ? `<div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs"><span class="text-slate-400">관리자 관리</span><div class="flex gap-2"><button onclick="event.stopPropagation(); openPostEditor('${escapeHtml(post.id)}')" class="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-md font-semibold transition">✏️ 수정</button><button onclick="event.stopPropagation(); deletePost('${escapeHtml(post.id)}')" class="px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-md font-semibold transition">🗑️ 삭제</button></div></div>` : "";
      return `<article class="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group hover:border-blue-300" onclick="openPostDetail('${escapeHtml(post.id)}')"><div class="flex flex-col sm:flex-row gap-5">${imageBox}<div class="flex-1 flex flex-col justify-between"><div><div class="flex items-center gap-2 text-xs text-slate-400 mb-1.5"><span class="font-medium text-slate-600">${author}</span><span>•</span><time datetime="${date}">${date}</time></div><h3 class="text-base sm:text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug mb-2"><a href="${postUrl}" class="hover:underline" onclick="return handlePostLinkClick(event, '${escapeHtml(post.id)}')">${title}</a></h3><p class="text-slate-600 text-xs sm:text-sm line-clamp-2 sm:line-clamp-3 leading-relaxed">${cleanSummary}</p></div>${adminControls}</div></div></article>`;
    }).join("");
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-sm text-rose-700">게시물을 불러오지 못했습니다. Supabase 설정과 RLS 정책을 확인해 주세요.</div>`;
  }
}

/* ==================== 클릭 핸들러 ==================== */

// 제목 링크 클릭: 일반 좌클릭은 SPA 방식으로 가로채고, Ctrl/Cmd/중클릭 등은
// 브라우저 기본 동작(새 탭 열기)에 맡긴다. 새 탭에서 열려도 해당 URL을 다시
// 로드하면 DOMContentLoaded 로직이 같은 상세글을 그대로 열어준다.
function handlePostLinkClick(event, postId) {
  event.stopPropagation();
  const isPlainClick = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
  if (isPlainClick) {
    event.preventDefault();
    openPostDetail(postId);
  }
  return true;
}

/* ==================== 상세 열기/닫기 ==================== */

async function openPostDetail(identifier, options = {}) {
  const { pushHistory = true } = options;
  const posts = await getStoredPosts();
  const post = findPostByIdentifier(posts, identifier);
  if (!post) return;

  const modal = document.getElementById("post-detail-modal");
  const contentContainer = document.getElementById("post-detail-body");
  let formattedContent = post.content || "";
  if (!formattedContent.includes("<p>") && !formattedContent.includes("<div>") && !formattedContent.includes("<h2>")) {
    formattedContent = formattedContent.split("\n\n").map(p => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  }

  contentContainer.innerHTML = `<header class="mb-6"><h1 class="text-xl sm:text-2xl font-extrabold text-slate-900 leading-snug mb-3">${escapeHtml(post.title)}</h1><div class="flex items-center justify-between pb-4 border-b border-slate-200 text-xs text-slate-500"><div class="flex items-center gap-2"><img src="assets/logo.png" alt="로고" class="h-4 w-auto object-contain opacity-80" /><span class="font-semibold text-slate-700">${escapeHtml(post.author || "부천코엔이비인후과")}</span></div><time>${escapeHtml(post.date || "")}</time></div></header>${post.coverImage ? `<div class="mb-6 rounded-2xl overflow-hidden shadow-sm bg-slate-50 border border-slate-100 flex items-center justify-center p-1"><img src="${escapeHtml(post.coverImage)}" alt="${escapeHtml(post.title)}" class="w-full h-auto max-h-[550px] object-contain rounded-xl" /></div>` : ""}<div class="prose prose-slate max-w-none text-slate-700 text-sm sm:text-base leading-relaxed medical-article-content">${formattedContent}</div><div class="mt-8 p-4 sm:p-5 bg-blue-50 rounded-xl border border-blue-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left"><div><div class="font-bold text-slate-900 text-sm">부천코엔이비인후과 수면클리닉</div><div class="text-xs text-slate-600 mt-0.5">수면다원검사 및 양압기 보험 처방 예약 상담</div></div><div class="flex flex-wrap items-center justify-center gap-2"><a href="https://m.booking.naver.com/booking/13/bizes/1404075?theme=place&service-target=map-pc&lang=ko&area=pll" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#03C75A] text-white rounded-lg text-xs font-bold shadow-sm transition"><span class="w-3.5 h-3.5 bg-white text-[#03C75A] rounded font-black text-[10px] flex items-center justify-center">N</span><span>수면검사외래진료 예약</span></a><a href="tel:032-677-5075" class="inline-flex items-center gap-1 px-3.5 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-sm transition"><span>📞</span><span>032-677-5075</span></a></div></div>`;
  modal.classList.remove("hidden"); modal.classList.add("flex"); document.body.style.overflow = "hidden";

  applyPostMeta(post);

  const url = getPostUrl(post);
  const state = { postSlug: getPostSlug(post) };
  if (pushHistory) {
    history.pushState(state, "", url);
  } else {
    history.replaceState(state, "", url);
  }
}

function closePostDetail(options = {}) {
  const { updateUrl = true } = options;
  const modal = document.getElementById("post-detail-modal");
  if (modal) {
    modal.classList.add("hidden"); modal.classList.remove("flex"); document.body.style.overflow = "auto";
  }
  resetMetaToDefault();
  // 글 상세가 열려있던 상태(history.state.postSlug 존재)였을 때만 홈 경로로 리셋합니다.
  // 예전에는 "?post=" 쿼리스트링 존재 여부로 판단했지만, 지금은 경로 기반 URL
  // (/posts/슬러그.html)을 쓰기 때문에 그 조건이 항상 false가 되어 주소가 리셋되지
  // 않고 다음 글을 열 때 경로가 계속 누적되는 문제가 있었습니다.
  if (updateUrl && history.state && history.state.postSlug) {
    history.pushState({}, "", HOME_BASE_PATH);
  }
}

/* ==================== 뒤로가기/앞으로가기 & 초기 진입 ==================== */

window.addEventListener("popstate", (event) => {
  // 경로 기반 URL(/posts/슬러그.html)에는 "?post=" 쿼리스트링이 없으므로,
  // location.search가 아니라 pushState로 함께 저장해둔 state.postSlug를 사용합니다.
  const slug = event.state && event.state.postSlug;
  if (slug) {
    openPostDetail(slug, { pushHistory: false });
  } else {
    closePostDetail({ updateUrl: false });
  }
});

window.renderBlogPosts = renderBlogPosts;
window.openPostDetail = openPostDetail;
window.closePostDetail = closePostDetail;
window.handlePostLinkClick = handlePostLinkClick;

window.addEventListener("DOMContentLoaded", async () => {
  if (window.adminReady) await window.adminReady;
  await renderBlogPosts();

  // 직접 URL(예: ?post=슬러그)로 접속했거나 새로고침한 경우, 해당 상세글을 바로 연다.
  const postParam = new URLSearchParams(location.search).get("post");
  if (postParam) {
    await openPostDetail(postParam, { pushHistory: false });
  }

  window.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closePostDetail();
      closePostEditor();
      closeAdminLoginModal();
    }
  });
});
