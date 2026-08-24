-- ============================================================================
-- 家长代打卡
--
-- 场景：孩子完成任务时家长就在旁边，直接加分，不必让孩子先申请、家长再审批。
--
-- 设计取舍：不复用「插入 pending 申请 → 立刻调 approve_check_in」的迂回路径。
-- 那样会在 check_in_requests 里留下一条孩子从未提交过的假申请，
-- 把「申请流水」这张表的语义搞脏，后续统计申请通过率之类的口径全错。
-- 这里直接写 check_ins（打卡事实表），check_in_requests 保持只记录孩子主动申请。
--
-- 与 approve_check_in 的一致性：同样是 SECURITY DEFINER + 对 children 行加锁，
-- 积分与等级在同一事务内落库，杜绝并发丢分。
--
-- 关于重复打卡：check_ins 上没有 (child_id, task_id, check_in_date) 唯一约束，
-- 且前端今日打卡是按「N 次」聚合展示的——同一任务一天多次打卡是刻意支持的
-- （例如「读书 20 分钟」一天可以完成两轮）。故此处不做唯一性拦截，
-- 由前端显示今日已打次数供家长自行判断。
--
-- 执行方式：Supabase 控制台 → SQL Editor → 粘贴执行（整体在一个事务里）
-- ============================================================================

begin;

create or replace function public.parent_check_in(
  p_child_id uuid,
  p_task_id  uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_child  public.children;
  v_task   public.tasks;
  v_before int;
  v_after  int;
  v_level  int;
begin
  -- 行锁：与 approve_check_in 争用同一把锁，两条路径并发加分也不会互相覆盖
  select * into v_child
    from public.children
   where id = p_child_id
     for update;
  if not found then
    raise exception '孩子档案不存在';
  end if;

  -- 调用者必须是该孩子所属家庭的家长。
  -- 函数是 SECURITY DEFINER，绕过 RLS，所以这里必须自己校验，不能依赖策略。
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.role = 'parent'
       and p.family_id = v_child.family_id
  ) then
    raise exception '只有本家庭的家长可以代打卡';
  end if;

  -- 任务必须属于同一家庭且处于启用状态，防止拿别人家的任务 id 刷分
  select * into v_task
    from public.tasks
   where id = p_task_id
     and family_id = v_child.family_id
     and is_active;
  if not found then
    raise exception '任务不存在、已停用或不属于本家庭';
  end if;

  v_before := coalesce(v_child.total_score, 0);
  v_after  := v_before + coalesce(v_task.points, 0);
  v_level  := public.level_for_score(v_after);

  insert into public.check_ins
    (child_id, task_id, points, score_before, score_after, check_in_date)
  values
    (p_child_id, p_task_id, v_task.points, v_before, v_after, public.today_local());

  update public.children
     set total_score = v_after,
         level       = v_level,
         updated_at  = now()
   where id = p_child_id;

  return json_build_object(
    'task_name',    v_task.name,
    'points',       v_task.points,
    'score_before', v_before,
    'score_after',  v_after,
    'level_before', coalesce(v_child.level, 0),
    'level_after',  v_level
  );
end;
$$;

grant execute on function public.parent_check_in(uuid, uuid) to authenticated;

commit;
