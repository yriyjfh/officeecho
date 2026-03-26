/**
 * 屏幕端 - 课表管理服务
 * 侧重于课表查看和提醒功能
 */

import { getApiBaseUrl } from '../../config/api';

const getApiUrl = () => getApiBaseUrl();

export interface Schedule {
  id?: number;
  family_id: string;
  title: string;
  description?: string;
  schedule_type?: 'meeting' | 'off_work' | 'reception' | 'break' | 'other'|'math'|'politics'|'history'|'physics'|'chemistry'|'art'|'sports' ;
  schedule_time: string;
  repeat_type?: 'once' | 'daily' | 'weekly' | 'monthly';
  repeat_days?: string;
  status?: 'pending' | 'completed' | 'skipped' | 'missed';
  completed_at?: string;
  auto_remind?: number;
  is_active?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Reminder {
  id: number;
  schedule_id: number;
  elderly_id: number;
  remind_time: string;
  status: 'pending' | 'completed' | 'missed' | 'dismissed';
  completed_at?: string;
  created_at?: string;
}

export interface ScheduleResponse {
  schedules: Schedule[];
}

export interface ActionResponse {
  success: boolean;
}

/**
 * 获取今日计划
 */
export async function getTodaySchedules(familyId: string): Promise<Schedule[]> {
  try {
    const response = await fetch(
      `${getApiUrl()}/elderly/schedules/today?family_id=${familyId}`
    );

    if (!response.ok) {
      throw new Error(`获取今日计划失败: ${response.statusText}`);
    }

    const data: ScheduleResponse = await response.json();
    return data.schedules || [];
  } catch (error) {
    console.error('获取今日计划错误:', error);
    throw error;
  }
}

/**
 * 获取即将到来的课表（下一小时内）
 */
export async function getUpcomingSchedules(
  familyId: string,
  elderlyId?: string
): Promise<Schedule[]> {
  try {
    const url = new URL(`${getApiUrl()}/elderly/schedules/upcoming`);
    url.searchParams.append('family_id', familyId);
    if (elderlyId) {
      url.searchParams.append('elderly_id', elderlyId);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`获取即将到来的课表失败: ${response.statusText}`);
    }

    const data: ScheduleResponse = await response.json();
    return data.schedules || [];
  } catch (error) {
    console.error('获取即将到来的课表错误:', error);
    throw error;
  }
}

/**
 * 标记提醒为已完成
 */
export async function completeReminder(reminderId: number): Promise<boolean> {
  try {
    const response = await fetch(
      `${getApiUrl()}/elderly/reminders/${reminderId}/complete`,
      {
        method: 'POST',
      }
    );

    if (!response.ok) {
      throw new Error(`标记提醒完成失败: ${response.statusText}`);
    }

    const data: ActionResponse = await response.json();
    return data.success;
  } catch (error) {
    console.error('标记提醒完成错误:', error);
    throw error;
  }
}

/**
 * 忽略提醒
 */
export async function dismissReminder(reminderId: number): Promise<boolean> {
  try {
    const response = await fetch(
      `${getApiUrl()}/elderly/reminders/${reminderId}/dismiss`,
      {
        method: 'POST',
      }
    );

    if (!response.ok) {
      throw new Error(`忽略提醒失败: ${response.statusText}`);
    }

    const data: ActionResponse = await response.json();
    return data.success;
  } catch (error) {
    console.error('忽略提醒错误:', error);
    throw error;
  }
}

/**
 * 更新课表状态
 */
export async function updateScheduleStatus(
  scheduleId: number,
  status: 'pending' | 'completed' | 'skipped' | 'missed'
): Promise<boolean> {
  try {
    const response = await fetch(
      `${getApiUrl()}/elderly/schedules/${scheduleId}/status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      }
    );

    if (!response.ok) {
      throw new Error(`更新课表状态失败: ${response.statusText}`);
    }

    const data: ActionResponse = await response.json();
    return data.success;
  } catch (error) {
    console.error('更新课表状态错误:', error);
    throw error;
  }
}

/**
 * 获取课表类型的显示名称
 */
export function getScheduleTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    meeting: '👥 开会',
    off_work: '🏠 查寝',
    reception: '👋 评奖评优',
    break: '☕ 休息',
    math: '🔢 数学',          //数学
    politics: '📜 政治',      // 政治
    history: '⏳ 历史',       // 历史
    physics: '⚛️ 物理',       // 物理
    chemistry: '🧪 化学',     // 化学
    art: '🎨 美术',           // 美术
    sports: '🏃 体育',        // 体育
    other: '📝 其他',
  };
  return labels[type] || type;
}

/**
 * 获取课表类型图标
 */
export function getScheduleTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    meeting: '👥',
    off_work: '🏠',
    reception: '👋',
    break: '☕',
    math: '🔢',          //数学
    politics: '📜',      // 政治
    history: '⏳',       // 历史
    physics: '⚛️',       // 物理
    chemistry: '🧪',     // 化学
    art: '🎨',           // 美术
    sports: '🏃',        // 体育
    other: '📝',
  };
  return icons[type] || '📅';
}

/**
 * 格式化时间显示（HH:MM）
 */
export function formatTime(dateTimeStr: string): string {
  try {
    const date = new Date(dateTimeStr);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return dateTimeStr;
  }
}

/**
 * 格式化日期显示（MM月DD日）
 */
export function formatDate(dateTimeStr: string): string {
  try {
    const date = new Date(dateTimeStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  } catch {
    return dateTimeStr;
  }
}

/**
 * 判断课表是否即将开始（15分钟内）
 */
export function isScheduleSoon(scheduleTime: string): boolean {
  try {
    const now = new Date();
    const scheduleDate = new Date(scheduleTime);
    const diffMs = scheduleDate.getTime() - now.getTime();
    const diffMinutes = diffMs / (1000 * 60);
    return diffMinutes > 0 && diffMinutes <= 15;
  } catch {
    return false;
  }
}

/**
 * 判断课表是否已过期
 */
export function isSchedulePast(scheduleTime: string): boolean {
  try {
    const now = new Date();
    const scheduleDate = new Date(scheduleTime);
    return scheduleDate.getTime() < now.getTime();
  } catch {
    return false;
  }
}

/**
 * 按时间排序课表（从早到晚）
 */
export function sortSchedulesByTime(schedules: Schedule[]): Schedule[] {
  return [...schedules].sort((a, b) => {
    return new Date(a.schedule_time).getTime() - new Date(b.schedule_time).getTime();
  });
}

/**
 * 过滤今日有效课表
 */
export function filterTodaySchedules(schedules: Schedule[]): Schedule[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return schedules.filter((schedule) => {
    const scheduleDate = new Date(schedule.schedule_time);
    return scheduleDate >= today && scheduleDate < tomorrow;
  });
}
