/**
 * 관리자 로그인 및 글쓰기 관리 스크립트 (admin.js)
 */

const STORAGE_KEY = "bucheon_sleep_posts_v1";
const ADMIN_AUTH_KEY = "bucheon_sleep_admin_session";
const ADMIN_PASSWORD_KEY = "bucheon_sleep_admin_pw";
const DEFAULT_PASSWORD = "csw5913!"; // 초기 관리자 비밀번호

// 저장된 포스팅 데이터 불러오기
function getStoredPosts() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (data) {
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error("포스팅 데이터 파싱 오류", e);
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_POSTS));
  return DEFAULT_POSTS;
}

// 포스팅 데이터 저장
function saveStoredPosts(posts) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  if (window.renderBlogPosts) {
    window.renderBlogPosts();
  }
}

// 관리자 인증 상태 확인
function isAdminLoggedIn() {
  return sessionStorage.getItem(ADMIN_AUTH_KEY) === "true";
}

// 관리자 비밀번호 가져오기
function getAdminPassword() {
  return localStorage.getItem(ADMIN_PASSWORD_KEY) || DEFAULT_PASSWORD;
}

// 관리자 로그인
function loginAdmin(password) {
  const currentPw = getAdminPassword();
  if (password === currentPw) {
    sessionStorage.setItem(ADMIN_AUTH_KEY, "true");
    updateAdminUI();
    return true;
  }
  return false;
}

// 관리자 로그아웃
function logoutAdmin() {
  sessionStorage.removeItem(ADMIN_AUTH_KEY);
  updateAdminUI();
}

// 헤더 로그인/로그아웃 토글 버튼
function toggleAdminAuthModal() {
  if (isAdminLoggedIn()) {
    if (confirm("관리자 모드에서 로그아웃하시겠습니까?")) {
      logoutAdmin();
    }
  } else {
    openAdminLoginModal();
  }
}

// 관리자 UI 상태 반영
function updateAdminUI() {
  const isLoggedIn = isAdminLoggedIn();
  const adminBar = document.getElementById("admin-bar");
  const headerWriteBtn = document.getElementById("header-write-btn");
  const inlineWriteBtn = document.getElementById("inline-write-btn");
  const headerAuthBtn = document.getElementById("header-auth-btn");

  if (adminBar) {
    if (isLoggedIn) {
      adminBar.classList.remove("hidden");
    } else {
      adminBar.classList.add("hidden");
    }
  }

  if (headerWriteBtn) {
    if (isLoggedIn) headerWriteBtn.classList.remove("hidden");
    else headerWriteBtn.classList.add("hidden");
  }

  if (inlineWriteBtn) {
    if (isLoggedIn) inlineWriteBtn.classList.remove("hidden");
    else inlineWriteBtn.classList.add("hidden");
  }

  if (headerAuthBtn) {
    if (isLoggedIn) {
      headerAuthBtn.innerText = "로그아웃";
      headerAuthBtn.className = "px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 transition border border-rose-200";
    } else {
      headerAuthBtn.innerText = "로그인";
      headerAuthBtn.className = "px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 transition border border-slate-200";
    }
  }

  if (window.renderBlogPosts) {
    window.renderBlogPosts();
  }
}

