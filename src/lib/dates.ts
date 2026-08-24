/**
 * 日期工具。
 *
 * 原先各页面用 `new Date().toISOString().split('T')[0]` 取「今天」，
 * 那是 UTC 日期：北京时间 00:00–08:00 之间会返回前一天，
 * 导致今日打卡统计、今日兑换、热力图当天格子全部错位一天。
 * 这里统一改为按本地时区拼接。
 */

/** 把 Date 格式化为本地时区的 YYYY-MM-DD */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 本地时区的今天，YYYY-MM-DD */
export function todayLocal(): string {
  return toLocalDateString(new Date());
}

/** 指定年月的第一天，YYYY-MM-DD（month 为 0-11） */
export function monthStart(year: number, month: number): string {
  return toLocalDateString(new Date(year, month, 1));
}

/** 指定年月的最后一天，YYYY-MM-DD（month 为 0-11） */
export function monthEnd(year: number, month: number): string {
  return toLocalDateString(new Date(year, month + 1, 0));
}

/**
 * 本地「今天 00:00」对应的 UTC 时间戳。
 * 用于过滤 timestamptz 列（如 redemptions.confirmed_at）：
 * 直接拿 YYYY-MM-DD 去比 timestamptz，Postgres 会按 UTC 零点解读，同样会错位。
 */
export function startOfTodayIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}
