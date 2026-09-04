-- ============================================================
-- 부천코엔이비인후과 블로그용 Supabase 초기 설정
-- Supabase Dashboard → SQL Editor에서 전체 실행
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null default current_date,
  author text not null default '부천코엔이비인후과',
  summary text not null default '',
  cover_image text not null default '',
  content text not null,
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts enable row level security;

-- 방문자는 게시물 읽기 가능
 drop policy if exists "posts_public_read" on public.posts;
create policy "posts_public_read"
on public.posts for select
using (true);

-- 로그인한 관리자만 자신의 글 생성 가능
 drop policy if exists "posts_auth_insert" on public.posts;
create policy "posts_auth_insert"
on public.posts for insert
to authenticated
with check (author_id = auth.uid());

-- 자신이 만든 글만 수정 가능
 drop policy if exists "posts_owner_update" on public.posts;
create policy "posts_owner_update"
on public.posts for update
to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

-- 자신이 만든 글만 삭제 가능
 drop policy if exists "posts_owner_delete" on public.posts;
create policy "posts_owner_delete"
on public.posts for delete
to authenticated
using (author_id = auth.uid());

create index if not exists posts_date_idx on public.posts(date desc, created_at desc);

-- ============================================================
-- 이미지 저장소
-- ============================================================
insert into storage.buckets (id, name, public)
values ('blog-images', 'blog-images', true)
on conflict (id) do update set public = true;

-- 누구나 업로드된 이미지 보기 가능
 drop policy if exists "blog_images_public_read" on storage.objects;
create policy "blog_images_public_read"
on storage.objects for select
to public
using (bucket_id = 'blog-images');

-- 로그인한 관리자만 업로드 가능
 drop policy if exists "blog_images_auth_insert" on storage.objects;
create policy "blog_images_auth_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'blog-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 자신의 폴더에 있는 이미지 수정/삭제 가능
 drop policy if exists "blog_images_owner_update" on storage.objects;
create policy "blog_images_owner_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'blog-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'blog-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

 drop policy if exists "blog_images_owner_delete" on storage.objects;
create policy "blog_images_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'blog-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- 최초 관리자 계정 생성 후 기존 기본 글을 넣을 때 사용
-- 아래 UUID는 관리자 계정 생성 후 Authentication → Users에서 확인해 교체하세요.
-- ============================================================
-- insert into public.posts (title, date, author, summary, cover_image, content, author_id)
-- values (
-- '[부천 수면다원검사] 건강보험 적용으로 부담 없이 받는 코골이·수면무호흡 정밀검사',
-- '2026-09-01',
-- '부천코엔이비인후과',
-- '밤새 심한 코골이와 수면무호흡 증상이 있다면 수면다원검사는 필수입니다.',
-- 'https://수면다원검사.kr/assets/hero-doctor.jpg',
-- '<p>안녕하세요. 부천코엔이비인후과입니다.</p>',
-- '관리자-UUID'
-- );
