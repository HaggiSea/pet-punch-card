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
}

export default function ChildDashboard({ profile }: ChildDashboardProps) {
  const [child, setChild] = useState<Child | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchChildInfo();
    fetchRewards();
  }, []);

  async function fetchChildInfo() {
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .eq('family_id', profile.id)
      .single();
    if (error) {
      console.error('获取孩子信息失败:', error);
    } else {
      setChild(data);
    }
  }

  async function fetchRewards() {
    // 查询所有 pending 状态的奖励（可兑换列表）
    const { data, error } = await supabase
      .from('redemptions')
      .select('*')
      .eq('child_id', child?.id)
      .eq('status', 'pending');
    if (error) {
      console.error('获取奖励列表失败:', error);
    } else {
      setRewards(data || []);
    }
  }

  async function handleApplyReward(rewardId: string, cost: number) {
    if (!child) return;
    if (child.total_score < cost) {
      setMessage('❌ 积分不足，无法兑换');
      return;
    }

    setLoading(true);
    setMessage('');

    // 更新兑换状态：从 pending 改为 confirmed，并扣除积分
    const scoreBefore = child.total_score;
    const scoreAfter = scoreBefore - cost;

    // 使用事务：先更新 redemptions 状态，再更新孩子积分
    const { error: updateRewardError } = await supabase
      .from('redemptions')
      .update({
        status: 'confirmed',
        score_before: scoreBefore,
        score_after: scoreAfter,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', rewardId);

    if (updateRewardError) {
      setMessage('兑换失败: ' + updateRewardError.message);
      setLoading(false);
      return;
    }

    // 更新孩子积分
    const { error: updateChildError } = await supabase
      .from('children')
      .update({ total_score: scoreAfter })
      .eq('id', child.id);

    if (updateChildError) {
      setMessage('扣除积分失败: ' + updateChildError.message);
      setLoading(false);
      return;
    }

    // 刷新数据
    await fetchChildInfo();
    await fetchRewards();
    setMessage(`✅ 兑换成功！已扣除 ${cost} 积分，剩余 ${scoreAfter} 分`);
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
        {child && (
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
        )}

        {/* 可兑换奖励列表 */}
        <div className="mt-6 bg-white p-6 rounded-lg shadow">
          <h3 className="font-bold text-lg mb-4">🎁 可兑换奖励</h3>
          {rewards.length === 0 ? (
            <p className="text-gray-400 text-sm">暂无可用奖励，去打卡赚积分吧！</p>
          ) : (
            <div className="space-y-2">
              {rewards.map(r => (
                <div key={r.id} className="flex items-center justify-between border-b pb-2">
                  <div>
                    <span className="font-medium">{r.reward_name}</span>
                    <span className="text-xs text-gray-500 ml-2">需要 {r.points_cost} 分</span>
                  </div>
                  <button
                    onClick={() => handleApplyReward(r.id, r.points_cost)}
                    disabled={loading || (child ? child.total_score < r.points_cost : false)}
                    className={`px-3 py-1 rounded text-sm ${
                      child && child.total_score >= r.points_cost
                        ? 'bg-purple-500 text-white hover:bg-purple-600'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    {child && child.total_score >= r.points_cost ? '申请兑换' : '积分不足'}
                  </button>
                </div>
              ))}
            </div>
          )}
          {message && (
            <div className={`mt-3 p-2 rounded text-sm ${message.startsWith('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}