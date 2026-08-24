-- ============================================================================
-- 打卡宠物 · 结构重构迁移
--
-- 修复四个问题：
--   1. redemptions 表被当成「奖励目录 + 兑换流水」两用 → 拆出 rewards 目录表
--   2. 「今天」用 UTC 日期 → 服务端统一按 Asia/Shanghai 取日期
--   3. 家庭归属缺失 → profiles.family_id 贯通，配合 RLS 做数据隔离
--   4. 积分客户端读-改-写会丢分 → 收敛到 SECURITY DEFINER 的原子 RPC
--
-- 执行方式：Supabase 控制台 → SQL Editor → 粘贴执行（整体在一个事务里）
-- 前置状态：children / tasks / redemptions / check_ins / check_in_requests 均为空表
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. profiles：家庭归属
--    约定：family_id 指向「家长自己的 profile id」，家长的 family_id = 自身 id
-- ============================================================================

alter table public.profiles
  add column if not exists family_id uuid references public.profiles(id) on delete set null;

-- 家长指向自己
update public.profiles
   set family_id = id
 where role = 'parent'
   and family_id is distinct from id;

-- 现存恰好一个家长时，把未归属的孩子挂到该家长（保住 admin / xixi 这两个账号）
do $$
declare
  v_parent uuid;
begin
  if (select count(*) from public.profiles where role = 'parent') = 1 then
    select id into v_parent from public.profiles where role = 'parent';
    update public.profiles
       set family_id = v_parent
     where role = 'child'
       and family_id is null;
  end if;
end $$;

create index if not exists profiles_family_id_idx on public.profiles(family_id);
create index if not exists profiles_role_idx      on public.profiles(role);

-- ============================================================================
-- 2. 家庭作用域辅助函数
-- ============================================================================

-- 当前登录用户所属家庭
create or replace function public.my_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from public.profiles where id = auth.uid();
$$;

-- 当前登录用户是否为家长
create or replace function public.is_parent()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'parent'
  );
$$;

-- 北京时间「今天」
create or replace function public.today_local()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Shanghai')::date;
$$;

-- 积分 → 等级（阈值与前端 src/lib/levels.ts 保持一致）
create or replace function public.level_for_score(p_score int)
returns int
language sql
immutable
as $$
  select coalesce(max(t.i) - 1, 0)
    from unnest(array[0, 40, 100, 180, 280, 400, 540, 700])
         with ordinality as t(threshold, i)
   where coalesce(p_score, 0) >= t.threshold;
$$;

-- ============================================================================
-- 3. children / tasks / check_in_requests：补齐归属与时间戳
-- ============================================================================

alter table public.children
  add column if not exists updated_at timestamptz not null default now();

alter table public.children alter column total_score set default 0;
alter table public.children alter column level       set default 0;

alter table public.children drop constraint if exists children_family_id_fkey;
alter table public.children
  add constraint children_family_id_fkey
  foreign key (family_id) references public.profiles(id) on delete cascade;

create index if not exists children_family_id_idx on public.children(family_id);

alter table public.tasks drop constraint if exists tasks_family_id_fkey;
alter table public.tasks
  add constraint tasks_family_id_fkey
  foreign key (family_id) references public.profiles(id) on delete cascade;

create index if not exists tasks_family_id_idx on public.tasks(family_id);

-- 原表缺 created_at，待审批列表无法稳定排序
alter table public.check_in_requests
  add column if not exists created_at timestamptz not null default now();

alter table public.check_in_requests drop constraint if exists check_in_requests_status_chk;
alter table public.check_in_requests
  add constraint check_in_requests_status_chk
  check (status in ('pending', 'approved', 'rejected'));

create index if not exists check_in_requests_child_status_idx
  on public.check_in_requests(child_id, status);

create index if not exists check_ins_child_date_idx
  on public.check_ins(child_id, check_in_date);

-- ============================================================================
-- 4. rewards：奖励目录（新表）
--    child_id 为 null 表示全家通用
-- ============================================================================

