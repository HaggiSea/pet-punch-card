/**
 * 宠物等级。
 *
 * 阈值原先在 ParentDashboard 与 ChildDashboard 各硬编码了一份，
 * 现集中到这里，并与数据库 public.level_for_score() 保持一致。
 * 改动阈值时两处必须同步。
 */

export const LEVEL_THRESHOLDS = [0, 40, 100, 180, 280, 400, 540, 700] as const;

export const MAX_LEVEL = LEVEL_THRESHOLDS.length - 1;

/** 积分对应的等级 */
export function levelForScore(score: number): number {
  const s = Math.max(0, score || 0);
  let level = 0;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (s >= LEVEL_THRESHOLDS[i]) level = i;
  }
  return level;
}

/**
 * 升级进度。
 *
 * 原先的算法是 `total_score / nextThreshold`，进度条从 0 分起跳就不是 0，
 * 且满级后 `find` 拿不到阈值会回落成 700，显示错乱。
 * 这里改为「当前等级区间内的百分比」，满级固定 100%。
 */
export function levelProgress(score: number): {
  level: number;
  isMaxLevel: boolean;
  currentThreshold: number;
  nextThreshold: number | null;
  pointsToNext: number;
  percent: number;
} {
  const s = Math.max(0, score || 0);
  const level = levelForScore(s);
  const isMaxLevel = level >= MAX_LEVEL;
  const currentThreshold = LEVEL_THRESHOLDS[level];
  const nextThreshold = isMaxLevel ? null : LEVEL_THRESHOLDS[level + 1];

  if (nextThreshold === null) {
    return {
      level,
      isMaxLevel: true,
      currentThreshold,
      nextThreshold: null,
      pointsToNext: 0,
      percent: 100,
    };
  }

  const span = nextThreshold - currentThreshold;
  const gained = s - currentThreshold;
  const percent = span > 0 ? Math.min(100, Math.max(0, (gained / span) * 100)) : 0;

  return {
    level,
    isMaxLevel: false,
    currentThreshold,
    nextThreshold,
    pointsToNext: Math.max(0, nextThreshold - s),
    percent,
  };
}
