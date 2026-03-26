/**
 * 管理端情绪记录服务
 * 负责查询学生的情绪记录和统计数据
 */

import { getApiBaseUrl } from '../../config/api';

const getApiUrl = () => getApiBaseUrl();

export type MoodType = 'happy' | 'calm' | 'sad' | 'anxious' | 'angry' | 'tired';

export interface MoodRecord {
  id?: number;
  family_id: string;
  elderly_id?: number;
  elderly_name?: string;
  mood_type: MoodType;
  mood_score: number;
  note?: string;
  source?: 'manual' | 'ai_detect' | 'voice';
  trigger_event?: string;
  location?: string;
  weather?: string;
  recorded_at?: string;
  created_at?: string;
}

export interface MoodRecordResponse {
  records: MoodRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface MoodTypeStats {
  mood_type: MoodType;
  count: number;
  avg_score: number;
}

export interface DailyStats {
  date: string;
  avg_score: number;
  count: number;
}

export interface MoodStatsResponse {
  mood_type_stats: MoodTypeStats[];
  daily_stats: DailyStats[];
  overall: {
    total_records: number;
    avg_score: number;
    max_score: number;
    min_score: number;
  };
  today_count: number;
  days: number;
}

export interface TrendItem {
  date: string;
  mood_type: MoodType;
  avg_score: number;
  count: number;
}

export interface MoodTrendResponse {
  trend: TrendItem[];
  days: number;
}

/**
 * 情绪类型对应的中文名称
 */
export const moodLabelMap: Record<MoodType, string> = {
  happy: '开心',
  calm: '平静',
  sad: '难过',
  anxious: '焦虑',
  angry: '生气',
  tired: '疲惫',
};

/**
 * 情绪类型对应的emoji
 */
export const moodEmojiMap: Record<MoodType, string> = {
  happy: '😊',
  calm: '😌',
  sad: '😔',
  anxious: '😰',
  angry: '😠',
  tired: '😫',
};

/**
 * 情绪类型对应的颜色
 */
export const moodColorMap: Record<MoodType, string> = {
  happy: '#22c55e',  // green-500
  calm: '#3b82f6',   // blue-500
  sad: '#eab308',    // yellow-500
  anxious: '#f97316', // orange-500
  angry: '#ef4444',  // red-500
  tired: '#8b5cf6',  // violet-500
};

/**
 * 获取家庭情绪记录
 */
export async function getFamilyMoods(
  familyId: string,
  options?: {
    elderlyId?: number;
    moodType?: MoodType;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }
): Promise<MoodRecordResponse> {
  try {
    const params = new URLSearchParams({
      family_id: familyId,
    });

    if (options?.elderlyId) {
      params.append('elderly_id', options.elderlyId.toString());
    }
    if (options?.moodType) {
      params.append('mood_type', options.moodType);
    }
    if (options?.startDate) {
      params.append('start_date', options.startDate);
    }
    if (options?.endDate) {
      params.append('end_date', options.endDate);
    }
    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }
    if (options?.offset) {
      params.append('offset', options.offset.toString());
    }

    const response = await fetch(`${getApiUrl()}/family/moods?${params}`);

    if (!response.ok) {
      throw new Error(`获取情绪记录失败: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('获取家庭情绪记录错误:', error);
    throw error;
  }
}

/**
 * 获取情绪统计数据
 */
export async function getMoodStats(
  familyId: string,
  options?: {
    elderlyId?: number;
    days?: number;
  }
): Promise<MoodStatsResponse> {
  try {
    const params = new URLSearchParams({
      family_id: familyId,
    });

    if (options?.elderlyId) {
      params.append('elderly_id', options.elderlyId.toString());
    }
    if (options?.days) {
      params.append('days', options.days.toString());
    }

    const response = await fetch(`${getApiUrl()}/family/moods/stats?${params}`);

    if (!response.ok) {
      throw new Error(`获取情绪统计失败: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('获取情绪统计错误:', error);
    throw error;
  }
}

/**
 * 获取情绪趋势数据
 */
export async function getMoodTrend(
  familyId: string,
  options?: {
    elderlyId?: number;
    days?: number;
  }
): Promise<MoodTrendResponse> {
  try {
    const params = new URLSearchParams({
      family_id: familyId,
    });

    if (options?.elderlyId) {
      params.append('elderly_id', options.elderlyId.toString());
    }
    if (options?.days) {
      params.append('days', options.days.toString());
    }

    const response = await fetch(`${getApiUrl()}/family/moods/trend?${params}`);

    if (!response.ok) {
      throw new Error(`获取情绪趋势失败: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('获取情绪趋势错误:', error);
    throw error;
  }
}

/**
 * 格式化情绪分数为描述
 */
export function formatMoodScore(score: number): string {
  if (score >= 8) return '非常好';
  if (score >= 6) return '良好';
  if (score >= 4) return '一般';
  if (score >= 2) return '较差';
  return '很差';
}

/**
 * 获取情绪分数对应的颜色
 */
export function getMoodScoreColor(score: number): string {
  if (score >= 8) return '#22c55e';  // green
  if (score >= 6) return '#3b82f6';  // blue
  if (score >= 4) return '#eab308';  // yellow
  if (score >= 2) return '#f97316';  // orange
  return '#ef4444';  // red
}

/**
 * 格式化时间为易读格式
 */
export function formatRecordTime(timeString: string): string {
  const date = new Date(timeString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