create table if not exists public.rewards (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.profiles(id) on delete cascade,
  child_id    uuid references public.children(id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  points_cost int  not null check (points_cost > 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- 同一家庭内奖励名唯一（大小写不敏感），替代原来的全表 reward_name 查重
create unique index if not exists rewards_family_name_uniq
  on public.rewards(family_id, lower(btrim(name)));

create index if not exists rewards_family_idx on public.rewards(family_id, is_active);

-- ============================================================================
-- 5. redemptions：退化为纯兑换流水
-- ============================================================================

alter table public.redemptions
  add column if not exists family_id    uuid references public.profiles(id) on delete cascade,
  add column if not exists reward_id    uuid references public.rewards(id) on delete set null,
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists decided_by   uuid references public.profiles(id) on delete set null,
  add column if not exists decided_at   timestamptz;

-- is_active 属于目录语义，已迁至 rewards
alter table public.redemptions drop column if exists is_active;

alter table public.redemptions alter column status       set default 'pending';
alter table public.redemptions alter column score_before set default 0;
alter table public.redemptions alter column score_after  set default 0;

-- ----------------------------------------------------------------------------
-- 5.1 存量数据迁移
--
-- 线上实况（迁移前查证）：redemptions 6 行，全部属于孩子 xixi。
--   5 行 status='confirmed'，score_before/after 有真实差值、confirmed_at 有值
--     → 这些是真实兑换流水，保留在 redemptions。
--   1 行 status='available'，score 全 0、confirmed_at 为 null
--     → 这是"可兑换奖励"的目录条目，不是流水，迁去 rewards 后删除。
--
-- 另外 children.family_id 被老代码写成了孩子自己的 id（应为家长 id），
-- 新 RLS 以 my_family_id() 为准，不修会导致家长看不到自己的孩子。
-- ----------------------------------------------------------------------------

-- (a) 修正 children.family_id：指向家长 profile，而不是孩子自己
--     仅当该 id 确实是 role='child' 的 profile 时才动，避免误改正确数据。
update public.children c
   set family_id = (
         select p.id from public.profiles p
          where p.role = 'parent'
          order by p.created_at
          limit 1
       )
 where exists (
         select 1 from public.profiles p
          where p.id = c.family_id and p.role = 'child'
       )
   and exists (select 1 from public.profiles p2 where p2.role = 'parent');

-- (b) 目录条目迁入 rewards：从 redemptions 收集去重后的奖励名。
--     family_id 取该孩子所属家庭；child_id 留 null 表示全家通用。
insert into public.rewards (family_id, child_id, name, points_cost, is_active, created_at)
select distinct on (c.family_id, lower(btrim(r.reward_name)))
       c.family_id,
       null::uuid,
       btrim(r.reward_name),
       r.points_cost,
       true,
       r.created_at
  from public.redemptions r
  join public.children c on c.id = r.child_id
 where btrim(coalesce(r.reward_name, '')) <> ''
   and r.points_cost > 0
 order by c.family_id, lower(btrim(r.reward_name)), r.created_at
on conflict (family_id, lower(btrim(name))) do nothing;

-- (c) 回填流水的 family_id / reward_id，指向刚建好的目录
update public.redemptions r
   set family_id = c.family_id
  from public.children c
 where c.id = r.child_id
   and r.family_id is null;

update public.redemptions r
   set reward_id = w.id
  from public.rewards w
 where w.family_id = r.family_id
   and lower(btrim(w.name)) = lower(btrim(r.reward_name))
   and r.reward_id is null;

-- (d) 归一化 status。'available' 是目录语义（已在上面进 rewards），
--     其对应流水行没有扣分事实，直接删掉而不是硬塞成某种流水状态。
do $$
declare
  v_unknown text;
begin
  delete from public.redemptions
   where lower(btrim(status)) in ('available', 'active', 'catalog')
     and confirmed_at is null
     and coalesce(score_before, 0) = coalesce(score_after, 0);

  update public.redemptions set status = 'confirmed'
    where lower(btrim(status)) in ('completed','complete','approved','done','redeemed','success','confirm');

  update public.redemptions set status = 'cancelled'
    where lower(btrim(status)) in ('canceled','cancel','revoked','withdrawn');

  update public.redemptions set status = 'rejected'
    where lower(btrim(status)) in ('reject','denied','refused','declined');

  update public.redemptions set status = 'pending'
    where status is null
       or lower(btrim(status)) in ('pending_confirm','waiting','requested','new','');

  select string_agg(distinct coalesce(status, '<null>'), ', ')
    into v_unknown
    from public.redemptions
   where status not in ('pending', 'confirmed', 'cancelled', 'rejected');

  if v_unknown is not null then
    raise exception
      'redemptions.status 存在无法自动归类的取值: [%]。请确认这些行应视为 confirmed（已扣分）还是 cancelled，再补进上面的映射后重跑。',
      v_unknown;
  end if;
end $$;

alter table public.redemptions drop constraint if exists redemptions_status_chk;
alter table public.redemptions
  add constraint redemptions_status_chk
  check (status in ('pending', 'confirmed', 'cancelled', 'rejected'));

-- 同一奖励对同一孩子只允许一条待审批记录
create unique index if not exists redemptions_one_pending_uniq
  on public.redemptions(child_id, reward_id)
  where status = 'pending';

create index if not exists redemptions_family_status_idx
  on public.redemptions(family_id, status);

create index if not exists redemptions_child_confirmed_idx
  on public.redemptions(child_id, confirmed_at);

-- ============================================================================
-- 6. 原子业务 RPC
--    全部 SECURITY DEFINER：绕过 RLS，但函数内部自行校验调用者身份
-- ============================================================================

-- 6.1 家长通过打卡申请：审批 + 写流水 + 加分 + 升级，单事务完成
create or replace function public.approve_check_in(p_request_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req    public.check_in_requests;
  v_child  public.children;
  v_before int;
  v_after  int;
  v_level  int;
begin
  select * into v_req
    from public.check_in_requests
   where id = p_request_id
     for update;
  if not found then
    raise exception '打卡申请不存在';
  end if;
  if v_req.status <> 'pending' then
    raise exception '该申请已被处理，当前状态：%', v_req.status;
  end if;

  -- 行锁：并发审批在此串行化，杜绝读-改-写丢分
  select * into v_child
    from public.children
   where id = v_req.child_id
     for update;
  if not found then
    raise exception '孩子档案不存在';
  end if;

  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.role = 'parent'
       and p.family_id = v_child.family_id
  ) then
    raise exception '只有本家庭的家长可以审批打卡';
  end if;

  v_before := coalesce(v_child.total_score, 0);
  v_after  := v_before + coalesce(v_req.points, 0);
  v_level  := public.level_for_score(v_after);

  update public.check_in_requests
     set status      = 'approved',
         approved_at = now(),
         approved_by = auth.uid()
   where id = p_request_id;

  insert into public.check_ins
    (child_id, task_id, points, score_before, score_after, check_in_date)
  values
    (v_req.child_id, v_req.task_id, v_req.points, v_before, v_after, public.today_local());

  update public.children
     set total_score = v_after,
         level       = v_level,
         updated_at  = now()
   where id = v_req.child_id;

  return json_build_object(
    'points',       v_req.points,
    'score_before', v_before,
    'score_after',  v_after,
    'level_before', coalesce(v_child.level, 0),
    'level_after',  v_level
  );
end;
$$;

-- 6.2 家长拒绝打卡申请
create or replace function public.reject_check_in(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req   public.check_in_requests;
  v_child public.children;
begin
  select * into v_req
    from public.check_in_requests
   where id = p_request_id
     for update;
  if not found then
    raise exception '打卡申请不存在';
  end if;
  if v_req.status <> 'pending' then
    raise exception '该申请已被处理，当前状态：%', v_req.status;
  end if;

  select * into v_child from public.children where id = v_req.child_id;

  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.role = 'parent'
       and p.family_id = v_child.family_id
  ) then
    raise exception '只有本家庭的家长可以审批打卡';
  end if;

  update public.check_in_requests
     set status      = 'rejected',
         rejected_at = now()
   where id = p_request_id;
end;
$$;

-- 6.3 孩子申请兑换：快照奖励名与所需积分，写一条 pending 流水
create or replace function public.request_redemption(p_reward_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward public.rewards;
  v_child  public.children;
begin
  select * into v_child
    from public.children
   where id = auth.uid();
  if not found then
    raise exception '当前账号没有对应的孩子档案';
  end if;

  select * into v_reward
    from public.rewards
   where id = p_reward_id;
  if not found then
    raise exception '奖励不存在';
  end if;
  if not v_reward.is_active then
    raise exception '该奖励已停用';
  end if;
  if v_reward.family_id <> v_child.family_id then
    raise exception '该奖励不属于你的家庭';
  end if;
  if v_reward.child_id is not null and v_reward.child_id <> v_child.id then
    raise exception '该奖励不是给你的';
  end if;
  if coalesce(v_child.total_score, 0) < v_reward.points_cost then
    raise exception '积分不足，还差 % 分', v_reward.points_cost - coalesce(v_child.total_score, 0);
  end if;
  if exists (
    select 1 from public.redemptions
     where child_id = v_child.id
       and reward_id = v_reward.id
       and status = 'pending'
  ) then
    raise exception '该奖励已有一条待审批的申请';
  end if;

  insert into public.redemptions
    (family_id, child_id, reward_id, reward_name, points_cost, status, requested_at)
  values
    (v_child.family_id, v_child.id, v_reward.id, v_reward.name, v_reward.points_cost,
     'pending', now());

  return json_build_object('reward_name', v_reward.name, 'points_cost', v_reward.points_cost);
end;
$$;

-- 6.4 家长确认兑换：校验余额 + 扣分 + 回写流水，单事务完成
create or replace function public.confirm_redemption(p_redemption_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_red    public.redemptions;
  v_child  public.children;
  v_before int;
  v_after  int;
  v_level  int;
begin
  select * into v_red
    from public.redemptions
   where id = p_redemption_id
     for update;
  if not found then
    raise exception '兑换申请不存在';
  end if;
  if v_red.status <> 'pending' then
    raise exception '该兑换已被处理，当前状态：%', v_red.status;
  end if;

  select * into v_child
    from public.children
   where id = v_red.child_id
     for update;
  if not found then
    raise exception '孩子档案不存在';
  end if;

  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.role = 'parent'
       and p.family_id = v_child.family_id
  ) then
    raise exception '只有本家庭的家长可以确认兑换';
  end if;

  v_before := coalesce(v_child.total_score, 0);
  if v_before < v_red.points_cost then
    raise exception '孩子当前积分 % 分，不足 % 分，无法兑换', v_before, v_red.points_cost;
  end if;
  v_after := v_before - v_red.points_cost;
  v_level := public.level_for_score(v_after);

  update public.redemptions
     set status       = 'confirmed',
         score_before = v_before,
         score_after  = v_after,
         confirmed_at = now(),
         decided_at   = now(),
         decided_by   = auth.uid()
   where id = p_redemption_id;

  update public.children
     set total_score = v_after,
         level       = v_level,
         updated_at  = now()
   where id = v_red.child_id;

  return json_build_object(
    'reward_name',  v_red.reward_name,
    'points_cost',  v_red.points_cost,
    'score_before', v_before,
    'score_after',  v_after,
    'level_after',  v_level
  );
end;
$$;

-- 6.5 取消 / 拒绝兑换申请（家长或申请人本人）
create or replace function public.cancel_redemption(p_redemption_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_red   public.redemptions;
  v_child public.children;
begin
  select * into v_red
    from public.redemptions
   where id = p_redemption_id
     for update;
  if not found then
    raise exception '兑换申请不存在';
  end if;
  if v_red.status <> 'pending' then
    raise exception '该兑换已被处理，当前状态：%', v_red.status;
  end if;

  select * into v_child from public.children where id = v_red.child_id;

  if not (
    v_red.child_id = auth.uid()
    or exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and p.role = 'parent'
         and p.family_id = v_child.family_id
    )
  ) then
    raise exception '无权取消该兑换申请';
  end if;

  update public.redemptions
     set status     = 'cancelled',
         decided_at = now(),
         decided_by = auth.uid()
   where id = p_redemption_id;
end;
$$;

-- ============================================================================
-- 7. 注册触发器：写 profiles 并按「家长用户名」归入家庭
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     text := coalesce(new.raw_user_meta_data ->> 'role', 'child');
  v_username text := coalesce(nullif(new.raw_user_meta_data ->> 'username', ''),
                              split_part(new.email, '@', 1));
  v_code     text := nullif(btrim(new.raw_user_meta_data ->> 'family_code'), '');
  v_family   uuid;
begin
  if v_role = 'parent' then
    v_family := new.id;
  else
    -- 孩子注册必须带 family_code（登录页的「家庭代码」输入框，值为家长用户名）。
    -- 填错时直接报错而不是兜底挂到某个家长，否则孩子会静默进错家庭。
    if v_code is null then
      raise exception '请填写家庭代码（家长的用户名）';
    end if;

    select id into v_family
      from public.profiles
     where role = 'parent'
       and lower(username) = lower(v_code)
     limit 1;

    if v_family is null then
      raise exception '找不到家长账号「%」，请向家长确认用户名', v_code;
    end if;
  end if;

  insert into public.profiles (id, username, role, family_id)
  values (new.id, v_username, v_role, v_family)
  on conflict (id) do update
     set username  = excluded.username,
         role      = excluded.role,
         family_id = coalesce(profiles.family_id, excluded.family_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 8. RLS：按家庭隔离
-- ============================================================================

alter table public.profiles          enable row level security;
alter table public.children          enable row level security;
alter table public.tasks             enable row level security;
alter table public.rewards           enable row level security;
alter table public.check_in_requests enable row level security;
alter table public.check_ins         enable row level security;
alter table public.redemptions       enable row level security;

-- ---- profiles ----
-- 登录页需要在未认证状态下列出账号，故保留匿名可读（仅 id/username/role 有意义）
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles
  for select using (true);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---- children ----
drop policy if exists children_select_family on public.children;
create policy children_select_family on public.children
  for select using (family_id = public.my_family_id());

-- 孩子首次登录自建档案；家长也可代建
drop policy if exists children_insert_family on public.children;
create policy children_insert_family on public.children
  for insert with check (
    family_id = public.my_family_id()
    and (id = auth.uid() or public.is_parent())
  );

-- 积分与等级只允许 RPC 改动，这里仅放开家长改档案信息
drop policy if exists children_update_parent on public.children;
create policy children_update_parent on public.children
  for update using (family_id = public.my_family_id() and public.is_parent())
          with check (family_id = public.my_family_id());

drop policy if exists children_delete_parent on public.children;
create policy children_delete_parent on public.children
  for delete using (family_id = public.my_family_id() and public.is_parent());

-- ---- tasks ----
drop policy if exists tasks_select_family on public.tasks;
create policy tasks_select_family on public.tasks
  for select using (family_id = public.my_family_id());

drop policy if exists tasks_write_parent on public.tasks;
create policy tasks_write_parent on public.tasks
  for all using (family_id = public.my_family_id() and public.is_parent())
          with check (family_id = public.my_family_id() and public.is_parent());

-- ---- rewards ----
drop policy if exists rewards_select_family on public.rewards;
create policy rewards_select_family on public.rewards
  for select using (
    family_id = public.my_family_id()
    and (child_id is null or child_id = auth.uid() or public.is_parent())
  );

drop policy if exists rewards_write_parent on public.rewards;
create policy rewards_write_parent on public.rewards
  for all using (family_id = public.my_family_id() and public.is_parent())
          with check (family_id = public.my_family_id() and public.is_parent());

-- ---- check_in_requests ----
drop policy if exists check_in_requests_select_family on public.check_in_requests;
create policy check_in_requests_select_family on public.check_in_requests
  for select using (
    child_id in (select id from public.children where family_id = public.my_family_id())
  );

drop policy if exists check_in_requests_insert_child on public.check_in_requests;
create policy check_in_requests_insert_child on public.check_in_requests
  for insert with check (
    child_id = auth.uid()
    and status = 'pending'
    and task_id in (select id from public.tasks
                     where family_id = public.my_family_id() and is_active)
  );

-- 审批统一走 approve_check_in / reject_check_in
drop policy if exists check_in_requests_update_parent on public.check_in_requests;
create policy check_in_requests_update_parent on public.check_in_requests
  for update using (
    public.is_parent()
    and child_id in (select id from public.children where family_id = public.my_family_id())
  );

-- ---- check_ins ----
drop policy if exists check_ins_select_family on public.check_ins;
create policy check_ins_select_family on public.check_ins
  for select using (
    child_id in (select id from public.children where family_id = public.my_family_id())
  );
-- 写入仅由 approve_check_in 完成，故不建 insert/update 策略

-- ---- redemptions ----
drop policy if exists redemptions_select_family on public.redemptions;
create policy redemptions_select_family on public.redemptions
  for select using (family_id = public.my_family_id());
-- 写入仅由 request_redemption / confirm_redemption / cancel_redemption 完成

-- ============================================================================
-- 9. 授权
-- ============================================================================

grant execute on function public.my_family_id()                 to authenticated;
grant execute on function public.is_parent()                    to authenticated;
grant execute on function public.today_local()                  to authenticated, anon;
grant execute on function public.level_for_score(int)           to authenticated, anon;
grant execute on function public.approve_check_in(uuid)         to authenticated;
grant execute on function public.reject_check_in(uuid)          to authenticated;
grant execute on function public.request_redemption(uuid)       to authenticated;
grant execute on function public.confirm_redemption(uuid)       to authenticated;
grant execute on function public.cancel_redemption(uuid)        to authenticated;

commit;
