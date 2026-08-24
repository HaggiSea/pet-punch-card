/**
 * 宠物等级。
 *
 * 等级从 Lv.1 起算，共 MAX_LEVEL 级。
 * 早先是 0 基（新建孩子 level=0），导致必须给 Lv.0 安排一个形象，
 * 于是猫狗都顶着一颗蛋；改成 1 基后 Lv.1 就是幼崽，蛋只留给卵生宠物。
 *
 * 阈值与数据库 public.level_for_score() 必须保持一致，
 * 改这里就要同时改 supabase/migrations 下的对应函数。
 */

/** 下标 0 对应 Lv.1，即 LEVEL_THRESHOLDS[n] 是升到 Lv.(n+1) 所需累计积分 */
export const LEVEL_THRESHOLDS = [0, 40, 100, 200, 350, 550] as const;

export const MIN_LEVEL = 1;
export const MAX_LEVEL = LEVEL_THRESHOLDS.length;

/** 升到该等级所需的累计积分；越界夹到有效区间 */
export function thresholdForLevel(level: number): number {
  const lv = Math.min(Math.max(MIN_LEVEL, level || MIN_LEVEL), MAX_LEVEL);
  return LEVEL_THRESHOLDS[lv - 1];
}

/** 积分对应的等级，返回 1..MAX_LEVEL */
export function levelForScore(score: number): number {
  const s = Math.max(0, score || 0);
  let level = MIN_LEVEL;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (s >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

/**
 * 升级进度：当前等级区间内的百分比，满级固定 100%。
 * 用区间百分比而不是 score/nextThreshold，否则刚升级时进度条不是从 0 开始。
 */
export function levelProgress(score: number): {
  level: number;
  nextLevel: number | null;
  isMaxLevel: boolean;
  currentThreshold: number;
  nextThreshold: number | null;
  pointsToNext: number;
  percent: number;
} {
  const s = Math.max(0, score || 0);
  const level = levelForScore(s);
  const isMaxLevel = level >= MAX_LEVEL;
  const currentThreshold = thresholdForLevel(level);
  const nextThreshold = isMaxLevel ? null : LEVEL_THRESHOLDS[level];

  if (nextThreshold === null) {
    return {
      level,
      nextLevel: null,
      isMaxLevel: true,
      currentThreshold,
      nextThreshold: null,
      pointsToNext: 0,
      percent: 100,
    };
  }

  const span = nextThreshold - currentThreshold;
  const gained = s - currentThreshold;
  // 未满级时封顶 99%：差 1 分时真实值是 99.5%，四舍五入会显示成 100%，
  // 进度条看着满了却没升级，孩子会以为卡住了。
  const percent = span > 0 ? Math.min(99, Math.max(0, (gained / span) * 100)) : 0;

  return {
    level,
    nextLevel: level + 1,
    isMaxLevel: false,
    currentThreshold,
    nextThreshold,
    pointsToNext: Math.max(0, nextThreshold - s),
    percent,
  };
}
