import { supabase } from '../lib/supabaseClient';
import { useEffect, useState } from 'react';

interface ParentDashboardProps {
  profile: any;
}

interface Child {
  id: string;
  name: string;
  pet_type: string;
  total_score: number;
  level: number;
}

interface Task {
  id: string;
  name: string;
  category: string;
  points: number;
  is_active: boolean;
}

interface PendingRequest {
  id: string;
  child_id: string;
  task_id: string;
  points: number;
  status: string;
  children?: { name: string };
  tasks?: { name: string; points: number };
}

interface TodayCheckIn {
  task_name: string;
  points: number;
  check_in_date: string;
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

export default function ParentDashboard({ profile }: ParentDashboardProps) {
  const [children, setChildren] = useState<Child[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [pendingRedemptions, setPendingRedemptions] = useState<any[]>([]);
  const [todayCheckIns, setTodayCheckIns] = useState<TodayCheckIn[]>([]);
  const [todayRedemptions, setTodayRedemptions] = useState<TodayRedemption[]>([]);
  const [selectedChildForDetail, setSelectedChildForDetail] = useState<string>('');
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);
  const [heatmapMonth, setHeatmapMonth] = useState<Date>(new Date());

  useEffect(() => {
    fetchChildren();
    fetchTasks();
    fetchPendingRequests();
    fetchPendingRedemptions();
    fetchAllRedemptions();
  }, []);

  useEffect(() => {
    if (selectedChildForDetail) {
      fetchTodayCheckIns(selectedChildForDetail);
      fetchTodayRedemptions(selectedChildForDetail);
      fetchHeatmapData(selectedChildForDetail);
    }
  }, [selectedChildForDetail, heatmapMonth]);

  async function fetchChildren() {
    const { data: _data, error } = await supabase
      .from('children')
      .select('*');

    if (error) {
      console.error('❌ 获取孩子列表失败:', error);
    } else {
      console.log('✅ 找到孩子:', _data);
      setChildren(_data || []);
      if (_data && _data.length > 0) {
        setSelectedChildForDetail(_data[0].id);
      }
    }
  }

  async function fetchTasks() {
    const { data: _data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('is_active', true);
    if (error) {
      console.error('获取任务列表失败:', error);
    } else {
      setTasks(_data || []);
    }
  }

  async function fetchPendingRequests() {
    const { data, error } = await supabase
      .from('check_in_requests')
      .select('*, children(name), tasks(name, points)')
      .eq('status', 'pending');
    if (error) {
      console.error('获取待审批申请失败:', error);
    } else {
      setPendingRequests(data || []);
    }
  }

  async function fetchPendingRedemptions() {
    const { data, error } = await supabase
      .from('redemptions')
      .select('*, children(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) {
      console.error('获取待审批兑换失败:', error);
    } else {
      setPendingRedemptions(data || []);
    }
  }

  async function fetchAllRedemptions() {
    const { data, error } = await supabase
      .from('redemptions')
      .select('*, children(name)')
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('获取所有兑换失败:', error);
    } else {
      setRedemptions(data || []);
    }
  }

  async function fetchTodayCheckIns(childId: string) {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('check_ins')
      .select('*, tasks(name, points)')
      .eq('child_id', childId)
      .eq('check_in_date', today);

    if (error) {
      console.error('获取今日打卡记录失败:', error);
    } else {
      const formatted = (data || []).map((item: any) => ({
        task_name: item.tasks?.name || '未知任务',
        points: item.points || 0,
        check_in_date: item.check_in_date
      }));
      setTodayCheckIns(formatted);
    }
  }

  async function fetchTodayRedemptions(childId: string) {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('redemptions')
      .select('reward_name, points_cost, status, confirmed_at')
      .eq('child_id', childId)
      .eq('status', 'confirmed')
      .gte('confirmed_at', today);

    if (error) {
      console.error('获取今日兑换记录失败:', error);
    } else {
      setTodayRedemptions(data || []);
    }
  }

  async function fetchHeatmapData(childId: string) {
    const year = heatmapMonth.getFullYear();
    const month = heatmapMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const startDate = firstDay.toISOString().split('T')[0];
    const endDate = lastDay.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('check_ins')
      .select('check_in_date')
      .eq('child_id', childId)
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

  // ====== 兑换奖励管理 ======
  async function handleCreateReward() {
    const rewardName = prompt('请输入奖励名称（如：冰淇淋、玩具车）：');
    if (!rewardName || rewardName.trim() === '') return;

    const { data: existing, error: checkError } = await supabase
      .from('redemptions')
      .select('id')
      .eq('reward_name', rewardName.trim());

    if (checkError) {
      alert('检查重复失败: ' + checkError.message);
      return;
    }

    if (existing && existing.length > 0) {
      alert('已存在同名兑换奖励，请使用不同名称');
      return;
    }

    const pointsCost = parseInt(prompt('请输入所需积分（数字）：') || '0');
    if (isNaN(pointsCost) || pointsCost <= 0) {
      alert('请输入有效的积分数量');
      return;
    }

    if (children.length === 0) {
      alert('请先添加孩子');
      return;
    }

    const childOptions = children.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    const childIndex = parseInt(prompt(`请选择要关联的孩子：\n${childOptions}`) || '0') - 1;

    if (isNaN(childIndex) || childIndex < 0 || childIndex >= children.length) {
      alert('无效的选择');
      return;
    }

    const selectedChild = children[childIndex];

    const { error } = await supabase
      .from('redemptions')
      .insert({
        child_id: selectedChild.id,
        reward_name: rewardName.trim(),
        points_cost: pointsCost,
        status: 'available',
        is_active: true,
        score_before: 0,
        score_after: 0,
      });

    if (error) {
      alert('创建兑换奖励失败: ' + error.message);
    } else {
      alert(`✅ 成功创建兑换奖励：${rewardName.trim()}（需要 ${pointsCost} 分）`);
      await fetchAllRedemptions();
    }
  }

  async function handleEditRedemption(id: string, currentName: string, currentCost: number) {
    const newName = prompt('修改奖励名称：', currentName);
    if (!newName || newName.trim() === '') return;

    const { data: existing, error: checkError } = await supabase
      .from('redemptions')
      .select('id')
      .eq('reward_name', newName.trim())
      .neq('id', id);

    if (checkError) {
      alert('检查重复失败: ' + checkError.message);
      return;
    }

    if (existing && existing.length > 0) {
      alert('已存在同名兑换奖励，请使用不同名称');
      return;
    }

    const newCost = parseInt(prompt('修改所需积分：', String(currentCost)) || '0');
    if (isNaN(newCost) || newCost <= 0) {
      alert('请输入有效的积分数量');
      return;
    }

    const { error } = await supabase
      .from('redemptions')
      .update({
        reward_name: newName.trim(),
        points_cost: newCost,
      })
      .eq('id', id);

    if (error) {
      alert('编辑失败: ' + error.message);
    } else {
      alert('✅ 兑换奖励已更新');
      await fetchAllRedemptions();
    }
  }

  async function handleToggleRedemption(id: string, currentStatus: boolean) {
    const { error } = await supabase
      .from('redemptions')
      .update({ is_active: !currentStatus })
      .eq('id', id);
    if (error) {
      alert('操作失败: ' + error.message);
    } else {
      alert(`✅ 兑换奖励已${!currentStatus ? '启用' : '停用'}`);
      await fetchAllRedemptions();
    }
  }

  async function handleDeleteRedemption(id: string) {
    if (!confirm('确定要删除这个兑换奖励吗？')) return;

    const { error } = await supabase
      .from('redemptions')
      .delete()
      .eq('id', id);

    if (error) {
      alert('删除失败: ' + error.message);
    } else {
      alert('已删除兑换奖励');
      await fetchAllRedemptions();
    }
  }

  // ====== 兑换审批 ======
  async function handleConfirmRedemption(id: string, childId: string, cost: number) {
    if (!confirm('确认兑换？将扣除孩子积分。')) return;

    const { data: childData, error: childError } = await supabase
      .from('children')
      .select('total_score')
      .eq('id', childId)
      .single();

    if (childError || !childData) {
      alert('获取孩子积分失败');
      return;
    }

    const scoreBefore = childData.total_score;
    if (scoreBefore < cost) {
      alert('孩子积分不足，无法兑换');
      return;
    }
    const scoreAfter = scoreBefore - cost;

    const { error: updateRedemptionError } = await supabase
      .from('redemptions')
      .update({
        status: 'confirmed',
        score_before: scoreBefore,
        score_after: scoreAfter,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateRedemptionError) {
      alert('确认失败: ' + updateRedemptionError.message);
      return;
    }

    const { error: updateChildError } = await supabase
      .from('children')
      .update({ total_score: scoreAfter })
      .eq('id', childId);

    if (updateChildError) {
      alert('扣除积分失败: ' + updateChildError.message);
      return;
    }

    alert('✅ 兑换确认成功！');
    await fetchPendingRedemptions();
    await fetchAllRedemptions();
    await fetchChildren();
    if (selectedChildForDetail) {
      await fetchTodayRedemptions(selectedChildForDetail);
    }
  }

  async function handleCancelRedemption(id: string) {
    if (!confirm('取消兑换申请？')) return;

    const { error } = await supabase
      .from('redemptions')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) {
      alert('取消失败: ' + error.message);
    } else {
      alert('已取消兑换申请');
      await fetchPendingRedemptions();
      await fetchAllRedemptions();
    }
  }

  // ====== 任务管理 ======
  async function handleAddTask(name: string, category: string, points: number) {
    const { error } = await supabase
      .from('tasks')
      .insert({
        family_id: profile.id,
        name,
        category,
        points,
        is_active: true,
      })
      .select();
    if (error) {
      alert('添加任务失败: ' + error.message);
      return;
    }
    await fetchTasks();
    alert('✅ 任务添加成功！');
  }

  async function handleEditTask(taskId: string, name: string, category: string, points: number) {
    const { error } = await supabase
      .from('tasks')
      .update({ name, category, points })
      .eq('id', taskId);
    if (error) {
      alert('编辑任务失败: ' + error.message);
      return;
    }
    await fetchTasks();
    alert('✅ 任务已更新！');
  }

  async function handleToggleTask(taskId: string, currentStatus: boolean) {
    const { error } = await supabase
      .from('tasks')
      .update({ is_active: !currentStatus })
      .eq('id', taskId);
    if (error) {
      alert('操作失败: ' + error.message);
      return;
    }
    await fetchTasks();
    alert(`✅ 任务已${!currentStatus ? '启用' : '停用'}`);
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm('确定要永久删除这个任务吗？')) return;
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);
    if (error) {
      alert('删除失败: ' + error.message);
      return;
    }
    await fetchTasks();
    alert('🗑️ 任务已删除');
  }

