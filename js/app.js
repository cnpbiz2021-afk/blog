/**
 * Supabase 기반 블로그 메인 앱
 */

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;"
  }[c]));
}

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
      const plain = String(post.content || "").replace(/<[^>]*>?/gm, "").replace(/\n+/g, " ");
      const cleanSummary = escapeHtml(post.summary || (plain.substring(0, 130) + (plain.length > 130 ? "..." : "")));
      const title = escapeHtml(post.title);
      const author = escapeHtml(post.author || "부천코엔이비인후과");
      const date = escapeHtml(post.date || "");
      const image = post.coverImage ? `<img src="${escapeHtml(post.coverImage)}" alt="${title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" onerror="this.style.display='none'">` : "";
      const imageBox = post.coverImage ? `<div class="w-full sm:w-48 h-40 sm:h-32 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">${image}</div>` : "";
      const adminControls = isAdmin ? `<div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs"><span class="text-slate-400">관리자 관리</span><div class="flex gap-2"><button onclick="event.stopPropagation(); openPostEditor('${escapeHtml(post.id)}')" class="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-md font-semibold transition">✏️ 수정</button><button onclick="event.stopPropagation(); deletePost('${escapeHtml(post.id)}')" class="px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-md font-semibold transition">🗑️ 삭제</button></div></div>` : "";
      return `<article class="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group hover:border-blue-300" onclick="openPostDetail('${escapeHtml(post.id)}')"><div class="flex flex-col sm:flex-row gap-5">${imageBox}<div class="flex-1 flex flex-col justify-between"><div><div class="flex items-center gap-2 text-xs text-slate-400 mb-1.5"><span class="font-medium text-slate-600">${author}</span><span>•</span><time datetime="${date}">${date}</time></div><h3 class="text-base sm:text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug mb-2">${title}</h3><p class="text-slate-600 text-xs sm:text-sm line-clamp-2 sm:line-clamp-3 leading-relaxed">${cleanSummary}</p></div>${adminControls}</div></div></article>`;
    }).join("");
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-sm text-rose-700">게시물을 불러오지 못했습니다. Supabase 설정과 RLS 정책을 확인해 주세요.</div>`;
  }
}

async function openPostDetail(postId) {
  const posts = await getStoredPosts();
  const post = posts.find(p => p.id === postId);
  if (!post) return;

  const modal = document.getElementById("post-detail-modal");
  const contentContainer = document.getElementById("post-detail-body");
  let formattedContent = post.content || "";
  if (!formattedContent.includes("<p>") && !formattedContent.includes("<div>") && !formattedContent.includes("<h2>")) {
    formattedContent = formattedContent.split("\n\n").map(p => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  }

  contentContainer.innerHTML = `<header class="mb-6"><h1 class="text-xl sm:text-2xl font-extrabold text-slate-900 leading-snug mb-3">${escapeHtml(post.title)}</h1><div class="flex items-center justify-between pb-4 border-b border-slate-200 text-xs text-slate-500"><div class="flex items-center gap-2"><img src="assets/logo.png" alt="로고" class="h-4 w-auto object-contain opacity-80" /><span class="font-semibold text-slate-700">${escapeHtml(post.author || "부천코엔이비인후과")}</span></div><time>${escapeHtml(post.date || "")}</time></div></header>${post.coverImage ? `<div class="mb-6 rounded-2xl overflow-hidden shadow-sm bg-slate-50 border border-slate-100 flex items-center justify-center p-1"><img src="${escapeHtml(post.coverImage)}" alt="${escapeHtml(post.title)}" class="w-full h-auto max-h-[550px] object-contain rounded-xl" /></div>` : ""}<div class="prose prose-slate max-w-none text-slate-700 text-sm sm:text-base leading-relaxed medical-article-content">${formattedContent}</div><div class="mt-8 p-4 sm:p-5 bg-blue-50 rounded-xl border border-blue-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left"><div><div class="font-bold text-slate-900 text-sm">부천코엔이비인후과 수면클리닉</div><div class="text-xs text-slate-600 mt-0.5">수면다원검사 및 양압기 보험 처방 예약 상담</div></div><div class="flex flex-wrap items-center justify-center gap-2"><a href="https://m.booking.naver.com/booking/13/bizes/1404075?theme=place&service-target=map-pc&lang=ko&area=pll" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#03C75A] text-white rounded-lg text-xs font-bold shadow-sm transition"><span class="w-3.5 h-3.5 bg-white text-[#03C75A] rounded font-black text-[10px] flex items-center justify-center">N</span><span>수면검사외래진료 예약</span></a><a href="tel:032-677-5075" class="inline-flex items-center gap-1 px-3.5 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-sm transition"><span>📞</span><span>032-677-5075</span></a></div></div>`;
  modal.classList.remove("hidden"); modal.classList.add("flex"); document.body.style.overflow = "hidden";
}

function closePostDetail() {
  const modal = document.getElementById("post-detail-modal");
  if (!modal) return;
  modal.classList.add("hidden"); modal.classList.remove("flex"); document.body.style.overflow = "auto";
}

window.renderBlogPosts = renderBlogPosts;
window.openPostDetail = openPostDetail;
window.closePostDetail = closePostDetail;

window.addEventListener("DOMContentLoaded", async () => {
  if (window.adminReady) await window.adminReady;
  await renderBlogPosts();
  window.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closePostDetail();
      closePostEditor();
      closeAdminLoginModal();
    }
  });
});
