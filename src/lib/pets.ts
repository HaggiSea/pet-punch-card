/**
 * 宠物形象。
 *
 * 等级从 Lv.1 起算（见 lib/levels.ts），每种宠物有 MAX_LEVEL 个形象，
 * 数组下标 0 对应 Lv.1。
 *
 * 形象设计原则：
 * - Lv.1~Lv.4 是同一物种的真实成长，不跨物种乱跳；
 * - Lv.5~Lv.6 是「传说形态」，作为游戏化奖励，孩子最期待的部分；
 * - 蛋只给卵生的鸟和龙，哺乳类（猫/狗）从幼崽起步。
 *   原先猫的 Lv.0 是蛋，哺乳动物孵蛋不合逻辑，已修正。
 *
 * 兔子曾在列表里，但可用 emoji 只有 🐰🐇 两个，凑不满六段成长
 * （旧表因此跳到小鸡再跳独角兽），已移除。
 */

export interface PetStage {
  emoji: string;
  /** 该阶段的形象名，用于界面展示，让升级看得见 */
  name: string;
}

export interface PetKind {
  /** 存入 children.pet_type 的值 */
  type: string;
  /** 中文名，家长选择宠物时展示 */
  label: string;
  /** 长度 = MAX_LEVEL，下标 0 即 Lv.1 */
  stages: PetStage[];
}

export const PET_KINDS: PetKind[] = [
  {
    type: 'cat',
    label: '猫咪',
    stages: [
      { emoji: '🐱', name: '奶猫' },
      { emoji: '🐈', name: '家猫' },
      { emoji: '😼', name: '机灵猫' },
      { emoji: '🐈‍⬛', name: '黑猫' },
      { emoji: '🐯', name: '小虎' },
      { emoji: '🦁', name: '狮王' },
    ],
  },
  {
    type: 'dog',
    label: '狗狗',
    stages: [
      { emoji: '🐶', name: '奶狗' },
      { emoji: '🐕', name: '小狗' },
      { emoji: '🐩', name: '卷毛狗' },
      { emoji: '🦮', name: '大狗' },
      { emoji: '🐕‍🦺', name: '英雄犬' },
      { emoji: '🐺', name: '狼王' },
    ],
  },
  {
    type: 'bird',
    label: '小鸟',
    stages: [
      { emoji: '🥚', name: '鸟蛋' },
      { emoji: '🐣', name: '破壳' },
      { emoji: '🐥', name: '雏鸟' },
      { emoji: '🐦', name: '小鸟' },
      { emoji: '🦜', name: '彩羽鸟' },
      { emoji: '🦅', name: '雄鹰' },
    ],
  },
  {
    type: 'dragon',
    label: '小龙',
    stages: [
      { emoji: '🥚', name: '龙蛋' },
      { emoji: '🦎', name: '小蜥蜴' },
      { emoji: '🐊', name: '幼龙' },
      { emoji: '🦕', name: '巨龙' },
      { emoji: '🐲', name: '龙首' },
      { emoji: '🐉', name: '真龙' },
    ],
  },
];

export const PET_TYPES = PET_KINDS.map(k => k.type);

const PET_BY_TYPE: Record<string, PetKind> = Object.fromEntries(
  PET_KINDS.map(k => [k.type, k])
);

/** 宠物种类中文名，未知类型回退到猫咪 */
export function getPetLabel(type: string): string {
  return (PET_BY_TYPE[type] || PET_KINDS[0]).label;
}

/**
 * 按等级取该宠物的形象。
 * level 是 1 基的，越界一律夹到有效区间（老数据可能残留 0）。
 */
export function getPetStage(type: string, level: number): PetStage {
  const kind = PET_BY_TYPE[type] || PET_KINDS[0];
  const idx = Math.min(Math.max(1, level || 1), kind.stages.length) - 1;
  return kind.stages[idx];
}

/** 只要 emoji 的便捷形式 */
export function getPetEmoji(type: string, level: number): string {
  return getPetStage(type, level).emoji;
}