  // ====== 打卡审批 ======
  async function handleApproveCheckIn(requestId: string, childId: string, points: number) {
    if (!confirm('确认通过该打卡申请？')) return;

    try {
      const { data: requestData, error: requestError } = await supabase
        .from('check_in_requests')
        .select('task_id')
        .eq('id', requestId)
        .single();

      if (requestError) {
        alert('获取申请详情失败: ' + requestError.message);
        return;
      }

      const { data: childData, error: childError } = await supabase
        .from('children')
        .select('total_score, level')
        .eq('id', childId)
        .single();

      if (childError) {
        alert('获取孩子信息失败: ' + childError.message);
        return;
      }

      const scoreBefore = childData.total_score;
      const scoreAfter = scoreBefore + points;

      const thresholds = [0, 40, 100, 180, 280, 400, 540, 700];
      let newLevel = 0;
      for (let i = 0; i < thresholds.length; i++) {
        if (scoreAfter >= thresholds[i]) newLevel = i;
      }

      const { error: updateError } = await supabase
        .from('check_in_requests')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: profile.id
        })
        .eq('id', requestId);

      if (updateError) {
        alert('审批失败: ' + updateError.message);
        return;
      }

      const { error: childUpdateError } = await supabase
        .from('children')
        .update({ 
          total_score: scoreAfter, 
          level: newLevel 
        })
        .eq('id', childId);

