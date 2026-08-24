/** 跨页面共享的数据类型（原先在两个 Dashboard 里各定义一份） */

export interface Profile {
  id: string;
  username: string;
  role: 'parent' | 'child';
  family_id: string | null;
}

export interface Child {
  id: string;
  family_id: string;
  name: string;
  pet_type: string;
  total_score: number;
  level: number;
}

export interface Task {
  id: string;
  family_id: string;
  name: string;
  category: string;
  points: number;
  is_active: boolean;
}

/** 奖励目录项（rewards 表），child_id 为 null 表示全家通用 */
export interface Reward {
  id: string;
  family_id: string;
  child_id: string | null;
  name: string;
  points_cost: number;
  is_active: boolean;
}

/** 兑换流水（redemptions 表） */
export interface Redemption {
  id: string;
  family_id: string;
  child_id: string;
  reward_id: string | null;
  reward_name: string;
  points_cost: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'rejected';
  score_before: number;
  score_after: number;
  requested_at: string;
  confirmed_at: string | null;
  children?: { name: string } | null;
}

export interface CheckInRequest {
  id: string;
  child_id: string;
  task_id: string;
  points: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  children?: { name: string } | null;
  tasks?: { name: string; points: number } | null;
}

/** check_ins 连带 tasks 的查询行（两端的今日打卡 / 热力图共用） */
export interface CheckInRow {
  check_in_date: string;
  points: number | null;
  /** 家长端代打卡需要按任务维度统计今日次数 */
  task_id?: string | null;
  tasks?: { name: string } | null;
}

/** 按任务聚合后的当日打卡 */
export interface TodayCheckIn {
  task_name: string;
  points: number;
  count: number;
}

/** 当日已确认的兑换（redemptions 的投影） */
export interface TodayRedemption {
  reward_name: string;
  points_cost: number;
  status: string;
  confirmed_at?: string | null;
}

export interface HeatmapDatum {
  date: string;
  count: number;
}
