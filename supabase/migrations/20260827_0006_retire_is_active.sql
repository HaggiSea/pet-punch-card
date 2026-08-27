-- ============================================================================
-- 取消任务 / 奖励的「停用」概念
--
-- 背景：原设计里 tasks.is_active 与 rewards.is_active 支持「停用」，
-- 但前端列表同时按 is_active = true 过滤，导致停用后条目在家长后台也一起消失，
-- 家长无法确认这个事项到底还在不在库里。既然「不想要就直接删除」，
-- 「停用」这一档中间状态就没有存在价值，前端已移除停用/启用按钮和状态标签。
--
-- 这条迁移做的事：把存量的 is_active = false 行回填为 true。
-- 前端现在不再按 is_active 过滤，历史上被停用过的条目会重新出现在列表里；
-- 若不回填，家长点这些条目的「打卡 / 兑换」会被 RPC 里的 is_active 校验拒绝
-- （parent_check_in / parent_redemption / request_redemption 都有这道门禁）。
--
-- 为什么不直接 drop column：该列被 3 个 SECURITY DEFINER 函数、
-- check_in_requests_insert_child 策略和 rewards_family_idx 索引依赖，
-- 删列要连带重建这些对象，对生产库动静过大。回填之后没有任何入口能再写 false，
-- 那几道校验永远为真，等于自动失效。此列即日起视为废弃字段，勿再引用。
--
-- 幂等：可重复执行。
-- 执行方式：Supabase 控制台 → SQL Editor → 粘贴执行
-- ============================================================================

begin;

update public.tasks   set is_active = true where is_active is not true;
update public.rewards set is_active = true where is_active is not true;

commit;