      if (childUpdateError) {
        alert('更新积分失败: ' + childUpdateError.message);
        return;
      }

      const taskId = requestData?.task_id;
      if (taskId) {
        await supabase
          .from('check_ins')
          .insert({
            child_id: childId,
            task_id: taskId,
            points: points,
            score_before: scoreBefore,
            score_after: scoreAfter,
            check_in_date: new Date().toISOString().split('T')[0],
          });
      }

      alert('✅ 打卡审批通过！积分已增加 ' + points + ' 分');
      
      await fetchPendingRequests();
      await fetchChildren();
      if (selectedChildForDetail) {
        await fetchTodayCheckIns(selectedChildForDetail);
        await fetchHeatmapData(selectedChildForDetail);
      }
      
    } catch (err) {
      console.error('审批过程出错:', err);
      alert('审批过程出错，请查看控制台');
    }
  }

  async function handleRejectCheckIn(requestId: string) {
    if (!confirm('拒绝该打卡申请？')) return;

    const { error } = await supabase
      .from('check_in_requests')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString()
      })
      .eq('id', requestId);

    if (error) {
      alert('操作失败: ' + error.message);
    } else {
      alert('已拒绝该申请');
      await fetchPendingRequests();
    }
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

  const totalTodayPoints = todayCheckIns.reduce((sum, item) => sum + item.points, 0);
  const totalTodayRedemptionPoints = todayRedemptions.reduce((sum, item) => sum + item.points_cost, 0);

  const year = heatmapMonth.getFullYear();
  const month = heatmapMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-blue-600">🐾 打卡宠物</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">👋 家长</span>
          <button onClick={handleLogout} className="bg-red-500 text-white px-3 py-1 rounded text-sm">
            退出
          </button>
        </div>
      </nav>

      <div className="p-6 max-w-4xl mx-auto">
        {/* 待审批打卡申请 */}
        {pendingRequests.length > 0 && (
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 mb-4">
            <h3 className="font-semibold text-yellow-700 mb-2">⏳ 待审批打卡申请</h3>
            {pendingRequests.map(req => (
              <div key={req.id} className="flex items-center justify-between border-b border-yellow-100 py-2">
                <div>
                  <span className="font-medium">{req.children?.name}</span>
                  <span className="text-gray-600 ml-2">申请打卡「{req.tasks?.name}」</span>
                  <span className="text-xs text-blue-600 ml-2">+{req.points}分</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApproveCheckIn(req.id, req.child_id, req.points)}
                    className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
                  >
                    通过
                  </button>
                  <button
                    onClick={() => handleRejectCheckIn(req.id)}
                    className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                  >
                    拒绝
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 待审批兑换申请 */}
        {pendingRedemptions.length > 0 && (
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 mb-4">
            <h3 className="font-semibold text-yellow-700 mb-2">🏪 待审批兑换申请</h3>
            {pendingRedemptions.map(req => (
              <div key={req.id} className="flex items-center justify-between border-b border-yellow-100 py-2">
                <div>
                  <span className="font-medium">{req.children?.name}</span>
                  <span className="text-gray-600 ml-2">申请兑换「{req.reward_name}」</span>
                  <span className="text-xs text-blue-600 ml-2">需要 {req.points_cost} 分</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleConfirmRedemption(req.id, req.child_id, req.points_cost)}
                    className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600"
                  >
                    确认
                  </button>
                  <button
                    onClick={() => handleCancelRedemption(req.id)}
                    className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                  >
                    取消
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 我的孩子们 */}
        <h2 className="text-xl font-bold mt-4 mb-2">👶 我的孩子们</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {children.map(child => (
            <div key={child.id} className="bg-white p-4 rounded-lg shadow">
              <div className="flex items-center gap-3">
                <span className="text-4xl">{getPetEmoji(child.pet_type, child.level)}</span>
                <div>
                  <h3 className="font-bold text-lg">{child.name}</h3>
                  <p className="text-sm text-gray-600">等级 Lv.{child.level} · 积分 {child.total_score}</p>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${Math.min((child.total_score / 700) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 今日打卡情况 */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">📋 今日打卡情况</h2>
            {children.length > 0 && (
              <select
                className="p-2 border rounded text-sm"
                value={selectedChildForDetail}
                onChange={(e) => setSelectedChildForDetail(e.target.value)}
              >
                {children.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          {children.length === 0 ? (
            <p className="text-gray-500">暂无孩子</p>
          ) : todayCheckIns.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-gray-400">今日还没有打卡记录</p>
              <p className="text-xs text-gray-400 mt-1">让孩子在「孩子端」申请打卡吧</p>
            </div>
          ) : (
            <div>
              <div className="space-y-2">
                {todayCheckIns.map((item, index) => (
                  <div key={index} className="flex items-center justify-between border-b pb-2">
                    <span className="text-gray-700">{item.task_name}</span>
                    <span className="text-green-600 font-medium">+{item.points}分</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-dashed flex justify-between items-center">
                <span className="font-bold text-gray-700">今日累计</span>
                <span className="text-blue-600 font-bold text-lg">+{totalTodayPoints} 分</span>
              </div>
            </div>
          )}
        </div>

        {/* 今日兑换情况 */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">🎁 今日兑换情况</h2>
            {children.length > 0 && (
              <span className="text-sm text-gray-500">
                {children.find(c => c.id === selectedChildForDetail)?.name || ''}
              </span>
            )}
          </div>

          {children.length === 0 ? (
            <p className="text-gray-500">暂无孩子</p>
          ) : todayRedemptions.length === 0 ? (
            <div className="text-center py-6">
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
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">📊 打卡热力图</h2>
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
                className="px-2 py-1 border rounded text-sm hover:bg-gray-100 text-blue-600"
              >
                今天
              </button>
            </div>
          </div>

          {children.length === 0 || !selectedChildForDetail ? (
            <p className="text-gray-500 text-center py-4">请选择孩子查看打卡热力图</p>
          ) : (
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
                      className={`aspect-square rounded ${colorClass} transition-all hover:scale-110 hover:shadow-lg cursor-default relative ${isToday ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
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
          )}
        </div>

        {/* 任务管理 */}
        <div className="mt-6 bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">📝 任务管理</h2>
            <button
              onClick={() => {
                const name = prompt('请输入任务名称：');
                if (name) {
                  const category = prompt('请输入分类（如：阅读/运动/劳动）：') || '通用';
                  const points = parseInt(prompt('请输入分值（数字）：') || '5');
                  if (!isNaN(points)) {
                    handleAddTask(name, category, points);
                  }
                }
              }}
              className="bg-green-500 text-white px-4 py-1 rounded hover:bg-green-600 text-sm"
            >
              ＋ 添加任务
            </button>
          </div>

          {tasks.length === 0 ? (
            <p className="text-gray-500">暂无任务，点击"添加任务"创建</p>
          ) : (
            <div className="space-y-2">
              {tasks.map(task => (
                <div key={task.id} className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${task.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                      {task.name}
                    </span>
                    <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">{task.category}</span>
                    <span className="text-xs text-blue-600 font-bold">+{task.points}分</span>
                    <span className={`text-xs ${task.is_active ? 'text-green-600' : 'text-red-400'}`}>
                      {task.is_active ? '● 启用' : '○ 停用'}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        const newName = prompt('修改名称：', task.name);
                        if (newName) {
                          const newCategory = prompt('修改分类：', task.category) || '通用';
                          const newPoints = parseInt(prompt('修改分值：', String(task.points)) || '5');
                          if (!isNaN(newPoints)) {
                            handleEditTask(task.id, newName, newCategory, newPoints);
                          }
                        }
                      }}
                      className="text-xs bg-yellow-500 text-white px-2 py-0.5 rounded hover:bg-yellow-600"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleToggleTask(task.id, task.is_active)}
                      className={`text-xs px-2 py-0.5 rounded text-white ${task.is_active ? 'bg-gray-500 hover:bg-gray-600' : 'bg-green-500 hover:bg-green-600'}`}
                    >
                      {task.is_active ? '停用' : '启用'}
                    </button>
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="text-xs bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 兑换奖励管理 */}
        <div className="mt-6 bg-white p-6 rounded-lg shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">🏪 兑换奖励管理</h2>
            <button
              onClick={handleCreateReward}
              className="bg-green-500 text-white px-4 py-1 rounded hover:bg-green-600 text-sm"
            >
              ＋ 添加兑换奖励
            </button>
          </div>

          {redemptions.length === 0 ? (
            <p className="text-gray-500">暂无兑换奖励，点击"添加兑换奖励"创建</p>
          ) : (
            <div className="space-y-2">
              {redemptions.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between border-b pb-2">
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${r.is_active !== false ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                      {r.reward_name}
                    </span>
                    <span className="text-xs text-blue-600 font-bold">{r.points_cost}分</span>
                    <span className="text-xs text-gray-400">👶 {r.children?.name || '未知孩子'}</span>
                    <span className={`text-xs ${r.is_active !== false ? 'text-green-600' : 'text-red-400'}`}>
                      {r.is_active !== false ? '● 启用' : '○ 停用'}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        const newName = prompt('修改奖励名称：', r.reward_name);
                        if (newName && newName.trim()) {
                          const newCost = parseInt(prompt('修改所需积分：', String(r.points_cost)) || '0');
                          if (!isNaN(newCost) && newCost > 0) {
                            handleEditRedemption(r.id, newName.trim(), newCost);
                          }
                        }
                      }}
                      className="text-xs bg-yellow-500 text-white px-2 py-0.5 rounded hover:bg-yellow-600"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleToggleRedemption(r.id, r.is_active !== false)}
                      className={`text-xs px-2 py-0.5 rounded text-white ${r.is_active !== false ? 'bg-gray-500 hover:bg-gray-600' : 'bg-green-500 hover:bg-green-600'}`}
                    >
                      {r.is_active !== false ? '停用' : '启用'}
                    </button>
                    <button
                      onClick={() => handleDeleteRedemption(r.id)}
                      className="text-xs bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600"
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}