import { supabase } from '../lib/supabaseClient';
import { useEffect, useState } from 'react';

interface ChildDashboardProps {
  profile: any;
}

interface Child {
  id: string;
  name: string;
  pet_type: string;
  total_score: number;
  level: number;
}

interface Reward {
  id: string;
  reward_name: string;
  points_cost: number;
  status: string;
  is_active: boolean;
}

interface Task {
  id: string;
  name: string;
  category: string;
  points: number;
}

interface PendingRequest {
  id: string;
  task_id: string;
  points: number;
  status: string;
  tasks?: {
    name: string;
    points: number;
  };
}

interface TodayCheckIn {
  task_name: string;
  points: number;
  count: number;
}

interface TodayRedemption {
  reward_name: string;
  points_cost: number;
  status: string;
  confirmed_at?: string;
}

interface HeatmapData {
  date: string;
  count: number;
}

export default function ChildDashboard({ profile }: ChildDashboardProps) {
  const [child, setChild] = useState<Child | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  const [todayCheckIns, setTodayCheckIns] = useState<TodayCheckIn[]>([]);
  const [todayRedemptions, setTodayRedemptions] = useState<TodayRedemption[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);
  const [heatmapMonth, setHeatmapMonth] = useState<Date>(new Date());

  useEffect(() => {
    if (profile?.id) {
      fetchChildInfo();
    } else {
      console.warn('⚠️ profile.id 为空');
      setIsLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (child?.id) {
      fetchTasks();
      fetchPendingRequests();
      fetchRewards();
      fetchTodayCheckIns();
      fetchTodayRedemptions();
      fetchHeatmapData();
    }
  }, [child?.id]);

  useEffect(() => {
    if (child?.id) {
      fetchHeatmapData();
    }
  }, [heatmapMonth]);

  async function fetchChildInfo() {
    if (!profile?.id) {
      console.error('❌ profile.id 为空');
      setIsLoading(false);
      return;
    }

    let { data, error } = await supabase
      .from('children')
      .select('*')
      .eq('id', profile.id);

    if (error) {
      console.error('❌ 查询孩子信息失败:', error);
      setIsLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      const { data: familyData, error: familyError } = await supabase
        .from('children')
        .select('*')
        .eq('family_id', profile.id);

      if (!familyError && familyData && familyData.length > 0) {
        data = familyData;
      }
    }

    if (!data || data.length === 0) {
      console.log('🆕 未找到孩子档案，自动创建...');
      
      const username = profile.username || '宝贝';
      const { data: newChild, error: createError } = await supabase
        .from('children')
        .insert({
          id: profile.id,
          family_id: profile.id,
          name: username,
          pet_type: 'cat',
          total_score: 0,
          level: 0,
        })
        .select()
        .single();

      if (createError) {
        console.error('❌ 自动创建孩子档案失败:', createError);
        setMessage('创建孩子档案失败，请联系家长');
        setIsLoading(false);
        return;
      }

      console.log('✅ 自动创建孩子档案成功:', newChild);
      setChild(newChild);
      setIsLoading(false);
      return;
    }

    console.log('✅ 找到孩子:', data[0]);
    setChild(data[0]);
    setIsLoading(false);
  }

  async function fetchRewards() {
    if (!child?.id) return;

    const { data, error } = await supabase
      .from('redemptions')
      .select('*')
      .eq('child_id', child.id)
      .eq('is_active', true);

    if (error) {
      console.error('❌ 获取奖励列表失败:', error);
    } else {
      console.log('✅ 获取到奖励:', data);
      setRewards(data || []);
    }
  }

  async function fetchTasks() {
    if (!child?.id) return;

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('❌ 获取任务列表失败:', error);
    } else {
      setTasks(data || []);
    }
  }

  async function fetchPendingRequests() {
    if (!child?.id) return;

    const { data, error } = await supabase
      .from('check_in_requests')
      .select('*, tasks(name, points)')
      .eq('child_id', child.id)
      .eq('status', 'pending');

    if (error) {
      console.error('❌ 获取待审批申请失败:', error);
    } else {
      setPendingRequests(data || []);
    }
  }

  async function fetchTodayCheckIns() {
    if (!child?.id) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('check_ins')
      .select('*, tasks(name, points)')
      .eq('child_id', child.id)
      .eq('check_in_date', today);

    if (error) {
      console.error('获取今日打卡记录失败:', error);
      return;
    }

    // 按任务名称分组汇总
    const taskMap: Record<string, { task_name: string; total_points: number; count: number }> = {};
    
    (data || []).forEach((item: any) => {
      const taskName = item.tasks?.name || '未知任务';
      const points = item.points || 0;
      
      if (taskMap[taskName]) {
        taskMap[taskName].total_points += points;
        taskMap[taskName].count += 1;
      } else {
        taskMap[taskName] = {
          task_name: taskName,
          total_points: points,
          count: 1,
        };
      }
    });

    const formatted: TodayCheckIn[] = Object.values(taskMap).map(item => ({
      task_name: item.task_name,
      points: item.total_points,
      count: item.count,
    }));

    setTodayCheckIns(formatted);
  }

  async function fetchTodayRedemptions() {
    if (!child?.id) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('redemptions')
      .select('reward_name, points_cost, status, confirmed_at')
      .eq('child_id', child.id)
      .eq('status', 'confirmed')
      .gte('confirmed_at', today);

    if (error) {
      console.error('获取今日兑换记录失败:', error);
    } else {
      setTodayRedemptions(data || []);
    }
  }

  async function fetchHeatmapData() {
    if (!child?.id) return;
    
    const year = heatmapMonth.getFullYear();
    const month = heatmapMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const startDate = firstDay.toISOString().split('T')[0];
    const endDate = lastDay.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('check_ins')
      .select('check_in_date')
      .eq('child_id', child.id)
      .gte('check_in_date', startDate)
      .lte('check_in_date', endDate);

    if (error) {
      console.error('获取热力图数据失败:', error);
      return;
    }

    const dateCount: Record<string, number> = {};
    data?.forEach(item => {
      const date = item.check_in_date;
      dateCount[date] = (dateCount[date] || 0) + 1;
    });

    const result: HeatmapData[] = [];
    const current = new Date(year, month, 1);
    while (current <= lastDay) {
      const dateStr = current.toISOString().split('T')[0];
      result.push({
        date: dateStr,
        count: dateCount[dateStr] || 0
      });
      current.setDate(current.getDate() + 1);
    }

    setHeatmapData(result);
  }

  async function handleRequestCheckIn(taskId: string, points: number) {
    if (!child) return;

    setLoading(true);

    const { error } = await supabase
      .from('check_in_requests')
      .insert({
        child_id: child.id,
        task_id: taskId,
        points: points,
        status: 'pending'
      });

    if (error) {
      alert('申请失败: ' + error.message);
    } else {
      alert('✅ 打卡申请已提交，等待家长审批');
      await fetchPendingRequests();
    }
    setLoading(false);
  }

  async function handleApplyReward(rewardId: string, cost: number) {
    if (!child) return;
    if (child.total_score < cost) {
      setMessage('❌ 积分不足，无法兑换');
      return;
    }

    setLoading(true);
    setMessage('');

    console.log('🔍 开始申请兑换, rewardId:', rewardId);

    const { data, error } = await supabase
      .from('redemptions')
      .update({ status: 'pending' })
      .eq('id', rewardId)
      .select();

    console.log('📊 更新结果:', data);
    console.log('❌ 错误:', error);

    if (error) {
      setMessage('申请兑换失败: ' + error.message);
      setLoading(false);
      return;
    }

    await fetchRewards();
    setMessage('✅ 兑换申请已提交，等待家长审批');
    setLoading(false);
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const getPetEmoji = (type: string, level: number) => {
    const emojis = {
      cat: ['🐱', '🐈', '😺', '😸', '😻', '😽', '🙀', '🐾'],
      dog: ['🐶', '🐕', '🐩', '🐾', '🦮', '🐕‍🦺', '🦴', '🐾'],
      rabbit: ['🐰', '🐇', '🐣', '🐥', '🐤', '🐦', '🕊️', '🐾'],
    };
    const list = emojis[type as keyof typeof emojis] || emojis.cat;
    return list[level % list.length] || '🐾';
  };

  const thresholds = [0, 40, 100, 180, 280, 400, 540, 700];
  const nextThreshold = child ? thresholds.find(t => t > child.total_score) || 700 : 0;
  const progress = child ? (child.total_score / nextThreshold) * 100 : 0;

  const totalTodayPoints = todayCheckIns.reduce((sum, item) => sum + item.points, 0);
  const totalTodayRedemptionPoints = todayRedemptions.reduce((sum, item) => sum + item.points_cost, 0);

  const year = heatmapMonth.getFullYear();
  const month = heatmapMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const today = new Date().toISOString().split('T')[0];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (!profile || !profile.id) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">用户信息加载失败，请重新登录</p>
          <button 
            onClick={handleLogout}
            className="mt-2 text-blue-500 underline"
          >
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
            <div className="text-8xl mb-4">{getPetEmoji(child.pet_type, child.level)}</div>
            <h2 className="text-2xl font-bold">{child.name}</h2>
            <p className="text-gray-500">等级 Lv.{child.level}</p>
            <div className="w-full bg-gray-200 rounded-full h-4 mt-2">
              <div className="bg-purple-500 h-4 rounded-full transition-all" style={{ width: `${Math.min(progress, 100)}%` }}></div>
            </div>
            <p className="mt-2 text-sm text-gray-600">当前积分：{child.total_score} 分</p>
            <p className="text-xs text-gray-400">下次升级需要 {nextThreshold - child.total_score} 分</p>
          </div>
        ) : (
          <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
            <p className="text-gray-500">暂无孩子档案</p>
            <p className="text-sm text-gray-400 mt-2">{message || '请联系家长添加'}</p>
          </div>
        )}

        {/* 可打卡任务 */}
        <div className="mt-6 bg-white p-6 rounded-lg shadow">
          <h3 className="font-bold text-lg mb-4">📋 可打卡任务</h3>
          {tasks.length === 0 ? (
            <p className="text-gray-400 text-sm">暂无任务</p>
          ) : (
            <div className="space-y-2">
              {tasks.map(task => (
                <div key={task.id} className="flex items-center justify-between border-b pb-2">
                  <div>
                    <span className="font-medium">{task.name}</span>
                    <span className="text-xs text-gray-500 ml-2">+{task.points}分</span>
                  </div>
                  <button
                    onClick={() => handleRequestCheckIn(task.id, task.points)}
                    disabled={loading}
                    className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 disabled:bg-gray-400"
                  >
                    申请打卡
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 待审批的打卡申请 */}
        {pendingRequests.length > 0 && (
          <div className="mt-4 bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <h4 className="font-semibold text-sm text-yellow-700">⏳ 待审批的打卡申请</h4>
            {pendingRequests.map(req => (
              <div key={req.id} className="text-sm text-gray-600 mt-1">
                {req.tasks?.name} (+{req.points}分) - 等待家长确认
              </div>
            ))}
          </div>
        )}

        {/* 可兑换奖励列表 */}
        <div className="mt-6 bg-white p-6 rounded-lg shadow">
          <h3 className="font-bold text-lg mb-4">🎁 可兑换奖励</h3>
          {rewards.length === 0 ? (
            <p className="text-gray-400 text-sm">暂无可用奖励，去打卡赚积分吧！</p>
          ) : (
            <div className="space-y-2">
              {rewards.map(r => {
                const isPending = r.status === 'pending';
                const hasEnoughPoints = child && child.total_score >= r.points_cost;
                const canApply = !isPending && hasEnoughPoints;

                return (
                  <div key={r.id} className="flex items-center justify-between border-b pb-2">
                    <div>
                      <span className="font-medium">{r.reward_name}</span>
                      <span className="text-xs text-gray-500 ml-2">需要 {r.points_cost} 分</span>
                      {isPending && (
                        <span className="text-xs text-yellow-600 ml-2">⏳ 等待审批</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleApplyReward(r.id, r.points_cost)}
                      disabled={!canApply || loading}
                      className={`px-3 py-1 rounded text-sm ${
                        canApply
                          ? 'bg-purple-500 text-white hover:bg-purple-600'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {isPending ? '等待审批' : hasEnoughPoints ? '申请兑换' : '积分不足'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {message && (
            <div className={`mt-3 p-2 rounded text-sm ${message.startsWith('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {message}
            </div>
          )}
        </div>

        {/* 今日打卡情况 */}
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
                {todayCheckIns.map((item, index) => (
                  <div key={index} className="flex items-center justify-between border-b pb-2">
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
                <span className="text-purple-600 font-bold text-lg">+{totalTodayPoints} 分</span>
              </div>
            </div>
          )}
        </div>

        {/* 今日兑换情况 */}
        <div className="mt-6 bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">🎁 今日兑换情况</h2>
          {todayRedemptions.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-gray-400">今日还没有兑换记录</p>
            </div>
          ) : (
            <div>
              <div className="space-y-2">
                {todayRedemptions.map((item, index) => (
                  <div key={index} className="flex items-center justify-between border-b pb-2">
                    <span className="text-gray-700">{item.reward_name}</span>
                    <span className="text-red-600 font-medium">-{item.points_cost}分</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-dashed flex justify-between items-center">
                <span className="font-bold text-gray-700">今日累计消耗</span>
                <span className="text-red-600 font-bold text-lg">
                  -{totalTodayRedemptionPoints} 分
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 热力图 */}
        <div className="mt-6 bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">📊 我的打卡热力图</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const newMonth = new Date(heatmapMonth);
                  newMonth.setMonth(newMonth.getMonth() - 1);
                  setHeatmapMonth(newMonth);
                }}
                className="px-2 py-1 border rounded text-sm hover:bg-gray-100"
              >
                ◀
              </button>
              <span className="text-sm font-medium min-w-[100px] text-center">
                {year}年 {month + 1}月
              </span>
              <button
                onClick={() => {
                  const newMonth = new Date(heatmapMonth);
                  newMonth.setMonth(newMonth.getMonth() + 1);
                  setHeatmapMonth(newMonth);
                }}
                className="px-2 py-1 border rounded text-sm hover:bg-gray-100"
              >
                ▶
              </button>
              <button
                onClick={() => {
                  const now = new Date();
                  setHeatmapMonth(now);
                }}
                className="px-2 py-1 border rounded text-sm hover:bg-gray-100 text-purple-600"
              >
                今天
              </button>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-7 gap-1 mb-1 text-center text-xs text-gray-400">
              <div>日</div><div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square"></div>
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const data = heatmapData.find(d => d.date === dateStr);
                const count = data?.count || 0;
                const isToday = dateStr === today;
                
                let colorClass = 'bg-gray-100 hover:bg-gray-200';
                if (count === 0) colorClass = 'bg-gray-100 hover:bg-gray-200';
                else if (count <= 2) colorClass = 'bg-green-200 hover:bg-green-300';
                else if (count <= 4) colorClass = 'bg-green-400 hover:bg-green-500';
                else if (count <= 6) colorClass = 'bg-green-600 hover:bg-green-700';
                else colorClass = 'bg-green-800 hover:bg-green-900';

                return (
                  <div
                    key={dateStr}
                    className={`aspect-square rounded ${colorClass} transition-all hover:scale-110 hover:shadow-lg cursor-default relative ${isToday ? 'ring-2 ring-purple-500 ring-offset-1' : ''}`}
                    title={`${month + 1}月${day}日: ${count} 次打卡`}
                  >
                    <span className="absolute inset-0 flex items-center justify-center text-[8px] text-gray-600 opacity-30">
                      {day}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
              <span>少</span>
              <div className="w-4 h-4 bg-gray-100 rounded border border-gray-200"></div>
              <div className="w-4 h-4 bg-green-200 rounded"></div>
              <div className="w-4 h-4 bg-green-400 rounded"></div>
              <div className="w-4 h-4 bg-green-600 rounded"></div>
              <div className="w-4 h-4 bg-green-800 rounded"></div>
              <span>多</span>
              <span className="ml-2 text-gray-400">（悬停查看详情）</span>
            </div>
            <div className="mt-3 text-xs text-gray-400">
              当月打卡总次数: {heatmapData.reduce((sum, d) => sum + d.count, 0)} 次
              | 打卡天数: {heatmapData.filter(d => d.count > 0).length} 天
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}