// 글쓰기 / 수정 모달 열기
function openPostEditor(postId = null) {
  if (!isAdminLoggedIn()) {
    openAdminLoginModal();
    return;
  }

  const modal = document.getElementById("post-editor-modal");
  const form = document.getElementById("post-editor-form");
  const modalTitle = document.getElementById("editor-modal-title");

  form.reset();
  document.getElementById("editor-image-preview").src = "";
  document.getElementById("editor-image-preview-box").classList.add("hidden");

  if (postId) {
    const posts = getStoredPosts();
    const post = posts.find((p) => p.id === postId);
    if (post) {
      modalTitle.innerText = "블로그 글 수정하기";
      document.getElementById("editor-post-id").value = post.id;
      document.getElementById("editor-title").value = post.title;
      document.getElementById("editor-date").value = post.date || new Date().toISOString().split("T")[0];
      document.getElementById("editor-summary").value = post.summary || "";
      document.getElementById("editor-cover-url").value = post.coverImage || "";
      document.getElementById("editor-content").value = post.content || "";

      if (post.coverImage) {
        document.getElementById("editor-image-preview").src = post.coverImage;
        document.getElementById("editor-image-preview-box").classList.remove("hidden");
      }
    }
  } else {
    modalTitle.innerText = "새 블로그 글쓰기";
    document.getElementById("editor-post-id").value = "";
    document.getElementById("editor-date").value = new Date().toISOString().split("T")[0];
    document.getElementById("editor-cover-url").value = "";
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.style.overflow = "hidden";
}

function closePostEditor() {
  const modal = document.getElementById("post-editor-modal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  document.body.style.overflow = "auto";
}

// 글 저장
function handleSavePost(e) {
  e.preventDefault();
  const postId = document.getElementById("editor-post-id").value;
  const title = document.getElementById("editor-title").value.trim();
  const date = document.getElementById("editor-date").value;
  const summary = document.getElementById("editor-summary").value.trim();
  const coverImage = document.getElementById("editor-cover-url").value.trim();
  const content = document.getElementById("editor-content").value.trim();

  if (!title || !content) {
    alert("제목과 본문 내용을 입력해 주세요.");
    return;
  }

  let posts = getStoredPosts();

  if (postId) {
    const index = posts.findIndex((p) => p.id === postId);
    if (index !== -1) {
      posts[index] = {
        ...posts[index],
        title,
        date,
        summary,
        coverImage,
        content
      };
    }
  } else {
    const newPost = {
      id: "post-" + Date.now(),
      title,
      date,
      author: "부천코엔이비인후과",
      summary,
      coverImage,
      content
    };
    posts.unshift(newPost); // 최신글 맨 위로
  }

  saveStoredPosts(posts);
  closePostEditor();
}

// 글 삭제
function deletePost(postId) {
  if (!confirm("이 포스팅을 삭제하시겠습니까?")) {
    return;
  }
  let posts = getStoredPosts();
  posts = posts.filter((p) => p.id !== postId);
  saveStoredPosts(posts);
}

// JSON 백업
function exportPostsJSON() {
  const posts = getStoredPosts();
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(posts, null, 2));
  const downloadAnchor = document.createElement("a");
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `bucheon-coen-blog-backup-${new Date().toISOString().split("T")[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// JSON 복원
function importPostsJSON(file) {
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const importedPosts = JSON.parse(e.target.result);
      if (Array.isArray(importedPosts)) {
        if (confirm(`총 ${importedPosts.length}개의 포스팅을 불러오시겠습니까?`)) {
          saveStoredPosts(importedPosts);
          alert("데이터가 복원되었습니다.");
        }
      }
    } catch (err) {
      alert("파일 읽기 오류: " + err.message);
    }
  };
  reader.readAsText(file);
}

// 이미지 파일 업로드 (Base64 DataURL 변환)
function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 3 * 1024 * 1024) {
    alert("이미지 용량은 3MB 이하만 가능합니다.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (event) {
    const dataUrl = event.target.result;
    document.getElementById("editor-cover-url").value = dataUrl;
    document.getElementById("editor-image-preview").src = dataUrl;
    document.getElementById("editor-image-preview-box").classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

// 로그인 모달 열기/닫기
function openAdminLoginModal() {
  const modal = document.getElementById("admin-login-modal");
  document.getElementById("admin-pw-input").value = "";
  document.getElementById("admin-login-error").classList.add("hidden");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.style.overflow = "hidden";
  setTimeout(() => document.getElementById("admin-pw-input").focus(), 100);
}

function closeAdminLoginModal() {
  const modal = document.getElementById("admin-login-modal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  document.body.style.overflow = "auto";
}

// 이벤트 초기화
document.addEventListener("DOMContentLoaded", () => {
  updateAdminUI();

  const loginForm = document.getElementById("admin-login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const pw = document.getElementById("admin-pw-input").value;
      if (loginAdmin(pw)) {
        closeAdminLoginModal();
      } else {
        document.getElementById("admin-login-error").classList.remove("hidden");
      }
    });
  }

  const postForm = document.getElementById("post-editor-form");
  if (postForm) {
    postForm.addEventListener("submit", handleSavePost);
  }

  const imageInput = document.getElementById("editor-file-upload");
  if (imageInput) {
    imageInput.addEventListener("change", handleImageUpload);
  }

  const coverUrlInput = document.getElementById("editor-cover-url");
  if (coverUrlInput) {
    coverUrlInput.addEventListener("input", (e) => {
      const url = e.target.value.trim();
      if (url) {
        document.getElementById("editor-image-preview").src = url;
        document.getElementById("editor-image-preview-box").classList.remove("hidden");
      } else {
        document.getElementById("editor-image-preview-box").classList.add("hidden");
      }
    });
  }

  const backupFileInput = document.getElementById("backup-file-input");
  if (backupFileInput) {
    backupFileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        importPostsJSON(e.target.files[0]);
        e.target.value = "";
      }
    });
  }
});
