/**
 * 宠物形象。
 * 原先两个 Dashboard 各有一份 emoji 表，且按 level 取模索引，
 * 导致等级越高图标反而循环回起点。这里改为随等级递进的固定序列。
 */

const PET_STAGES: Record<string, string[]> = {
  cat:    ['🥚', '🐱', '🐈', '😺', '😸', '😻', '🐈‍⬛', '🦁'],
  dog:    ['🥚', '🐶', '🐕', '🐩', '🦮', '🐕‍🦺', '🐺', '🐉'],
  rabbit: ['🥚', '🐰', '🐇', '🐣', '🐥', '🐤', '🕊️', '🦄'],
};

export const PET_TYPES = Object.keys(PET_STAGES);

/** 按等级取宠物形象，超出序列长度则保持最后一个 */
export function getPetEmoji(type: string, level: number): string {
  const stages = PET_STAGES[type] || PET_STAGES.cat;
  const idx = Math.min(Math.max(0, level || 0), stages.length - 1);
  return stages[idx];
}
