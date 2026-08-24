-- ============================================================================
-- 等级重编号：0 基 → 1 基，8 级 → 6 级；宠物去掉兔子
--
-- 起因：等级原先从 0 算起（children.level 默认 0，level_for_score 返回 max(i)-1），
-- 前端拿 level 直接当形象数组下标，于是 Lv.0 必须有个占位形象，就给所有宠物
-- （包括猫、狗）都安了一颗蛋。哺乳动物孵蛋不合逻辑，根因是 0 基编号本身。
--
-- 本次改为：
--   1. 等级 Lv.1 ~ Lv.6，Lv.1 即幼崽形态，蛋只留给卵生的鸟/龙；
--   2. 阈值 [0,40,100,200,350,550]，原先 8 级 700 分战线太长，压缩后更快见到反馈；
--   3. 兔子可用 emoji 不足以支撑六段成长，从可选宠物中移除，存量改判为猫。
--
-- 存量数据：现有 level 是 0 基的，不刷会让孩子看到自己「降了一级」。
-- 这里按 total_score 用新函数整表重算，比统一 +1 稳，顺带修掉可能已有的不一致。
--
-- 阈值与前端 src/lib/levels.ts 的 LEVEL_THRESHOLDS 必须保持一致。
--
-- 执行方式：Supabase 控制台 → SQL Editor → 粘贴执行（整体在一个事务里）
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. 积分 → 等级：返回 1..6
-- ----------------------------------------------------------------------------

-- with ordinality 的 i 从 1 开始，正好就是 1 基等级，不再减 1。
-- 积分为 0（或负数被 coalesce 兜住）时 where 至少匹配 threshold=0 那行，
-- 因此最小返回 1，不会出现 Lv.0。
create or replace function public.level_for_score(p_score int)
returns int
language sql
immutable
as $$
  select coalesce(max(t.i), 1)
    from unnest(array[0, 40, 100, 200, 350, 550])
         with ordinality as t(threshold, i)
   where coalesce(p_score, 0) >= t.threshold;
$$;

-- ----------------------------------------------------------------------------
-- 2. 新建孩子从 Lv.1 起步
-- ----------------------------------------------------------------------------

alter table public.children alter column level set default 1;

-- ----------------------------------------------------------------------------
-- 3. 存量数据迁移
-- ----------------------------------------------------------------------------

-- 兔子先转成猫，否则前端 getPetStage 会回退到猫的形象，
-- 而 pet_type 仍写着 rabbit，数据与界面不一致。
update public.children
   set pet_type   = 'cat',
       updated_at = now()
 where pet_type = 'rabbit';

-- 按新阈值整表重算等级
update public.children
   set level      = public.level_for_score(total_score),
       updated_at = now()
 where level is distinct from public.level_for_score(total_score);

-- ----------------------------------------------------------------------------
-- 4. 兜底约束：等级必须落在 1..6
-- ----------------------------------------------------------------------------

alter table public.children drop constraint if exists children_level_range;
alter table public.children
  add constraint children_level_range
  check (level between 1 and 6);

commit;
