-- ============================================================================
-- 清除遗留约束 unique_child_reward
--
-- 症状：第二次兑换同一个奖励时报
--   duplicate key value violates unique constraint "unique_child_reward"
--
-- 线上实测定义（pg_constraint 查证）：
--   unique_child_reward  UNIQUE (child_id, reward_name)
-- 是表级 UNIQUE 约束，不带任何 status 条件，因此对所有历史流水生效。
--
-- 根因：这是 001 重构之前的老 schema 遗留物。当时 redemptions 一表两用，
-- 既当「奖励目录」又当「兑换流水」，「一个孩子 + 一个奖励名」只该有一行，
-- 该约束是合理的。
--
-- 001 重构把奖励目录拆到 rewards 表，redemptions 退化为纯流水，语义随之反转：
-- 同一个孩子对同一个奖励，本就应该能反复兑换、留下多条流水。
-- 但 001 只新增了 redemptions_one_pending_uniq（带 where status='pending'
-- 的部分索引，用于防重复申请），漏了 drop 这条旧约束。
--
-- 后果：历史上任何一条 status='confirmed' 的流水都会永久占位，
-- 让同一奖励再也无法兑换第二次。孩子端和家长端代兑换都会撞。
--
-- 唯一性由 001 的部分索引承担，本迁移只做删除，不新增替代品：
--   redemptions_one_pending_uniq on (child_id, reward_id) where status = 'pending'
--
-- 执行方式：Supabase 控制台 → SQL Editor → 粘贴执行
-- 幂等：可重复执行
-- ============================================================================

begin;

-- 主目标：已确证是表级 UNIQUE 约束
alter table public.redemptions drop constraint if exists unique_child_reward;

-- 若历史上曾以裸唯一索引形态存在（不同时期建法不同），一并清掉
drop index if exists public.unique_child_reward;

-- ----------------------------------------------------------------------------
-- 兜底：清掉同表上任何「无 where 条件」的等价唯一约束
--
-- 判据用 pg_get_constraintdef 文本匹配，避免 int2vector 转数组的兼容问题。
-- 表级 UNIQUE 约束天然不带 where，所以命中即为需要清除的旧语义约束。
-- 001 建的 redemptions_one_pending_uniq 是部分索引、没有对应 constraint 记录，
-- 不会被这里扫到。
-- ----------------------------------------------------------------------------
do $$
declare
  v_rec record;
begin
  for v_rec in
    select c.conname,
           pg_get_constraintdef(c.oid) as def
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = 'redemptions'
       and c.contype = 'u'
       and (
            pg_get_constraintdef(c.oid) ~ '^UNIQUE \(child_id, reward_name\)$'
         or pg_get_constraintdef(c.oid) ~ '^UNIQUE \(child_id, reward_id\)$'
       )
  loop
    execute format('alter table public.redemptions drop constraint %I', v_rec.conname);
    raise notice '已删除遗留唯一约束 %: %', v_rec.conname, v_rec.def;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 收尾确认：防重复申请的部分索引必须还在
-- ----------------------------------------------------------------------------
create unique index if not exists redemptions_one_pending_uniq
  on public.redemptions(child_id, reward_id)
  where status = 'pending';

commit;
