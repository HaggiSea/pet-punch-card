import { useState } from 'react';
import type { HeatmapDatum } from '../lib/types';
import { todayLocal } from '../lib/dates';

/**
 * 打卡热力图。
 * 原先 ParentDashboard / ChildDashboard 各有一份完全相同的实现，此处合并，
 * 差异（主题色）通过 accent 属性传入。
 */

type Accent = 'blue' | 'purple';

const RING: Record<Accent, string> = {
  blue: 'ring-blue-500',
  purple: 'ring-purple-500',
};

const ACCENT_TEXT: Record<Accent, string> = {
  blue: 'text-blue-600',
  purple: 'text-purple-600',
};

function cellColor(count: number): string {
  if (count === 0) return 'bg-gray-100 hover:bg-gray-200';
  if (count <= 2) return 'bg-green-200 hover:bg-green-300';
  if (count <= 4) return 'bg-green-400 hover:bg-green-500';
  if (count <= 6) return 'bg-green-600 hover:bg-green-700';
  return 'bg-green-800 hover:bg-green-900';
}

function HeatmapCell({
  count,
  isToday,
  day,
  month,
  accent,
}: {
  count: number;
  isToday: boolean;
  day: number;
  month: number;
  accent: Accent;
}) {
  const [showDetail, setShowDetail] = useState(false);

  // 深色格子上用浅色数字，否则 green-600/800 上的灰字完全看不见
  const dayTextClass = count > 4 ? 'text-white/70' : 'text-gray-500/70';

  return (
    <div
      className={`aspect-square rounded ${cellColor(count)} transition-all hover:scale-110 hover:shadow-lg cursor-pointer relative ${
        isToday ? `ring-2 ${RING[accent]} ring-offset-1` : ''
      }`}
      onClick={() => {
        setShowDetail(true);
        setTimeout(() => setShowDetail(false), 3000);
      }}
      onMouseEnter={() => setShowDetail(true)}
      onMouseLeave={() => setShowDetail(false)}
    >
      <span
        className={`absolute inset-0 flex items-center justify-center text-[9px] sm:text-[10px] ${dayTextClass}`}
      >
        {day}
      </span>
      {showDetail && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-[11px] rounded whitespace-nowrap z-20 shadow-lg pointer-events-none">
          {month + 1}月{day}日 · {count} 次
        </div>
      )}
    </div>
  );
}

export default function Heatmap({
  title,
  data,
  month,
  onMonthChange,
  accent = 'blue',
  emptyHint,
}: {
  title: string;
  data: HeatmapDatum[];
  month: Date;
  onMonthChange: (next: Date) => void;
  accent?: Accent;
  emptyHint?: string;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const today = todayLocal();

  const shiftMonth = (delta: number) => {
    // 用当月 1 号做基准，避免 31 日 setMonth 溢出到下个月
    onMonthChange(new Date(year, monthIndex + delta, 1));
  };

  const totalCount = data.reduce((sum, d) => sum + d.count, 0);
  const activeDays = data.filter((d) => d.count > 0).length;

  return (
    <div className="bg-white p-4 sm:p-6 rounded-xl shadow mb-4 sm:mb-6">
      {/*
        窄屏下标题与月份导航必须分两行：原先同一行 flex justify-between，
        标题一长就被压成两三字宽竖着折行，把卡片顶部撑出一大片空白。
        sm 以上恢复同一行，宽屏不浪费竖向空间。
      */}
      <div className="mb-3 flex flex-col gap-2 sm:mb-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-bold sm:text-xl">{title}</h2>
        {/* 导航整组不许换行，否则窄屏下「今天」会孤零零掉到下一行 */}
        <div className="flex flex-none items-center gap-1 sm:gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-100"
            aria-label="上个月"
          >
            ◀
          </button>
          {/* 窄屏省掉「年」省一截宽度，min-w 防止月份位数变化时按钮左右跳动 */}
          <span className="min-w-[72px] text-center text-sm font-medium sm:min-w-[100px]">
            <span className="hidden sm:inline">{year}年 </span>
            <span className="sm:hidden">{year}.</span>
            {monthIndex + 1}月
          </span>
          <button
            onClick={() => shiftMonth(1)}
            className="rounded border px-2 py-1 text-sm hover:bg-gray-100"
            aria-label="下个月"
          >
            ▶
          </button>
          <button
            onClick={() => onMonthChange(new Date())}
            className={`rounded border px-2 py-1 text-sm hover:bg-gray-100 ${ACCENT_TEXT[accent]}`}
          >
            今天
          </button>
        </div>
      </div>

      {emptyHint ? (
        <p className="text-gray-500 text-center py-4">{emptyHint}</p>
      ) : (
        <div>
          <div className="grid grid-cols-7 gap-1 mb-1 text-center text-[11px] text-gray-400 sm:gap-1.5 sm:text-xs">
            <div>日</div><div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div>
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square"></div>
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const datum = data.find((d) => d.date === dateStr);
              return (
                <HeatmapCell
                  key={dateStr}
                  count={datum?.count || 0}
                  isToday={dateStr === today}
                  day={day}
                  month={monthIndex}
                  accent={accent}
                />
              );
            })}
          </div>
          {/* 图例格子在窄屏缩到 3.5，留出「点击方块看详情」的位置 */}
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-gray-500 sm:gap-2 sm:text-xs">
            <span>少</span>
            <div className="h-3.5 w-3.5 rounded border border-gray-200 bg-gray-100 sm:h-4 sm:w-4"></div>
            <div className="h-3.5 w-3.5 rounded bg-green-200 sm:h-4 sm:w-4"></div>
            <div className="h-3.5 w-3.5 rounded bg-green-400 sm:h-4 sm:w-4"></div>
            <div className="h-3.5 w-3.5 rounded bg-green-600 sm:h-4 sm:w-4"></div>
            <div className="h-3.5 w-3.5 rounded bg-green-800 sm:h-4 sm:w-4"></div>
            <span>多</span>
            {/* 触屏没有悬停，这里只提点击；原先标题里也写了一遍，已去掉重复 */}
            <span className="ml-2 text-gray-400">点击方块看详情</span>
          </div>
          <div className="mt-2 text-[11px] text-gray-400 sm:mt-3 sm:text-xs">
            当月共 {totalCount} 次 · {activeDays} 天打卡
          </div>
        </div>
      )}
    </div>
  );
}
