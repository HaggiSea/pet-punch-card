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
      <span className="absolute inset-0 flex items-center justify-center text-[8px] text-gray-600 opacity-30">
        {day}
      </span>
      {showDetail && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap z-10 shadow-lg pointer-events-none">
          {month + 1}月{day}日: {count} 次打卡
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
    <div className="bg-white p-6 rounded-lg shadow mb-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">{title}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            className="px-2 py-1 border rounded text-sm hover:bg-gray-100"
            aria-label="上个月"
          >
            ◀
          </button>
          <span className="text-sm font-medium min-w-[100px] text-center">
            {year}年 {monthIndex + 1}月
          </span>
          <button
            onClick={() => shiftMonth(1)}
            className="px-2 py-1 border rounded text-sm hover:bg-gray-100"
            aria-label="下个月"
          >
            ▶
          </button>
          <button
            onClick={() => onMonthChange(new Date())}
            className={`px-2 py-1 border rounded text-sm hover:bg-gray-100 ${ACCENT_TEXT[accent]}`}
          >
            今天
          </button>
        </div>
      </div>

      {emptyHint ? (
        <p className="text-gray-500 text-center py-4">{emptyHint}</p>
      ) : (
        <div>
          <div className="grid grid-cols-7 gap-1 mb-1 text-center text-xs text-gray-400">
            <div>日</div><div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div>
          </div>
          <div className="grid grid-cols-7 gap-1">
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
          <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
            <span>少</span>
            <div className="w-4 h-4 bg-gray-100 rounded border border-gray-200"></div>
            <div className="w-4 h-4 bg-green-200 rounded"></div>
            <div className="w-4 h-4 bg-green-400 rounded"></div>
            <div className="w-4 h-4 bg-green-600 rounded"></div>
            <div className="w-4 h-4 bg-green-800 rounded"></div>
            <span>多</span>
            <span className="ml-2 text-gray-400">（点击或悬停查看详情）</span>
          </div>
          <div className="mt-3 text-xs text-gray-400">
            当月打卡总次数: {totalCount} 次 | 打卡天数: {activeDays} 天
          </div>
        </div>
      )}
    </div>
  );
}
