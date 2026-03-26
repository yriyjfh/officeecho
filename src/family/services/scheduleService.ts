/**
 * 管理端 - 课表管理服务
 * 提供课表计划的增删改查功能
 */

import { getApiBaseUrl } from '../../config/api';

const getApiUrl = () => getApiBaseUrl();

export interface Schedule {
  id?: number;
  family_id: string;
  title: string;
  description?: string;
  schedule_type?: 'meeting' | 'off_work' | 'reception' | 'break' | 'other'|'math'|'politics'|'history'|'physics'|'chemistry'|'art'|'sports';
  schedule_time: string; // ISO 8601 格式
  repeat_type?: 'once' | 'daily' | 'weekly' | 'monthly';
  repeat_days?: string; // JSON 字符串，如 "[1,3,5]"
  status?: 'pending' | 'completed' | 'skipped' | 'missed';
  completed_at?: string;
  auto_remind?: number; // 数字人自动播报：1=启用，0=禁用
  is_active?: number;
  created_by?: number;
  created_at?: string;
  updated_at?: string;
  creator_name?: string;
}

export interface ScheduleResponse {
  schedules: Schedule[];
}

export interface CreateScheduleResponse {
  success: boolean;
  schedule_id: number;
}

export interface UpdateScheduleResponse {
  success: boolean;
}

/**
 * 获取家庭所有课表
 */
export async function getFamilySchedules(familyId: string): Promise<Schedule[]> {
  try {
    const response = await fetch(
      `${getApiUrl()}/family/schedules?family_id=${familyId}`
    );

    if (!response.ok) {
      throw new Error(`获取课表失败: ${response.statusText}`);
    }

    const data: ScheduleResponse = await response.json();
    return data.schedules || [];
  } catch (error) {
    console.error('获取课表错误:', error);
    throw error;
  }
}

/**
 * 创建新课表
 */
export async function createSchedule(schedule: Schedule): Promise<number> {
  try {
    const response = await fetch(`${getApiUrl()}/family/schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(schedule),
    });

    if (!response.ok) {
      throw new Error(`创建课表失败: ${response.statusText}`);
    }

    const data: CreateScheduleResponse = await response.json();
    return data.schedule_id;
  } catch (error) {
    console.error('创建课表错误:', error);
    throw error;
  }
}

/**
 * 更新课表
 */
export async function updateSchedule(
  scheduleId: number,
  updates: Partial<Schedule>
): Promise<boolean> {
  try {
    const response = await fetch(
      `${getApiUrl()}/family/schedules/${scheduleId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      }
    );

    if (!response.ok) {
      throw new Error(`更新课表失败: ${response.statusText}`);
    }

    const data: UpdateScheduleResponse = await response.json();
    return data.success;
  } catch (error) {
    console.error('更新课表错误:', error);
    throw error;
  }
}

/**
 * 删除课表（软删除）
 */
export async function deleteSchedule(scheduleId: number): Promise<boolean> {
  try {
    const response = await fetch(
      `${getApiUrl()}/family/schedules/${scheduleId}`,
      {
        method: 'DELETE',
      }
    );

    if (!response.ok) {
      throw new Error(`删除课表失败: ${response.statusText}`);
    }

    const data: UpdateScheduleResponse = await response.json();
    return data.success;
  } catch (error) {
    console.error('删除课表错误:', error);
    throw error;
  }
}

/**
 * 格式化日期时间为 ISO 字符串
 */
export function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 获取课表类型的显示名称
 */
export function getScheduleTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    meeting: '开会',
    off_work: '查寝',
    reception: '评奖评优',
    break: '休息',
    math: '数学',          //数学
    politics: '政治',      // 政治
    history: '历史',       // 历史
    physics: '物理',       // 物理
    chemistry: '化学',     // 化学
    art: '美术',           // 美术
    sports: '体育',        // 体育
    other: '其他',
  };
  return labels[type] || type;
}

/**
 * 获取重复类型的显示名称
 */
export function getRepeatTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    once: '单次',
    daily: '每天',
    weekly: '每周',
    monthly: '每月',
  };
  return labels[type] || type;
}

/**
 * 解析重复日期（星期几）
 */
export function parseRepeatDays(repeatDays: string): number[] {
  try {
    return JSON.parse(repeatDays || '[]');
  } catch {
    return [];
  }
}

/**
 * 格式化重复日期为字符串
 */
export function formatRepeatDays(days: number[]): string {
  return JSON.stringify(days);
}

/**
 * 获取星期几的显示名称
 */
export function getWeekdayLabel(day: number): string {
  const labels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return labels[day] || '';
}
