/**
 * 任务 / 奖励列表的显示顺序。
 *
 * 规则由用户定：同类型的条目挨在一起，任务组内积分从大到小，奖励组内所需积分从小到大。
 *
 * 排序放在前端而不是数据库 order()：
 * 新增或编辑条目后列表会重新渲染，派生排序自动把它放到正确位置，
 * 不需要每个写操作都记得重新 fetch 或维护 SQL 的排序子句。
 * 数据库那边的 order() 留着也无害，只当是个初始顺序。
 */

import type { Reward, Task } from './types';

/** 中文名按拼音排，让同分条目的顺序稳定可预期 */
const collator = new Intl.Collator('zh-Hans-CN');

/**
 * 任务：按分类分组，组内积分从大到小。
 *
 * 分类之间的顺序按各组最高积分降序 —— 整个列表读下来积分大致是递减的，
 * 比按分类名字母序更符合「按积分从大到小排列」的直觉。
 */
export function sortTasksForDisplay(tasks: Task[]): Task[] {
  const groupKey = (t: Task) => (t.category || '').trim() || '未分类';

  // 每个分类的最高积分，决定分类之间的先后
  const topPoints = new Map<string, number>();
  for (const t of tasks) {
    const k = groupKey(t);
    const p = t.points ?? 0;
    if (!topPoints.has(k) || p > topPoints.get(k)!) topPoints.set(k, p);
  }

  return [...tasks].sort((a, b) => {
    const ka = groupKey(a);
    const kb = groupKey(b);

    if (ka !== kb) {
      const diff = (topPoints.get(kb) ?? 0) - (topPoints.get(ka) ?? 0);
      if (diff !== 0) return diff;
      return collator.compare(ka, kb); // 最高分相同的分类，按名称定序
    }

    const byPoints = (b.points ?? 0) - (a.points ?? 0);
    if (byPoints !== 0) return byPoints;
    return collator.compare(a.name || '', b.name || '');
  });
}

/**
 * 奖励：按归属分组，组内所需积分从小到大。
 *
 * rewards 表没有 category 字段，唯一的类型维度是 child_id
 * （null = 全家通用，否则是某个孩子专属）。全家通用排在前面，
 * 因为它对所有孩子都有效，属于更常用的一档。
 */
export function sortRewardsForDisplay(rewards: Reward[]): Reward[] {
  const groupKey = (r: Reward) => r.child_id ?? '';

  // 每个归属组的最低所需积分，决定组之间的先后
  const minCost = new Map<string, number>();
  for (const r of rewards) {
    const k = groupKey(r);
    const c = r.points_cost ?? 0;
    if (!minCost.has(k) || c < minCost.get(k)!) minCost.set(k, c);
  }

  return [...rewards].sort((a, b) => {
    const ka = groupKey(a);
    const kb = groupKey(b);

    if (ka !== kb) {
      // 全家通用（child_id 为 null）始终最前
      if (ka === '') return -1;
      if (kb === '') return 1;

      const diff = (minCost.get(ka) ?? 0) - (minCost.get(kb) ?? 0);
      if (diff !== 0) return diff;
      return collator.compare(ka, kb);
    }

    const byCost = (a.points_cost ?? 0) - (b.points_cost ?? 0);
    if (byCost !== 0) return byCost;
    return collator.compare(a.name || '', b.name || '');
  });
}
