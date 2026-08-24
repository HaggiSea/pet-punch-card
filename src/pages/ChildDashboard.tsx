import { supabase } from '../lib/supabaseClient';
import { useEffect, useState } from 'react';
import { todayLocal, monthStart, monthEnd, startOfTodayIso } from '../lib/dates';
import { levelProgress } from '../lib/levels';
import { getPetLabel, getPetStage } from '../lib/pets';
import type {
  Profile,
  Child,
  Task,
  Reward,
  CheckInRequest,
  CheckInRow,
  TodayCheckIn,
  TodayRedemption,
  HeatmapDatum,
} from '../lib/types';
import Heatmap from '../components/Heatmap';

export default function ChildDashboard({ profile }: { profile: Profile }) {
  const [child, setChild] = useState<Child | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pendingRequests, setPendingRequests] = useState<CheckInRequest[]>([]);
  const [pendingRewardIds, setPendingRewardIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // 没有 profile 就没什么可加载的，初值直接表达，无需 effect 回写
  const [isLoading, setIsLoading] = useState(Boolean(profile?.id));

  const [todayCheckIns, setTodayCheckIns] = useState<TodayCheckIn[]>([]);
  const [todayRedemptions, setTodayRedemptions] = useState<TodayRedemption[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapDatum[]>([]);
  const [heatmapMonth, setHeatmapMonth] = useState<Date>(new Date());

  useEffect(() => {
    if (profile?.id) {
      fetchChildInfo();
    }
  }, [profile?.id]);

  useEffect(() => {
    if (child?.id) {
      fetchTasks();
      fetchPendingRequests();
      fetchRewards();
      fetchPendingRedemptions();
      fetchTodayCheckIns();
      fetchTodayRedemptions();
    }
  }, [child?.id]);

  useEffect(() => {
    if (child?.id) fetchHeatmapData();
  }, [child?.id, heatmapMonth]);

  /**
   * 修复 3：孩子档案通过 profiles.family_id 定位，不再自动建档。
   * 原实现在查不到档案时用 `family_id: profile.id`（孩子自己的 id）插入 children，
   * 而 tasks 用的是家长 id，两者语义冲突，家长端因此一个孩子都查不到。
   * 现在建档统一由家长在家长端完成。
   */
  async function fetchChildInfo() {
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .eq('id', profile.id)
      .maybeSingle();

    if (error) {
      console.error('❌ 查询孩子信息失败:', error);
      setMessage('加载失败，请稍后重试');
      setIsLoading(false);
      return;
    }

    if (!data) {
      setMessage(
        profile.family_id
          ? '还没有你的宠物档案，请让家长在家长端点「+ 添加孩子」'
          : '账号还没有加入家庭，请让家长在家长端添加你'
      );
      setIsLoading(false);
      return;
    }

    setChild(data);
    setIsLoading(false);
  }

  // 修复 1：奖励目录读 rewards 表，不再从 redemptions 里筛
  async function fetchRewards() {
    if (!child) return;

    const { data, error } = await supabase
      .from('rewards')
      .select('*')
      .eq('family_id', child.family_id)
      .eq('is_active', true)
      .or(`child_id.is.null,child_id.eq.${child.id}`)
      .order('points_cost', { ascending: true });

    if (error) {
      console.error('❌ 获取奖励列表失败:', error);
    } else {
      setRewards(data || []);
    }
  }

  // 待审批的兑换申请，用于把奖励按钮置为「等待审批」
  async function fetchPendingRedemptions() {
    if (!child) return;

    const { data, error } = await supabase
      .from('redemptions')
      .select('reward_id')
      .eq('child_id', child.id)
      .eq('status', 'pending');

    if (error) {
      console.error('❌ 获取待审批兑换失败:', error);
      return;
    }

    setPendingRewardIds(
      new Set(
        (data ?? [])
          .map((r) => r.reward_id)
          .filter((id): id is string => Boolean(id))
      )
    );
  }

  // 修复 3：任务按家庭过滤
  async function fetchTasks() {
    if (!child) return;

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('family_id', child.family_id)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('❌ 获取任务列表失败:', error);
    } else {
      setTasks(data || []);
    }
  }

  async function fetchPendingRequests() {
    if (!child) return;

    const { data, error } = await supabase
      .from('check_in_requests')
      .select('*, tasks(name, points)')
      .eq('child_id', child.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ 获取待审批申请失败:', error);
    } else {
      setPendingRequests(data || []);
    }
  }

  // 修复 2：本地日期
  async function fetchTodayCheckIns() {
    if (!child) return;

    const { data, error } = await supabase
      .from('check_ins')
      .select('*, tasks(name, points)')
      .eq('child_id', child.id)
      .eq('check_in_date', todayLocal());

    if (error) {
      console.error('获取今日打卡记录失败:', error);
      return;
    }

    const taskMap: Record<string, { points: number; count: number }> = {};
    ((data ?? []) as CheckInRow[]).forEach((item) => {
      const name = item.tasks?.name || '未知任务';
      const points = item.points || 0;
      if (taskMap[name]) {
        taskMap[name].points += points;
        taskMap[name].count += 1;
      } else {
        taskMap[name] = { points, count: 1 };
      }
    });

    setTodayCheckIns(
      Object.entries(taskMap).map(([task_name, v]) => ({
        task_name,
        points: v.points,
        count: v.count,
      }))
    );
  }

  // 修复 2：confirmed_at 是 timestamptz，用本地当天 00:00 的 ISO 时间戳过滤
  async function fetchTodayRedemptions() {
    if (!child) return;

    const { data, error } = await supabase
      .from('redemptions')
      .select('reward_name, points_cost, status, confirmed_at')
      .eq('child_id', child.id)
      .eq('status', 'confirmed')
      .gte('confirmed_at', startOfTodayIso())
      .order('confirmed_at', { ascending: false });

    if (error) {
      console.error('获取今日兑换记录失败:', error);
    } else {
      setTodayRedemptions(data || []);
    }
  }

  // 修复 2：月份边界用本地日期计算
  async function fetchHeatmapData() {
    if (!child) return;

    const year = heatmapMonth.getFullYear();
    const month = heatmapMonth.getMonth();

    const { data, error } = await supabase
      .from('check_ins')
      .select('check_in_date')
      .eq('child_id', child.id)
      .gte('check_in_date', monthStart(year, month))
      .lte('check_in_date', monthEnd(year, month));

    if (error) {
      console.error('获取热力图数据失败:', error);
      return;
    }

    const counts: Record<string, number> = {};
    ((data ?? []) as Pick<CheckInRow, 'check_in_date'>[]).forEach((item) => {
      counts[item.check_in_date] = (counts[item.check_in_date] || 0) + 1;
    });

    const days = new Date(year, month + 1, 0).getDate();
    const result: HeatmapDatum[] = [];
    for (let d = 1; d <= days; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      result.push({ date: dateStr, count: counts[dateStr] || 0 });
    }

    setHeatmapData(result);
  }

  async function handleRequestCheckIn(taskId: string, points: number) {
    if (!child) return;

    setBusy(true);
    setMessage('');

    const { error } = await supabase.from('check_in_requests').insert({
      child_id: child.id,
      task_id: taskId,
      points,
      status: 'pending',
    });

    if (error) {
      setMessage('❌ 申请失败：' + error.message);
    } else {
      setMessage('✅ 打卡申请已提交，等待家长审批');
      await fetchPendingRequests();
    }
    setBusy(false);
  }

  /**
   * 修复 1 + 4：申请兑换走 request_redemption RPC。
   * 原实现是把奖励目录行的 status 直接改成 'pending'（因为目录和流水共用一张表），
   * 一旦审批就把目录项本身消耗掉了，同一奖励无法二次兑换。
   * 现在 RPC 会在 redemptions 里插入一条独立流水，目录项保持不变。
   */
  async function handleApplyReward(rewardId: string) {
    if (!child) return;

    setBusy(true);
    setMessage('');

    const { error } = await supabase.rpc('request_redemption', {
      p_reward_id: rewardId,
    });

    if (error) {
      setMessage('❌ ' + error.message);
    } else {
      setMessage('✅ 兑换申请已提交，等待家长审批');
      await fetchPendingRedemptions();
    }
    setBusy(false);
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const totalTodayPoints = todayCheckIns.reduce((s, i) => s + i.points, 0);
  const totalTodayCost = todayRedemptions.reduce((s, i) => s + i.points_cost, 0);

  // 修复 4：等级与进度统一取自 lib/levels，不再在页面里硬编码阈值
  const progress = levelProgress(child?.total_score || 0);
  // 等级一律由积分现算，不读 children.level 列。
  // 那一列是 DB 冗余存储，历史上是 0 基（Lv.0），迁移未执行或将来漏刷时会显示错等级；
  // 积分才是唯一真相，派生值就地算不会有第二份真相。
  const petLevel = progress.level;
  // 形象按等级取。宠物档案还没建好时给个占位，下面 child 为空的分支不会用到它
  const petStage = getPetStage(child?.pet_type || '', petLevel);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </div>
    );
  }

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
    <div className="min-h-screen bg-purple-50">
      <nav className="bg-white shadow p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-purple-600">🐾 我的宠物</h1>
        <button onClick={handleLogout} className="bg-red-500 text-white px-3 py-1 rounded text-sm">
          退出
        </button>
      </nav>

      <div className="p-6 max-w-2xl mx-auto">
        {/* 宠物展示 */}
        {child ? (
          <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
            <div className="text-8xl mb-4">{petStage.emoji}</div>
            <h2 className="text-2xl font-bold">{child.name}</h2>
            <p className="text-gray-500">
              Lv.{petLevel} · {getPetLabel(child.pet_type)}「{petStage.name}」
            </p>
            <div className="w-full bg-gray-200 rounded-full h-4 mt-2">
              <div
                className="bg-purple-500 h-4 rounded-full transition-all"
                style={{ width: `${progress.percent}%` }}
              ></div>
            </div>
            <p className="mt-2 text-sm text-gray-600">当前积分：{child.total_score} 分</p>
            <p className="text-xs text-gray-400">
              {progress.isMaxLevel
                ? '已经是最终形态啦 🎉'
                : `再得 ${progress.pointsToNext} 分升到 Lv.${progress.nextLevel}` +
                  `，变成 ${getPetStage(child.pet_type, progress.nextLevel!).emoji} ` +
                  getPetStage(child.pet_type, progress.nextLevel!).name}
            </p>
          </div>
        ) : (
          <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
            <div className="text-6xl mb-3">🐾</div>
            <p className="text-gray-500">暂无宠物档案</p>
            <p className="text-sm text-gray-400 mt-2">{message || '请联系家长添加'}</p>
          </div>
        )}

        {child && (
          <>
            {/* 可打卡任务 */}
            <div className="mt-6 bg-white p-6 rounded-lg shadow">
              <h3 className="font-bold text-lg mb-4">📋 可打卡任务</h3>
              {tasks.length === 0 ? (
                <p className="text-gray-400 text-sm">暂无任务，让家长添加吧</p>
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between border-b pb-2">
                      <div>
                        <span className="font-medium">{task.name}</span>
                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded ml-2">
                          {task.category}
                        </span>
                        <span className="text-xs text-green-600 ml-2">+{task.points}分</span>
                      </div>
                      <button
                        onClick={() => handleRequestCheckIn(task.id, task.points)}
                        disabled={busy}
                        className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 disabled:bg-gray-400"
                      >
                        申请打卡
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 待审批打卡 */}
            {pendingRequests.length > 0 && (
              <div className="mt-4 bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <h4 className="font-semibold text-sm text-yellow-700">⏳ 等待家长审批</h4>
                {pendingRequests.map((req) => (
                  <div key={req.id} className="text-sm text-gray-600 mt-1">
                    {req.tasks?.name}（+{req.points}分）
                  </div>
                ))}
              </div>
            )}

            {/* 可兑换奖励 */}
            <div className="mt-6 bg-white p-6 rounded-lg shadow">
              <h3 className="font-bold text-lg mb-4">🎁 可兑换奖励</h3>
              {rewards.length === 0 ? (
                <p className="text-gray-400 text-sm">暂无可用奖励，去打卡赚积分吧！</p>
              ) : (
                <div className="space-y-2">
                  {rewards.map((r) => {
                    const isPending = pendingRewardIds.has(r.id);
                    const affordable = child.total_score >= r.points_cost;
                    const canApply = !isPending && affordable && !busy;

                    return (
                      <div key={r.id} className="flex items-center justify-between border-b pb-2">
                        <div>
                          <span className="font-medium">{r.name}</span>
                          <span className="text-xs text-gray-500 ml-2">需要 {r.points_cost} 分</span>
                          {isPending && (
                            <span className="text-xs text-yellow-600 ml-2">⏳ 等待审批</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleApplyReward(r.id)}
                          disabled={!canApply}
                          className={`px-3 py-1 rounded text-sm ${
                            canApply
                              ? 'bg-purple-500 text-white hover:bg-purple-600'
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {isPending ? '等待审批' : affordable ? '申请兑换' : '积分不足'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {message && (
                <div
                  className={`mt-3 p-2 rounded text-sm ${
                    message.startsWith('✅')
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {message}
                </div>
              )}
            </div>

            {/* 今日打卡 */}
            <div className="mt-6 bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-bold mb-4">📋 今日打卡情况</h2>
              {todayCheckIns.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-gray-400">今日还没有打卡记录</p>
                  <p className="text-xs text-gray-400 mt-1">快去申请打卡吧！</p>
                </div>
              ) : (
                <div>
                  <div className="space-y-2">
                    {todayCheckIns.map((item, i) => (
                      <div key={i} className="flex items-center justify-between border-b pb-2">
                        <div>
                          <span className="text-gray-700">{item.task_name}</span>
                          <span className="text-xs text-gray-400 ml-2">× {item.count} 次</span>
                        </div>
                        <span className="text-green-600 font-medium">+{item.points}分</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t border-dashed flex justify-between items-center">
                    <span className="font-bold text-gray-700">今日累计</span>
                    <span className="text-purple-600 font-bold text-lg">
                      +{totalTodayPoints} 分
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 今日兑换 */}
            <div className="mt-6 bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-bold mb-4">🎁 今日兑换情况</h2>
              {todayRedemptions.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-gray-400">今日还没有兑换记录</p>
                </div>
              ) : (
                <div>
                  <div className="space-y-2">
                    {todayRedemptions.map((item, i) => (
                      <div key={i} className="flex items-center justify-between border-b pb-2">
                        <span className="text-gray-700">{item.reward_name}</span>
                        <span className="text-red-600 font-medium">-{item.points_cost}分</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t border-dashed flex justify-between items-center">
                    <span className="font-bold text-gray-700">今日累计消耗</span>
                    <span className="text-red-600 font-bold text-lg">-{totalTodayCost} 分</span>
                  </div>
                </div>
              )}
            </div>

            {/* 热力图（组件已抽出，两端共用） */}
            <div className="mt-6">
              <Heatmap
                title="📊 我的打卡热力图"
                data={heatmapData}
                month={heatmapMonth}
                onMonthChange={setHeatmapMonth}
                accent="purple"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
