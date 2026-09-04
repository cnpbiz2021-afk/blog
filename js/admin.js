/**
 * Supabase 기반 관리자 로그인 / 블로그 관리
 */

const ADMIN_AUTHOR = "부천코엔이비인후과";

async function getCurrentUser() {
  const { data, error } = await window.supabaseClient.auth.getUser();
  if (error) return null;
  return data.user;
}

async function isAdminLoggedIn() {
  return !!(await getCurrentUser());
}

async function getStoredPosts() {
  const { data, error } = await window.supabaseClient
    .from("posts")
    .select("id,title,date,author,summary,cover_image,content,created_at,updated_at,author_id")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("게시물 불러오기 오류:", error);
    throw error;
  }

  return (data || []).map(p => ({
    ...p,
    coverImage: p.cover_image
  }));
}

async function saveStoredPost(post) {
  const user = await getCurrentUser();
  if (!user) throw new Error("관리자 로그인이 필요합니다.");

  const row = {
    title: post.title,
    date: post.date,
    author: post.author || ADMIN_AUTHOR,
    summary: post.summary || "",
    cover_image: post.coverImage || "",
    content: post.content,
    author_id: user.id,
    updated_at: new Date().toISOString()
  };

  if (post.id) {
    const { error } = await window.supabaseClient
      .from("posts")
      .update(row)
      .eq("id", post.id);
    if (error) throw error;
  } else {
    const { error } = await window.supabaseClient
      .from("posts")
      .insert(row);
    if (error) throw error;
  }
}

async function deletePost(postId) {
  if (!confirm("이 포스팅을 삭제하시겠습니까?")) return;

  try {
    const { data: post, error: readError } = await window.supabaseClient
      .from("posts")
      .select("cover_image")
      .eq("id", postId)
      .single();
    if (readError) throw readError;

    const { error } = await window.supabaseClient
      .from("posts")
      .delete()
      .eq("id", postId);
    if (error) throw error;

    // Supabase Storage에 업로드한 이미지라면 삭제 시도
    if (post?.cover_image?.includes("/storage/v1/object/public/blog-images/")) {
      const path = post.cover_image.split("/blog-images/")[1];
      if (path) await window.supabaseClient.storage.from("blog-images").remove([path]);
    }

    await window.renderBlogPosts();
  } catch (error) {
    console.error(error);
    alert("삭제 중 오류가 발생했습니다: " + error.message);
  }
}

