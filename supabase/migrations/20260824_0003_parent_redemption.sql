-- ============================================================================
-- 家长代兑换奖励
--
-- 场景：奖励就在眼前（家长手上的零食、周末的游乐场），孩子不必先在自己端申请、
-- 家长再去审批。家长在奖励管理里点「兑换」，选孩子，一步扣分完成。
--
-- 设计取舍：不复用「插一条 pending 流水 → 立刻调 confirm_redemption」的迂回路径。
-- 那样会在 redemptions 里留下一条孩子从未提交过的假申请状态流转
-- （requested_at 是家长点按钮的时间，语义上冒充了孩子的申请动作）。
-- 这里直接写一条 status='confirmed' 的流水，requested_at 与 confirmed_at 同为 now()，
-- decided_by 记家长，事后能与孩子主动申请的记录区分开（看 requested_at/confirmed_at 是否相等）。
--
-- 与 confirm_redemption 的一致性：同样 SECURITY DEFINER + 对 children 行 for update 加锁，
-- 余额校验、扣分、等级重算、流水落库都在同一事务内，和审批路径并发也不会扣成负分。
--
-- 执行方式：Supabase 控制台 → SQL Editor → 粘贴执行（整体在一个事务里）
-- ============================================================================

begin;

create or replace function public.parent_redemption(
  p_child_id  uuid,
  p_reward_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child  public.children;
  v_reward public.rewards;
  v_before int;
  v_after  int;
  v_level  int;
begin
  -- 行锁：与 confirm_redemption / parent_check_in 争用同一把锁
  select * into v_child
    from public.children
   where id = p_child_id
     for update;
  if not found then
    raise exception '孩子档案不存在';
  end if;

  -- 函数绕过 RLS，调用方身份必须自己校验
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.role = 'parent'
       and p.family_id = v_child.family_id
  ) then
    raise exception '只有本家庭的家长可以代兑换';
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
    raise exception '该奖励不属于本家庭';
  end if;
  -- 专属奖励不能兑给别的孩子
  if v_reward.child_id is not null and v_reward.child_id <> v_child.id then
    raise exception '该奖励是给其他孩子的专属奖励';
  end if;

  v_before := coalesce(v_child.total_score, 0);
  if v_before < v_reward.points_cost then
    raise exception '% 当前 % 分，不足 % 分', v_child.name, v_before, v_reward.points_cost;
  end if;

  -- 同一奖励已有孩子提交的待审批申请：直接扣分会让那条申请事后再扣一次，
  -- 让家长去审批区处理，不在这里静默吞掉
  if exists (
    select 1 from public.redemptions
     where child_id  = v_child.id
       and reward_id = v_reward.id
       and status    = 'pending'
  ) then
    raise exception '该奖励已有一条待审批的兑换申请，请到「兑换审批」里直接通过';
  end if;

  v_after := v_before - v_reward.points_cost;
  v_level := public.level_for_score(v_after);

  insert into public.redemptions
    (family_id, child_id, reward_id, reward_name, points_cost, status,
     score_before, score_after, requested_at, confirmed_at, decided_at, decided_by)
  values
    (v_child.family_id, v_child.id, v_reward.id, v_reward.name, v_reward.points_cost,
     'confirmed', v_before, v_after, now(), now(), now(), auth.uid());

  update public.children
     set total_score = v_after,
         level       = v_level,
         updated_at  = now()
   where id = v_child.id;

  return json_build_object(
    'child_name',   v_child.name,
    'reward_name',  v_reward.name,
    'points_cost',  v_reward.points_cost,
    'score_before', v_before,
    'score_after',  v_after,
    'level_before', coalesce(v_child.level, 0),
    'level_after',  v_level
  );
end;
$$;

grant execute on function public.parent_redemption(uuid, uuid) to authenticated;

commit;
