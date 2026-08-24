import { supabase } from '../lib/supabaseClient';
import { useEffect, useMemo, useState } from 'react';
import { todayLocal, monthStart, monthEnd, startOfTodayIso } from '../lib/dates';
import type {
  Profile,
  Child,
  Task,
  CheckInRequest,
  CheckInRow,
  TodayCheckIn,
  TodayRedemption,
  HeatmapDatum,
  Reward,
  Redemption,
} from '../lib/types';
import Heatmap from '../components/Heatmap';
import { getPetStage, PET_KINDS, PET_TYPES } from '../lib/pets';
import { levelForScore, MIN_LEVEL } from '../lib/levels';
import { sortRewardsForDisplay, sortTasksForDisplay } from '../lib/ordering';

export default function ParentDashboard({ profile }: { profile: Profile }) {
  const [children, setChildren] = useState<Child[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pendingRequests, setPendingRequests] = useState<CheckInRequest[]>([]);
  const [pendingRedemptions, setPendingRedemptions] = useState<Redemption[]>([]);
  const [todayCheckIns, setTodayCheckIns] = useState<TodayCheckIn[]>([]);
  const [todayRedemptions, setTodayRedemptions] = useState<TodayRedemption[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapDatum[]>([]);
  const [heatmapMonth, setHeatmapMonth] = useState<Date>(new Date());
  // 代打卡：按 task_id 统计所选孩子今日已打次数，供家长判断是否重复
  const [todayCountByTask, setTodayCountByTask] = useState<Record<string, number>>({});
  // 代打卡进行中的 task_id，防止连点重复加分
  const [checkingInTaskId, setCheckingInTaskId] = useState<string>('');
  // 代兑换进行中的 reward_id，防止连点重复扣分
  const [redeemingRewardId, setRedeemingRewardId] = useState<string>('');

  // 家长首次进入默认看第一个孩子：这是派生值，不需要用 effect 回写 state
  const selectedChildForDetail = selectedChildId || children[0]?.id || '';

  // 显示顺序是派生值，新增/编辑后重新渲染就自动排好，不用在每个写操作里维护
  const sortedTasks = useMemo(() => sortTasksForDisplay(tasks), [tasks]);
  const sortedRewards = useMemo(() => sortRewardsForDisplay(rewards), [rewards]);

  // 加载子项
  useEffect(() => {
    fetchChildren();
    fetchTasks();
    fetchPendingRequests();
    fetchPendingRedemptions();
    fetchRewards();
  }, []);

  useEffect(() => {
    if (selectedChildForDetail) {
      fetchTodayCheckIns(selectedChildForDetail);
      fetchTodayRedemptions(selectedChildForDetail);
      fetchHeatmapData(selectedChildForDetail);
    }
  }, [selectedChildForDetail, heatmapMonth]);

  // --- 数据获取 ---

  // 修复 3：按 family_id 过滤，家长只能看到自己家庭的孩子
  async function fetchChildren() {
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .eq('family_id', profile.family_id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ 获取孩子列表失败:', error);
    } else {
      console.log('✅ 孩子列表:', data);
      setChildren(data || []);
    }
  }

  // 修复 3：按 family_id 过滤，避免看到别人家任务
  async function fetchTasks() {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('family_id', profile.family_id)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('获取任务列表失败:', error);
    } else {
      console.log('✅ 任务列表:', data);
      setTasks(data || []);
    }
  }

  async function fetchPendingRequests() {
    const { data, error } = await supabase
      .from('check_in_requests')
      .select('*, children(name), tasks(name, points)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('获取待审批申请失败:', error);
    } else {
      console.log('✅ 待审批打卡:', data);
      setPendingRequests(data || []);
    }
  }

  async function fetchPendingRedemptions() {
    const { data, error } = await supabase
      .from('redemptions')
      .select('*, children(name)')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });

    if (error) {
      console.error('获取待审批兑换失败:', error);
    } else {
      console.log('✅ 待审批兑换:', data);
      setPendingRedemptions(data || []);
    }
  }

  // 修复 1：只加载 active 的奖励（不再混用 status 字段）
  async function fetchRewards() {
    const { data, error } = await supabase
      .from('rewards')
      .select('*')
      .eq('family_id', profile.family_id)
      .eq('is_active', true)
      .order('points_cost', { ascending: true });

    if (error) {
      console.error('获取奖励列表失败:', error);
    } else {
      console.log('✅ 奖励列表:', data);
      setRewards(data || []);
    }
  }

  // 修复 2：使用本地日期
  async function fetchTodayCheckIns(childId: string) {
    const { data, error } = await supabase
      .from('check_ins')
      .select('*, tasks(name, points)')
      .eq('child_id', childId)
      .eq('check_in_date', todayLocal());

    if (error) {
      console.error('获取今日打卡记录失败:', error);
      return;
    }

    const taskMap: Record<string, { task_name: string; total_points: number; count: number }> = {};
    // 同一份数据顺带按 task_id 聚合：代打卡按钮要显示「今日已打 N 次」，
    // 而上面那份是按任务名聚合的，任务改名后无法与任务列表对应
    const idCount: Record<string, number> = {};

    ((data ?? []) as CheckInRow[]).forEach((item) => {
      const taskName = item.tasks?.name || '未知任务';
      const points = item.points || 0;

      if (taskMap[taskName]) {
        taskMap[taskName].count += 1;
        taskMap[taskName].total_points += points;
      } else {
        taskMap[taskName] = { task_name: taskName, total_points: points, count: 1 };
      }

      if (item.task_id) {
        idCount[item.task_id] = (idCount[item.task_id] || 0) + 1;
      }
    });

    setTodayCheckIns(
      Object.entries(taskMap).map(([name, info]) => ({
        task_name: name,
        points: info.total_points,
        count: info.count,
      }))
    );
    setTodayCountByTask(idCount);
  }

  // 修复 2：使用本地日期过滤
  async function fetchTodayRedemptions(childId: string) {
    // confirmed_at 是 timestamptz，直接拿 YYYY-MM-DD 去比会被按 UTC 零点解读，
    // 凌晨 0–8 点会漏记录，所以用本地当天 00:00 对应的 ISO 时间戳
    const { data, error } = await supabase
      .from('redemptions')
      .select('*, children(name)')
      .eq('child_id', childId)
      .eq('family_id', profile.family_id)
      .eq('status', 'confirmed')
      .gte('confirmed_at', startOfTodayIso())
      .order('confirmed_at', { ascending: false });

    if (error) {
      console.error('获取今日兑换失败:', error);
      return;
    }

    setTodayRedemptions(
      (data || []).map((r) => ({
        reward_name: r.reward_name || '未知奖励',
        points_cost: r.points_cost || 0,
        status: r.status,
        confirmed_at: r.confirmed_at || undefined,
      }))
    );
  }

  // 修复 2：使用本地日期查询
  async function fetchHeatmapData(childId: string) {
    const monthStartStr = monthStart(heatmapMonth.getFullYear(), heatmapMonth.getMonth());
    const monthEndStr = monthEnd(heatmapMonth.getFullYear(), heatmapMonth.getMonth());

    const { data, error } = await supabase
      .from('check_ins')
      .select('check_in_date')
      .eq('child_id', childId)
      .gte('check_in_date', monthStartStr)
      .lte('check_in_date', monthEndStr);

    if (error) {
      console.error('获取热力图数据失败:', error);
      return;
    }

    const map: Record<string, number> = {};
    ((data ?? []) as Pick<CheckInRow, 'check_in_date'>[]).forEach((item) => {
      const d = item.check_in_date;
      map[d] = (map[d] || 0) + 1;
    });

    const res: HeatmapDatum[] = [];
    const days = new Date(heatmapMonth.getFullYear(), heatmapMonth.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= days; i++) {
      const dateStr = `${heatmapMonth.getFullYear()}-${String(heatmapMonth.getMonth() + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      res.push({ date: dateStr, count: map[dateStr] || 0 });
    }

    setHeatmapData(res);
  }

  // --- 业务操作 ---

  /**
   * 修复 4：审批打卡走 approve_check_in RPC。
   * 原实现是客户端「读 total_score → 算新分 → 写回」，
   * 两个申请同时审批会互相覆盖导致丢分；
   * 现在审批状态、check_ins 流水、积分与等级在数据库单事务内完成，并对 children 行加锁。
   */
  async function handleApproveCheckIn(requestId: string) {
    if (!confirm('确认通过该打卡申请？')) return;

    const { data, error } = await supabase.rpc('approve_check_in', {
      p_request_id: requestId,
    });

    if (error) {
      alert('❌ ' + error.message);
      return;
    }

    const result = data as {
      points: number;
      score_after: number;
    };
    // 等级不用 RPC 返回的 level_before/level_after：那是 DB 函数算的，
    // 与前端阈值可能不同步（例如迁移还没执行时它仍是 0 基）。按积分现算最可靠。
    const levelAfter = levelForScore(result.score_after);
    const levelUp = levelAfter > levelForScore(result.score_after - result.points);
    alert(
      `✅ 已通过，+${result.points} 分，当前 ${result.score_after} 分` +
        (levelUp ? `\n🎉 宠物升级到 Lv.${levelAfter}！` : '')
    );

    await Promise.all([fetchPendingRequests(), fetchChildren()]);
    if (selectedChildForDetail) {
      await Promise.all([
        fetchTodayCheckIns(selectedChildForDetail),
        fetchHeatmapData(selectedChildForDetail),
      ]);
    }
  }

  async function handleRejectCheckIn(requestId: string) {
    if (!confirm('拒绝该打卡申请？')) return;

    const { error } = await supabase.rpc('reject_check_in', {
      p_request_id: requestId,
    });

    if (error) {
      alert('❌ ' + error.message);
    } else {
      await fetchPendingRequests();
    }
  }

  /**
   * 家长代打卡：孩子完成任务时家长就在旁边，直接加分，跳过「申请 → 审批」两步。
   *
   * 走 parent_check_in RPC 而不是「插一条 pending 申请再自动审批」：
   * 后者会在 check_in_requests 里留下孩子从未提交过的假申请，污染申请流水。
   * RPC 内部同样对 children 行加锁，与审批路径并发也不会丢分。
   */
  async function handleParentCheckIn(childId: string, taskId: string, taskName: string, points: number) {
    if (!childId) {
      alert('请先选择一个孩子');
      return;
    }
    // 连点防护：RPC 没有唯一约束拦截，重复调用会真的重复加分
    if (checkingInTaskId) return;

    const already = todayCountByTask[taskId] || 0;
    const childName = children.find((c) => c.id === childId)?.name || '孩子';
    const tip = already > 0
      ? `\n\n注意：${childName} 今天这个任务已经打过 ${already} 次了。`
      : '';
    if (!confirm(`给 ${childName} 记一次「${taskName}」，+${points} 分？${tip}`)) return;

    setCheckingInTaskId(taskId);
    const { data, error } = await supabase.rpc('parent_check_in', {
      p_child_id: childId,
      p_task_id: taskId,
    });
    setCheckingInTaskId('');

    if (error) {
      alert('❌ ' + error.message);
      return;
    }

    const result = data as {
      task_name: string;
      points: number;
      score_after: number;
    };
    // 同上：等级按积分现算，不信 RPC 返回的 level_*
    const levelAfter = levelForScore(result.score_after);
    const levelUp = levelAfter > levelForScore(result.score_after - result.points);
    alert(
      `✅ 已记录「${result.task_name}」，+${result.points} 分，当前 ${result.score_after} 分` +
        (levelUp ? `\n🎉 宠物升级到 Lv.${levelAfter}！` : '')
    );

    await Promise.all([
      fetchChildren(),
      fetchTodayCheckIns(childId),
      fetchHeatmapData(childId),
    ]);
  }

  /**
   * 修复 4：确认兑换走 confirm_redemption RPC。
   * 余额校验、扣分、流水回写在数据库单事务内完成并对 children 行加锁，
   * 避免原来「查余额 → 改流水 → 扣分」三步之间被并发插队导致扣成负分。
   */
  async function handleApproveRedemption(id: string) {
    if (!confirm('确认兑换？将扣除孩子积分。')) return;

    const { data, error } = await supabase.rpc('confirm_redemption', {
      p_redemption_id: id,
    });

    if (error) {
      alert('❌ ' + error.message);
      return;
    }

    const result = data as { reward_name: string; points_cost: number; score_after: number };
    alert(
      `✅ 已确认兑换「${result.reward_name}」，扣 ${result.points_cost} 分，剩余 ${result.score_after} 分`
    );

    await Promise.all([fetchPendingRedemptions(), fetchChildren()]);
    if (selectedChildForDetail) {
      await fetchTodayRedemptions(selectedChildForDetail);
    }
  }

  async function handleRejectRedemption(id: string) {
    if (!confirm('拒绝兑换申请？')) return;

    const { error } = await supabase.rpc('cancel_redemption', {
      p_redemption_id: id,
    });

    if (error) {
      alert('❌ ' + error.message);
    } else {
      await fetchPendingRedemptions();
    }
  }

  // --- 孩子档案管理 ---

  /**
   * 家长为孩子建档。
   * children.id 必须等于孩子的 auth uid（RLS 与外键都依赖这一点），
   * 客户端无法凭家长身份创建 auth 用户，所以流程是：
   * 孩子先自行注册账号 → 注册触发器把 profile 归入本家庭 → 家长在这里建宠物档案。
   */
  async function handleAddChild() {
    // 找出本家庭里还没有档案的孩子账号
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('role', 'child')
      .eq('family_id', profile.family_id);

    if (profErr) {
      alert('查询孩子账号失败: ' + profErr.message);
      return;
    }

    const existing = new Set(children.map((c) => c.id));
    const candidates = (profiles || []).filter((p) => !existing.has(p.id));

    if (candidates.length === 0) {
      alert(
        '没有待建档的孩子账号。\n\n' +
          '请先让孩子在登录页选「🧒 孩子」并注册一个账号，\n' +
          `注册时家庭代码填家长用户名「${profile.username}」，然后再回到这里添加。`
      );
      return;
    }

    const list = candidates.map((c, i) => `${i + 1}. ${c.username}`).join('\n');
    const pick = parseInt(prompt(`选择要建档的孩子（输入序号）：\n${list}`) || '0');
    if (isNaN(pick) || pick < 1 || pick > candidates.length) return;

    const target = candidates[pick - 1];
    const name = prompt('宠物主人的名字：', target.username);
    if (!name || !name.trim()) return;

    // 列出中文名 + 成长路线，家长选之前能看到宠物会长成什么样
    const petList = PET_KINDS.map(
      (k, i) => `${i + 1}. ${k.label}  ${k.stages.map(s => s.emoji).join(' → ')}`
    ).join('\n');
    const petPick = parseInt(prompt(`选择宠物种类：\n${petList}`) || '1');
    const petType = PET_TYPES[isNaN(petPick) ? 0 : petPick - 1] || PET_TYPES[0];

    const { error } = await supabase.from('children').insert({
      id: target.id,
      family_id: profile.family_id,
      name: name.trim(),
      pet_type: petType,
      total_score: 0,
      level: MIN_LEVEL,
    });

    if (error) {
      alert('建档失败: ' + error.message);
    } else {
      alert(`✅ 已为 ${name.trim()} 创建宠物档案`);
      await fetchChildren();
    }
  }

  // --- 任务管理 ---

  async function handleAddTask(name: string, category: string, points: number) {
    if (!name.trim() || !points || points <= 0) {
      alert('请填写有效名称和积分');
      return;
    }
    const { error } = await supabase.from('tasks').insert({
      family_id: profile.family_id,
      name: name.trim(),
      category: category.trim() || '日常',
      points,
      is_active: true,
    });
    if (error) {
      alert('添加失败: ' + error.message);
    } else {
      alert('✅ 任务添加成功！');
      await fetchTasks();
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm('确定要永久删除这个任务吗？')) return;
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) {
      alert('删除失败: ' + error.message);
    } else {
      alert('🗑️ 任务已删除');
      await fetchTasks();
    }
  }

  // --- 奖励管理（修复 1：分离奖励目录与兑换流水） ---

  async function handleAddReward(name: string, pointsCost: number) {
    if (!name.trim() || !pointsCost || pointsCost <= 0) {
      alert('请填写有效名称和积分');
      return;
    }
    const { error } = await supabase.from('rewards').insert({
      family_id: profile.family_id,
      name: name.trim(),
      points_cost: pointsCost,
      is_active: true,
    });
    if (error) {
      alert('添加失败: ' + error.message);
    } else {
      alert('✅ 奖励添加成功！');
      await fetchRewards();
    }
  }

  async function handleToggleReward(id: string, active: boolean) {
    const { error } = await supabase.from('rewards').update({ is_active: !active }).eq('id', id);
    if (error) {
      alert('操作失败: ' + error.message);
    } else {
      alert(`✅ 已${active ? '停用' : '启用'}奖励`);
      await fetchRewards();
    }
  }

  async function handleEditReward(id: string, name: string, pointsCost: number) {
    if (!name.trim() || !pointsCost || pointsCost <= 0) {
      alert('请填写有效名称和积分');
      return;
    }
    const { error } = await supabase
      .from('rewards')
      .update({ name: name.trim(), points_cost: pointsCost })
      .eq('id', id);
    if (error) {
      alert('更新失败: ' + error.message);
    } else {
      alert('✅ 奖励已更新');
      await fetchRewards();
    }
  }

  /**
   * 家长代兑换：奖励当面给出去时直接扣分，跳过「孩子申请 → 家长审批」两步。
   *
   * 走 parent_redemption RPC 而不是「插一条 pending 流水再自动确认」：
   * 后者会在 redemptions 里留下孩子从未提交过的申请记录，污染申请语义。
   * RPC 内部对 children 行加锁，与审批路径并发也不会扣成负分。
   */
  async function handleParentRedeem(rewardId: string, rewardName: string, pointsCost: number) {
    const childId = selectedChildForDetail;
    if (!childId) {
      alert('请先在上方选择一个孩子');
      return;
    }
    // 连点防护：RPC 不做幂等，重复调用会真的重复扣分
    if (redeemingRewardId) return;

    const childObj = children.find((c) => c.id === childId);
    const childName = childObj?.name || '孩子';
    const score = childObj?.total_score ?? 0;

    if (score < pointsCost) {
      alert(`${childName} 当前 ${score} 分，兑换「${rewardName}」需要 ${pointsCost} 分，还差 ${pointsCost - score} 分。`);
      return;
    }
    if (!confirm(`给 ${childName} 兑换「${rewardName}」，扣 ${pointsCost} 分？\n\n当前 ${score} 分，兑换后剩 ${score - pointsCost} 分。`)) return;

    setRedeemingRewardId(rewardId);
    const { data, error } = await supabase.rpc('parent_redemption', {
      p_child_id: childId,
      p_reward_id: rewardId,
    });
    setRedeemingRewardId('');

    if (error) {
      alert('❌ ' + error.message);
      return;
    }

    const result = data as {
      child_name: string;
      reward_name: string;
      points_cost: number;
      score_after: number;
    };
    // 同上：等级按积分现算，不信 RPC 返回的 level_*
    const levelAfter = levelForScore(result.score_after);
    const levelDown = levelAfter < levelForScore(result.score_after + result.points_cost);
    alert(
      `🎁 已为 ${result.child_name} 兑换「${result.reward_name}」，扣 ${result.points_cost} 分，剩余 ${result.score_after} 分` +
        (levelDown ? `\n宠物等级回落到 Lv.${levelAfter}` : '')
    );

    await Promise.all([fetchChildren(), fetchTodayRedemptions(childId)]);
  }

  async function handleDeleteReward(id: string) {
    if (!confirm('确定要永久删除这个奖励？')) return;
    const { error } = await supabase.from('rewards').delete().eq('id', id);
    if (error) {
      alert('删除失败: ' + error.message);
    } else {
      alert('🗑️ 奖励已删除');
      await fetchRewards();
    }
  }

  // 必须等 signOut 落盘再跳转：不 await 的话页面已经开始卸载，
  // localStorage 里的 session 没清掉，重新加载后 getSession() 又把人送回 /dashboard
  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  // --- 渲染 ---

  if (!profile?.id) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">用户信息加载失败，请重新登录</p>
          <button onClick={handleLogout} className="mt-2 text-blue-500 underline">
            重新登录
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-50">
      {/* 顶栏窄屏收窄内边距，标题降一号，避免和右侧「家庭/退出」挤在一起 */}
      <nav className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-white px-3 py-3 shadow sm:px-4 sm:py-4">
        <h1 className="truncate text-base font-bold text-blue-600 sm:text-xl">👨‍👩‍👦 家长后台</h1>
        <div className="flex flex-none items-center gap-2 text-sm sm:gap-4">
          {/* 用户名在窄屏没必要占位，隐藏后「退出」按钮才有舒展空间 */}
          <span className="hidden truncate text-gray-500 sm:inline">家庭：{profile.username}</span>
          <button
            onClick={handleLogout}
            className="rounded bg-red-500 px-3 py-1.5 text-sm text-white active:bg-red-600"
          >
            退出
          </button>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl space-y-4 p-3 pb-10 sm:space-y-6 sm:p-6">
        {/* 孩子列表 */}
        <section className="bg-white p-4 sm:p-6 rounded-xl shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-bold sm:text-xl">👶 家庭成员</h2>
            <button
              onClick={handleAddChild}
              className="bg-green-500 text-white px-3 py-1.5 rounded text-sm hover:bg-green-600"
            >
              + 添加孩子
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 sm:gap-4">
            {children.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedChildId(c.id)}
                className={`text-left p-4 rounded-lg border ${
                  selectedChildForDetail === c.id
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="text-4xl">
                    {getPetStage(c.pet_type, levelForScore(c.total_score)).emoji}
                  </div>
                  <div>
                    <h3 className="font-bold">{c.name}</h3>
                    <p className="text-sm text-gray-500">
                      Lv.{levelForScore(c.total_score)}{' '}
                      {getPetStage(c.pet_type, levelForScore(c.total_score)).name} ·{' '}
                      {c.total_score} 分
                    </p>
                  </div>
                </div>
              </button>
            ))}
            {children.length === 0 && <p className="text-gray-500">暂无孩子档案，请先添加</p>}
          </div>
        </section>

        {/* 待审批事项 */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 sm:gap-6">
          {/* 打卡审批 */}
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow">
            <h3 className="mb-3 flex items-center justify-between text-base font-bold sm:mb-4 sm:text-lg">
              <span>⏳ 打卡审批</span>
              <span className="text-sm bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                {pendingRequests.length}
              </span>
            </h3>
            {pendingRequests.length === 0 ? (
              <p className="text-gray-400 text-sm">暂无待审批申请</p>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex flex-col gap-2 rounded-lg border bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"
                  >
                    <div>
                      <p className="font-medium">{req.children?.name || '孩子'}</p>
                      <p className="text-sm text-gray-500">
                        申请 {req.tasks?.name}（+{req.points}分）
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(req.created_at).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          handleApproveCheckIn(req.id)
                        }
                        className="bg-green-500 text-white px-3 py-1.5 rounded text-sm"
                      >
                        ✅ 同意
                      </button>
                      <button
                        onClick={() => handleRejectCheckIn(req.id)}
                        className="bg-red-500 text-white px-3 py-1.5 rounded text-sm"
                      >
                        ❌ 拒绝
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 兑换审批 */}
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow">
            <h3 className="mb-3 flex items-center justify-between text-base font-bold sm:mb-4 sm:text-lg">
              <span>🎁 兑换审批</span>
              <span className="text-sm bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                {pendingRedemptions.length}
              </span>
            </h3>
            {pendingRedemptions.length === 0 ? (
              <p className="text-gray-400 text-sm">暂无待审批兑换</p>
            ) : (
              <div className="space-y-3">
                {pendingRedemptions.map((red) => (
                  <div
                    key={red.id}
                    className="flex flex-col gap-2 rounded-lg border bg-yellow-50 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"
                  >
                    <div>
                      <p className="font-medium">{red.children?.name || '孩子'}</p>
                      <p className="text-sm text-gray-500">
                        申请 {red.reward_name}（-{red.points_cost}分）
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(red.requested_at).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          handleApproveRedemption(red.id)
                        }
                        className="bg-green-500 text-white px-3 py-1.5 rounded text-sm"
                      >
                        ✅ 确认
                      </button>
                      <button
                        onClick={() => handleRejectRedemption(red.id)}
                        className="bg-red-500 text-white px-3 py-1.5 rounded text-sm"
                      >
                        ❌ 拒绝
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 今日统计 */}
        {selectedChildForDetail && (
          <>
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 sm:gap-6">
              {/* 今日打卡 */}
              <div className="bg-white p-4 sm:p-6 rounded-xl shadow">
                <h3 className="mb-3 text-base font-bold sm:mb-4 sm:text-lg">📋 今日打卡 · {children.find(c => c.id === selectedChildForDetail)?.name}</h3>
                {todayCheckIns.length === 0 ? (
                  /* 空态与有数据时同样左对齐，且不再撑高：居中+大留白会让并列的两张卡看起来歪 */
                  <p className="text-sm text-gray-400">今日还没有打卡记录</p>
                ) : (
                  <div className="space-y-2">
                    {todayCheckIns.map((item, i) => (
                      <div key={i} className="flex justify-between border-b pb-2">
                        <span className="text-gray-700">{item.task_name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-500">{item.count} 次</span>
                          <span className="text-blue-600 font-medium">+{item.points} 分</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 今日兑换 */}
              <div className="bg-white p-4 sm:p-6 rounded-xl shadow">
                <h3 className="mb-3 text-base font-bold sm:mb-4 sm:text-lg">🎁 今日兑换 · {children.find(c => c.id === selectedChildForDetail)?.name}</h3>
                {todayRedemptions.length === 0 ? (
                  <p className="text-sm text-gray-400">今日还没有兑换记录</p>
                ) : (
                  <div className="space-y-2">
                    {todayRedemptions.map((item, i) => (
                      <div key={i} className="flex justify-between border-b pb-2">
                        <span className="text-gray-700">{item.reward_name}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-500">-{item.points_cost} 分</span>
                          {item.confirmed_at && (
                            <span className="text-xs text-gray-400">
                              {new Date(item.confirmed_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* 热力图 */}
            <Heatmap
              title="📅 近期打卡"
              data={heatmapData}
              month={heatmapMonth}
              onMonthChange={setHeatmapMonth}
              accent="blue"
            />
          </>
        )}

        {/* 任务管理 */}
        <section className="bg-white p-4 sm:p-6 rounded-xl shadow">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold">📋 任务管理</h3>
            <button
              onClick={() => {
                const name = prompt('任务名称：');
                const category = prompt('分类（可选）：', '日常');
                const points = parseInt(prompt('积分：') || '0');
                if (name) handleAddTask(name, category || '', points);
              }}
              className="bg-blue-500 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-600"
            >
              + 添加任务
            </button>
          </div>
          {tasks.length === 0 ? (
            <p className="text-gray-400 text-sm">暂无任务</p>
          ) : (
            <div className="space-y-2">
              {sortedTasks.map((t) => (
                /*
                  窄屏改成上下两层：任务名+标签在上，操作按钮独占一行。
                  原先左右分栏时名称列被压到两三字宽，「阅读30分钟」这种被折成三行。
                  sm 以上恢复左右分栏。
                */
                <div
                  key={t.id}
                  className="flex flex-col gap-2 border-b pb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`font-medium ${t.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                      {t.name}
                    </span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
                      {t.category}
                    </span>
                    <span className="text-xs font-bold text-green-600">+{t.points}分</span>
                    <span className={`text-[11px] ${t.is_active ? 'text-green-600' : 'text-red-500'}`}>
                      {t.is_active ? '运行中' : '已停用'}
                    </span>
                  </div>
                  {/* 按钮组不收缩，保证点击区不被名称挤瘦 */}
                  <div className="flex flex-none gap-1.5">
                    {/* 代打卡：孩子当面完成任务时家长直接加分，不必等孩子申请 */}
                    {t.is_active && (
                      <button
                        onClick={() =>
                          handleParentCheckIn(selectedChildForDetail, t.id, t.name, t.points)
                        }
                        disabled={Boolean(checkingInTaskId) || !selectedChildForDetail}
                        title={
                          selectedChildForDetail
                            ? `给 ${children.find((c) => c.id === selectedChildForDetail)?.name} 记一次`
                            : '请先在上方选择一个孩子'
                        }
                        className="text-xs bg-blue-500 text-white px-2.5 py-1.5 rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        {checkingInTaskId === t.id ? '...' : '打卡'}
                        {(todayCountByTask[t.id] || 0) > 0 && (
                          <span className="ml-1 opacity-80">({todayCountByTask[t.id]})</span>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const name = prompt('任务名称：', t.name);
                        const category = prompt('分类：', t.category);
                        const points = parseInt(prompt('积分：', String(t.points)) || '0');
                        if (name) {
                          supabase.from('tasks').update({ name: name.trim(), category: category?.trim() || '日常', points }).eq('id', t.id).then(({ error }) => {
                            if (error) alert('更新失败: ' + error.message);
                            else { alert('✅ 已更新'); fetchTasks(); }
                          });
                        }
                      }}
                      className="text-xs bg-yellow-500 text-white px-2.5 py-1.5 rounded hover:bg-yellow-600"
                    >
                      编辑
                    </button>
                    {t.is_active ? (
                      <button
                        onClick={() => {
                          supabase.from('tasks').update({ is_active: false }).eq('id', t.id).then(({ error }) => {
                            if (error) alert('操作失败: ' + error.message);
                            else { alert('已停用'); fetchTasks(); }
                          });
                        }}
                        className="text-xs bg-gray-500 text-white px-2.5 py-1.5 rounded hover:bg-gray-600"
                      >
                        停用
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          supabase.from('tasks').update({ is_active: true }).eq('id', t.id).then(({ error }) => {
                            if (error) alert('操作失败: ' + error.message);
                            else { alert('已启用'); fetchTasks(); }
                          });
                        }}
                        className="text-xs bg-green-500 text-white px-2.5 py-1.5 rounded hover:bg-green-600"
                      >
                        启用
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteTask(t.id)}
                      className="text-xs bg-red-500 text-white px-2.5 py-1.5 rounded hover:bg-red-600"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 奖励管理 */}
        <section className="bg-white p-4 sm:p-6 rounded-xl shadow">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold">🎁 奖励管理</h3>
            <button
              onClick={() => {
                const name = prompt('奖励名称：');
                const points = parseInt(prompt('所需积分：') || '0');
                if (name) handleAddReward(name, points);
              }}
              className="bg-purple-500 text-white px-3 py-1.5 rounded text-sm hover:bg-purple-600"
            >
              + 添加奖励
            </button>
          </div>
          {rewards.length === 0 ? (
            <p className="text-gray-400 text-sm">暂无奖励</p>
          ) : (
            <div className="space-y-2">
              {sortedRewards.map((r) => (
                /* 与任务行同构：窄屏上下两层，避免「100元以内玩具」被折行 */
                <div
                  key={r.id}
                  className="flex flex-col gap-2 border-b pb-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`font-medium ${r.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                      {r.name}
                    </span>
                    <span className="text-xs font-bold text-purple-600">{r.points_cost}分</span>
                    <span className={`text-[11px] ${r.is_active ? 'text-green-600' : 'text-red-500'}`}>
                      {r.is_active ? '可兑换' : '已停用'}
                    </span>
                  </div>
                  <div className="flex flex-none gap-1.5">
                    {/* 代兑换：奖励当面给出去时家长直接扣分，不必等孩子在自己端申请 */}
                    {r.is_active && (
                      <button
                        onClick={() => handleParentRedeem(r.id, r.name, r.points_cost)}
                        disabled={Boolean(redeemingRewardId) || !selectedChildForDetail}
                        title={
                          selectedChildForDetail
                            ? `给 ${children.find((c) => c.id === selectedChildForDetail)?.name} 兑换，扣 ${r.points_cost} 分`
                            : '请先在上方选择一个孩子'
                        }
                        className="text-xs bg-purple-500 text-white px-2.5 py-1.5 rounded hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                      >
                        {redeemingRewardId === r.id ? '...' : '兑换'}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        const name = prompt('名称：', r.name);
                        const cost = parseInt(prompt('积分：', String(r.points_cost)) || '0');
                        if (name) handleEditReward(r.id, name, cost);
                      }}
                      className="text-xs bg-yellow-500 text-white px-2.5 py-1.5 rounded hover:bg-yellow-600"
                    >
                      编辑
                    </button>
                    {r.is_active ? (
                      <button
                        onClick={() => handleToggleReward(r.id, true)}
                        className="text-xs bg-gray-500 text-white px-2.5 py-1.5 rounded hover:bg-gray-600"
                      >
                        停用
                      </button>
                    ) : (
                      <button
                        onClick={() => handleToggleReward(r.id, false)}
                        className="text-xs bg-green-500 text-white px-2.5 py-1.5 rounded hover:bg-green-600"
                      >
                        启用
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteReward(r.id)}
                      className="text-xs bg-red-500 text-white px-2.5 py-1.5 rounded hover:bg-red-600"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