async function loginAdmin(email, password) {
  const { error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
  if (error) return false;
  await updateAdminUI();
  return true;
}

async function logoutAdmin() {
  await window.supabaseClient.auth.signOut();
  await updateAdminUI();
}

async function toggleAdminAuthModal() {
  if (await isAdminLoggedIn()) {
    if (confirm("관리자 모드에서 로그아웃하시겠습니까?")) await logoutAdmin();
  } else {
    openAdminLoginModal();
  }
}

async function updateAdminUI() {
  const loggedIn = await isAdminLoggedIn();
  const adminBar = document.getElementById("admin-bar");
  const headerWriteBtn = document.getElementById("header-write-btn");
  const inlineWriteBtn = document.getElementById("inline-write-btn");
  const headerAuthBtn = document.getElementById("header-auth-btn");

  if (adminBar) adminBar.classList.toggle("hidden", !loggedIn);
  if (headerWriteBtn) headerWriteBtn.classList.toggle("hidden", !loggedIn);
  if (inlineWriteBtn) inlineWriteBtn.classList.toggle("hidden", !loggedIn);

  if (headerAuthBtn) {
    headerAuthBtn.innerText = loggedIn ? "로그아웃" : "로그인";
    // 모바일에서는 항상 숨김 처리 (하단 '관리자' 버튼만 사용), sm 이상에서만 노출
    headerAuthBtn.className = loggedIn
      ? "hidden sm:inline-flex whitespace-nowrap px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 transition border border-rose-200"
      : "hidden sm:inline-flex whitespace-nowrap px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 transition border border-slate-200";
  }

  if (window.renderBlogPosts) await window.renderBlogPosts();
}

async function openPostEditor(postId = null) {
  if (!(await isAdminLoggedIn())) {
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
    const posts = await getStoredPosts();
    const post = posts.find(p => p.id === postId);
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
    document.getElementById("editor-date").value = new Date().toISOString().split("T")[0];
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.style.overflow = "hidden";
}

function closePostEditor() {
  const modal = document.getElementById("post-editor-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  document.body.style.overflow = "auto";
}

async function handleSavePost(e) {
  e.preventDefault();
  const submitBtn = e.submitter;
  if (submitBtn) submitBtn.disabled = true;

  try {
    const postId = document.getElementById("editor-post-id").value.trim();
    const title = document.getElementById("editor-title").value.trim();
    const date = document.getElementById("editor-date").value;
    const summary = document.getElementById("editor-summary").value.trim();
    const coverImage = document.getElementById("editor-cover-url").value.trim();
    const content = document.getElementById("editor-content").value.trim();

    if (!title || !content) {
      alert("제목과 본문 내용을 입력해 주세요.");
      return;
    }

    await saveStoredPost({
      id: postId || null,
      title, date, summary, coverImage, content,
      author: ADMIN_AUTHOR
    });

    closePostEditor();
    await window.renderBlogPosts();
    alert("저장되었습니다.");
  } catch (error) {
    console.error(error);
    alert("저장 중 오류가 발생했습니다: " + error.message);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    alert("이미지 용량은 5MB 이하만 가능합니다.");
    e.target.value = "";
    return;
  }
  if (!file.type.startsWith("image/")) {
    alert("이미지 파일만 업로드할 수 있습니다.");
    return;
  }

  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("관리자 로그인이 필요합니다.");

    const ext = file.name.split(".").pop().toLowerCase() || "jpg";
    const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await window.supabaseClient.storage
      .from("blog-images")
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (uploadError) throw uploadError;

    const { data } = window.supabaseClient.storage.from("blog-images").getPublicUrl(path);
    document.getElementById("editor-cover-url").value = data.publicUrl;
    document.getElementById("editor-image-preview").src = data.publicUrl;
    document.getElementById("editor-image-preview-box").classList.remove("hidden");
  } catch (error) {
    console.error(error);
    alert("이미지 업로드 중 오류가 발생했습니다: " + error.message);
  } finally {
    e.target.value = "";
  }
}

function exportPostsJSON() {
  getStoredPosts().then(posts => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(posts, null, 2));
    const a = document.createElement("a");
    a.href = dataStr;
    a.download = `bucheon-coen-blog-backup-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a); a.click(); a.remove();
  });
}

function openAdminLoginModal() {
  const modal = document.getElementById("admin-login-modal");
  document.getElementById("admin-email-input").value = "";
  document.getElementById("admin-pw-input").value = "";
  document.getElementById("admin-login-error").classList.add("hidden");
  modal.classList.remove("hidden"); modal.classList.add("flex");
  document.body.style.overflow = "hidden";
  setTimeout(() => document.getElementById("admin-email-input").focus(), 100);
}

function closeAdminLoginModal() {
  const modal = document.getElementById("admin-login-modal");
  if (!modal) return;
  modal.classList.add("hidden"); modal.classList.remove("flex");
  document.body.style.overflow = "auto";
}

// 기존 HTML의 inline onclick이 사용할 수 있도록 전역 노출
window.getStoredPosts = getStoredPosts;
window.isAdminLoggedIn = isAdminLoggedIn;
window.openPostEditor = openPostEditor;
window.closePostEditor = closePostEditor;
window.deletePost = deletePost;
window.exportPostsJSON = exportPostsJSON;
window.openAdminLoginModal = openAdminLoginModal;
window.closeAdminLoginModal = closeAdminLoginModal;
window.logoutAdmin = logoutAdmin;

// 이벤트 초기화
window.adminReady = (async () => {
  const loginForm = document.getElementById("admin-login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async e => {
      e.preventDefault();
      const email = document.getElementById("admin-email-input").value.trim();
      const pw = document.getElementById("admin-pw-input").value;
      const ok = await loginAdmin(email, pw);
      if (ok) closeAdminLoginModal();
      else document.getElementById("admin-login-error").classList.remove("hidden");
    });
  }

  const postForm = document.getElementById("post-editor-form");
  if (postForm) postForm.addEventListener("submit", handleSavePost);

  const imageInput = document.getElementById("editor-file-upload");
  if (imageInput) imageInput.addEventListener("change", handleImageUpload);

  const coverUrlInput = document.getElementById("editor-cover-url");
  if (coverUrlInput) coverUrlInput.addEventListener("input", e => {
    const url = e.target.value.trim();
    document.getElementById("editor-image-preview-box").classList.toggle("hidden", !url);
    if (url) document.getElementById("editor-image-preview").src = url;
  });

  window.supabaseClient.auth.onAuthStateChange(() => {
    setTimeout(() => updateAdminUI(), 0);
  });

  await updateAdminUI();
})();
