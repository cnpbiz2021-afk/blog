/**
 * 블로그 메인 앱 스크립트 (app.js)
 * 히어로 밑 블로그 포스팅 순차 나열 및 상세 보기 모달
 */

// 포스팅 렌더링 함수
function renderBlogPosts() {
  const container = document.getElementById("posts-list-container");
  const emptyView = document.getElementById("no-posts-view");
  const countBadge = document.getElementById("posts-count-badge");
  if (!container) return;

  const posts = getStoredPosts();
  const isAdmin = isAdminLoggedIn();

  if (countBadge) {
    countBadge.innerText = posts.length;
  }

  if (posts.length === 0) {
    container.innerHTML = "";
    if (emptyView) emptyView.classList.remove("hidden");
    return;
  }

  if (emptyView) emptyView.classList.add("hidden");

  container.innerHTML = posts
    .map((post) => {
      // 본문 텍스트 요약
      const cleanSummary =
        post.summary ||
        post.content
          .replace(/<[^>]*>?/gm, "")
          .replace(/\n+/g, " ")
          .substring(0, 130) + "...";

      const adminControls = isAdmin
        ? `
          <div class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span class="text-slate-400">관리자 관리</span>
            <div class="flex gap-2">
              <button onclick="event.stopPropagation(); openPostEditor('${post.id}')" class="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-md font-semibold transition">
                ✏️ 수정
              </button>
              <button onclick="event.stopPropagation(); deletePost('${post.id}')" class="px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-md font-semibold transition">
                🗑️ 삭제
              </button>
            </div>
          </div>
        `
        : "";

      return `
        <article class="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group hover:border-blue-300" onclick="openPostDetail('${post.id}')">
          <div class="flex flex-col sm:flex-row gap-5">
            ${
              post.coverImage
                ? `
                <div class="w-full sm:w-48 h-40 sm:h-32 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                  <img 
                    src="${post.coverImage}" 
                    alt="${post.title}" 
                    class="w-full h-full object-cover group-hover:scale-105 transition duration-300" 
                    onerror="this.style.display='none'"
                  />
                </div>
              `
                : ""
            }
            <div class="flex-1 flex flex-col justify-between">
              <div>
                <div class="flex items-center gap-2 text-xs text-slate-400 mb-1.5">
                  <span class="font-medium text-slate-600">${post.author || "부천코엔이비인후과"}</span>
                  <span>•</span>
                  <time datetime="${post.date}">${post.date}</time>
                </div>
                <h3 class="text-base sm:text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug mb-2">
                  ${post.title}
                </h3>
                <p class="text-slate-600 text-xs sm:text-sm line-clamp-2 sm:line-clamp-3 leading-relaxed">
                  ${cleanSummary}
                </p>
              </div>
              ${adminControls}
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

// 글 상세 모달 열기
function openPostDetail(postId) {
  const posts = getStoredPosts();
  const post = posts.find((p) => p.id === postId);
  if (!post) return;

  const modal = document.getElementById("post-detail-modal");
  const contentContainer = document.getElementById("post-detail-body");

  // 줄바꿈이 있는 일반 텍스트인 경우 HTML 문단으로 자동 변환
  let formattedContent = post.content;
  if (!formattedContent.includes("<p>") && !formattedContent.includes("<div>") && !formattedContent.includes("<h2>")) {
    formattedContent = formattedContent
      .split("\n\n")
      .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  contentContainer.innerHTML = `
    <header class="mb-6">
      <h1 class="text-xl sm:text-2xl font-extrabold text-slate-900 leading-snug mb-3">
        ${post.title}
      </h1>
      <div class="flex items-center justify-between pb-4 border-b border-slate-200 text-xs text-slate-500">
        <div class="flex items-center gap-2">
          <img src="assets/logo.png" alt="로고" class="h-4 w-auto object-contain opacity-80" />
          <span class="font-semibold text-slate-700">${post.author || "부천코엔이비인후과"}</span>
        </div>
        <time>${post.date}</time>
      </div>
    </header>

    ${
      post.coverImage
        ? `<div class="mb-6 rounded-2xl overflow-hidden shadow-sm bg-slate-50 border border-slate-100 flex items-center justify-center p-1">
            <img src="${post.coverImage}" alt="${post.title}" class="w-full h-auto max-h-[550px] object-contain rounded-xl" />
          </div>`
        : ""
    }

    <div class="prose prose-slate max-w-none text-slate-700 text-sm sm:text-base leading-relaxed medical-article-content">
      ${formattedContent}
    </div>

    <!-- 하단 전화 상담 배너 -->
    <div class="mt-8 p-4 sm:p-5 bg-blue-50 rounded-xl border border-blue-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
      <div>
        <div class="font-bold text-slate-900 text-sm">부천코엔이비인후과 수면클리닉</div>
        <div class="text-xs text-slate-600 mt-0.5">수면다원검사 및 양압기 보험 처방 예약 상담</div>
      </div>
      <div class="flex flex-wrap items-center justify-center gap-2">
        <a href="https://m.booking.naver.com/booking/13/bizes/1404075?theme=place&service-target=map-pc&lang=ko&area=pll" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#03C75A] hover:bg-[#02b350] text-white rounded-lg text-xs font-bold shadow-sm transition">
          <span class="w-3.5 h-3.5 bg-white text-[#03C75A] rounded font-black text-[10px] flex items-center justify-center">N</span>
          <span>수면검사외래진료 예약</span>
        </a>
        <a href="tel:032-677-5075" class="inline-flex items-center gap-1 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition">
          <svg class="w-3.5 h-3.5 text-slate-950 fill-current" viewBox="0 0 24 24"><path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57.55 0 1 .45 1 1V20a1 1 0 01-1 1c-9.39 0-17-7.61-17-17a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
          <span>032-677-5075</span>
        </a>
      </div>
    </div>
  `;

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.style.overflow = "hidden";
}

function closePostDetail() {
  const modal = document.getElementById("post-detail-modal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  document.body.style.overflow = "auto";
}

// 초기화
document.addEventListener("DOMContentLoaded", () => {
  renderBlogPosts();

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closePostDetail();
      closePostEditor();
      closeAdminLoginModal();
    }
  });
});
