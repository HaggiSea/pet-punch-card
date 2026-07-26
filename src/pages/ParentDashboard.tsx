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

export default function ParentDashboard({ profile }: ParentDashboardProps) {
  const [children, setChildren] = useState<Child[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>('');
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // 加载孩子列表和任务列表
  useEffect(() => {
    fetchChildren();
    fetchTasks();
  }, []);

  async function fetchChildren() {
    const { data: _data, error } = await supabase
        .from('children')
        .select('*')
        .eq('family_id', profile.id);
    if (error) {
        console.error('获取孩子列表失败:', error);
    } else {
        setChildren(_data || []);
        if (_data && _data.length > 0) setSelectedChild(_data[0].id);
    }
    }

  async function fetchTasks() {
    const { data: _data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('family_id', profile.id)
        .eq('is_active', true);
    if (error) {
        console.error('获取任务列表失败:', error);
    } else {
        setTasks(_data || []);
        if (_data && _data.length > 0) setSelectedTask(_data[0].id);
    }
  }
  // 添加新任务
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

  // 编辑任务
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

  // 切换任务启用状态（软删除/恢复）
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

  // 删除任务（硬删除，谨慎使用，会导致关联的打卡记录丢失，建议改用停用）
  async function handleDeleteTask(taskId: string) {
    if (!confirm('确定要永久删除这个任务吗？（关联的打卡记录也将被删除）')) return;
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

  // 执行打卡
  async function handleCheckIn() {
    if (!selectedChild || !selectedTask) {
      setMessage('请选择孩子和任务');
      return;
    }

    setLoading(true);
    setMessage('');

    // 获取当前孩子积分
    const child = children.find(c => c.id === selectedChild);
    if (!child) {
      setMessage('孩子不存在');
      setLoading(false);
      return;
    }

    const task = tasks.find(t => t.id === selectedTask);
    if (!task) {
      setMessage('任务不存在');
      setLoading(false);
      return;
    }

    const scoreBefore = child.total_score;
    const pointsToAdd = task.points;
    const scoreAfter = scoreBefore + pointsToAdd;

    // 计算新等级（阈值：0, 40, 100, 180, 280, 400, 540, 700）
    const thresholds = [0, 40, 100, 180, 280, 400, 540, 700];
    let newLevel = 0;
    for (let i = 0; i < thresholds.length; i++) {
      if (scoreAfter >= thresholds[i]) newLevel = i;
    }

    // 调用 Supabase RPC 或直接更新（这里用事务模拟）
    // 实际项目可用 Supabase 函数，这里简化：先插入打卡记录，再更新孩子
    const { error: checkInError } = await supabase.from('check_ins').insert({
      child_id: selectedChild,
      task_id: selectedTask,
      points: pointsToAdd,
      score_before: scoreBefore,
      score_after: scoreAfter,
      check_in_date: new Date().toISOString().split('T')[0],
    });

    if (checkInError) {
      setMessage('打卡失败: ' + checkInError.message);
      setLoading(false);
      return;
    }

    // 更新孩子积分和等级
    const { error: updateError } = await supabase
      .from('children')
      .update({ total_score: scoreAfter, level: newLevel })
      .eq('id', selectedChild);

    if (updateError) {
      setMessage('更新积分失败: ' + updateError.message);
      setLoading(false);
      return;
    }

    // 刷新孩子列表
    await fetchChildren();
    setMessage(`✅ 打卡成功！${child.name} 获得 ${pointsToAdd} 分，当前共 ${scoreAfter} 分，等级 Lv.${newLevel}`);
    setLoading(false);
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  // 获取等级对应的表情
  const getPetEmoji = (type: string, level: number) => {
    const emojis = {
      cat: ['🐱', '🐈', '😺', '😸', '😻', '😽', '🙀', '🐾'],
      dog: ['🐶', '🐕', '🐩', '🐾', '🦮', '🐕‍🦺', '🦴', '🐾'],
      rabbit: ['🐰', '🐇', '🐣', '🐥', '🐤', '🐦', '🕊️', '🐾'],
    };
    const list = emojis[type as keyof typeof emojis] || emojis.cat;
    return list[level % list.length] || '🐾';
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 顶部导航 */}
      <nav className="bg-white shadow p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-blue-600">🐾 打卡宠物 · 家长端</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">👋 {profile.family_name || '未命名家庭'}</span>
          <button onClick={handleLogout} className="bg-red-500 text-white px-3 py-1 rounded text-sm">
            退出
          </button>
        </div>
      </nav>

      {/* 主内容 */}
      <div className="p-6 max-w-4xl mx-auto">
        {/* 打卡卡片 */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-bold mb-4">📋 今日打卡</h2>
          
          {children.length === 0 || tasks.length === 0 ? (
            <p className="text-gray-500">请先在后台添加孩子和任务（或刷新后重试）</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">选择孩子</label>
                  <select
                    className="w-full p-2 border rounded"
                    value={selectedChild}
                    onChange={(e) => setSelectedChild(e.target.value)}
                  >
                    {children.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Lv.{c.level} · {c.total_score}分)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">选择任务</label>
                  <select
                    className="w-full p-2 border rounded"
                    value={selectedTask}
                    onChange={(e) => setSelectedTask(e.target.value)}
                  >
                    {tasks.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} (+{t.points}分)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={handleCheckIn}
                disabled={loading}
                className="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
              >
                {loading ? '打卡中...' : '✅ 打卡！'}
              </button>
              {message && (
                <div className={`mt-3 p-2 rounded text-sm ${message.startsWith('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {message}
                </div>
              )}
            </>
          )}
        </div>

        {/* 统计看板 */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-bold mb-4">📊 统计看板</h2>
          {children.length === 0 ? (
            <p className="text-gray-500">暂无孩子数据</p>
          ) : (
            <div className="space-y-4">
              {children.map(child => (
                <ChildStats key={child.id} childId={child.id} childName={child.name} />
              ))}
            </div>
          )}
        </div>

        {/* 孩子状态卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        {/* 商店管理 - 待确认兑换 */}
        <div className="mt-6 bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold mb-4">🏪 兑换申请管理</h2>
          <div id="redemption-list">
            <PendingRedemptions onAction={fetchChildren} />
          </div>
        </div>                
      </div>
    </div>
  );
}

// 待确认兑换列表组件
function PendingRedemptions({ onAction }: { onAction: () => void }) {
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPending();
  }, []);

  async function fetchPending() {
    const { data: pendingData, error } = await supabase
      .from('redemptions')
      .select('*, children(name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) {
      console.error('获取兑换列表失败:', error);
    } else {
      setRedemptions(pendingData || []);
    }
  }

  async function handleConfirm(id: string, childId: string, cost: number) {
    if (!confirm('确认兑换？将扣除孩子积分。')) return;
    setLoading(true);

    // 先获取孩子当前积分
    const { data: childData, error: childError } = await supabase
      .from('children')
      .select('total_score')
      .eq('id', childId)
      .single();

    if (childError || !childData) {
      alert('获取孩子积分失败');
      setLoading(false);
      return;
    }

    const scoreBefore = childData.total_score;
    if (scoreBefore < cost) {
      alert('孩子积分不足，无法兑换');
      setLoading(false);
      return;
    }
    const scoreAfter = scoreBefore - cost;

    // 更新兑换状态
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
      setLoading(false);
      return;
    }

    // 更新孩子积分
    const { error: updateChildError } = await supabase
      .from('children')
      .update({ total_score: scoreAfter })
      .eq('id', childId);

    if (updateChildError) {
      alert('扣除积分失败: ' + updateChildError.message);
      setLoading(false);
      return;
    }

    alert('✅ 兑换确认成功！');
    setLoading(false);
    await fetchPending();
    onAction(); // 刷新家长端孩子列表
  }

  async function handleCancel(id: string) {
    if (!confirm('取消兑换申请？')) return;
    setLoading(true);

    const { error } = await supabase
      .from('redemptions')
      .update({ status: 'cancelled' })
      .eq('id', id);

    if (error) {
      alert('取消失败: ' + error.message);
    } else {
      alert('已取消兑换申请');
      await fetchPending();
    }
    setLoading(false);
  }

  if (redemptions.length === 0) {
    return <p className="text-gray-400 text-sm">暂无待确认的兑换申请</p>;
  }

  return (
    <div className="space-y-2">
      {redemptions.map((r: any) => (
        <div key={r.id} className="flex items-center justify-between border-b pb-2">
          <div>
            <span className="font-medium">{r.reward_name}</span>
            <span className="text-xs text-gray-500 ml-2">需要 {r.points_cost} 分</span>
            <span className="text-xs text-gray-400 ml-2">👶 {r.children?.name || '未知孩子'}</span>
            <span className="text-xs text-yellow-600 ml-2">⏳ 待确认</span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => handleConfirm(r.id, r.child_id, r.points_cost)}
              disabled={loading}
              className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600 disabled:bg-gray-400"
            >
              确认
            </button>
            <button
              onClick={() => handleCancel(r.id)}
              disabled={loading}
              className="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600 disabled:bg-gray-400"
            >
              取消
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// 子组件：单个孩子的统计
function ChildStats({ childId, childName }: { childId: string; childName: string }) {
  const [heatmapData, setHeatmapData] = useState<{ date: string; count: number }[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [childId]);

  async function fetchStats() {
    setLoading(true);
    // 获取最近30天的打卡记录
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];

    // ✅ 修正：解构出 data 并重命名为 checkInsData
    const { data: checkInsData, error } = await supabase
      .from('check_ins')
      .select('check_in_date')
      .eq('child_id', childId)
      .gte('check_in_date', startDate)
      .order('check_in_date', { ascending: true });

    if (error) {
      console.error('获取打卡统计失败:', error);
      setLoading(false);
      return;
    }

    // 构建热力图数据：按日期分组计数
    const dateCount: Record<string, number> = {};
    // ✅ 使用 checkInsData
    checkInsData?.forEach(record => {
      const date = record.check_in_date;
      dateCount[date] = (dateCount[date] || 0) + 1;
    });

    // 生成最近30天的完整列表（补全缺失日期）
    const result: { date: string; count: number }[] = [];
    const current = new Date(startDate);
    const end = new Date();
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      result.push({
        date: dateStr,
        count: dateCount[dateStr] || 0,
      });
      current.setDate(current.getDate() + 1);
    }
    setHeatmapData(result);

    // 计算连续打卡天数（从今天往前数）
    let streakCount = 0;
    // ✅ 使用 checkInsData
    const checkDates = new Set(checkInsData?.map(r => r.check_in_date) || []);
    let checkDate = new Date();
    while (true) {
      const dateStr = checkDate.toISOString().split('T')[0];
      if (checkDates.has(dateStr)) {
        streakCount++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    setStreak(streakCount);
    setLoading(false);
  }

  if (loading) return <div>加载统计中...</div>;

  // 热力图（简单方块显示，后续可用 recharts 做更美观的）
  return (
    <div className="border rounded p-4">
      <h3 className="font-semibold text-md mb-2">{childName} 的统计</h3>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm text-gray-600">🔥 连续打卡：{streak} 天</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {heatmapData.map((item, idx) => {
          const color = item.count === 0 ? 'bg-gray-100' :
                        item.count <= 2 ? 'bg-green-200' :
                        item.count <= 4 ? 'bg-green-400' :
                        'bg-green-600';
          return (
            <div
              key={idx}
              className={`w-6 h-6 rounded ${color} hover:scale-110 transition-transform cursor-default`}
              title={`${item.date}: ${item.count} 次打卡`}
            ></div>
          );
        })}
      </div>
    </div>
  );
}