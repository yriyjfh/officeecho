/**
 * 屏幕端情绪记录服务
 * 负责记录和查询学生的情绪状态
 */

import { getApiBaseUrl } from '../../config/api';

const getApiUrl = () => getApiBaseUrl();

export type MoodType = 'happy' | 'calm' | 'sad' | 'anxious' | 'angry' | 'tired';

export interface MoodRecord {
  id?: number;
  family_id: string;
  elderly_id?: number;
  mood_type: MoodType;
  mood_score: number;  // 1-10
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

/**
 * 情绪类型对应的分数范围
 */
export const moodScoreMap: Record<MoodType, number> = {
  happy: 9,
  calm: 7,
  sad: 3,
  anxious: 4,
  angry: 2,
  tired: 5,
};

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
 * 创建情绪记录
 */
export async function createMoodRecord(
  familyId: string,
  moodType: MoodType,
  options?: {
    elderlyId?: number;
    moodScore?: number;
    note?: string;
    source?: 'manual' | 'ai_detect' | 'voice';
    triggerEvent?: string;
    location?: string;
    weather?: string;
  }
): Promise<number> {
  try {
    const recordData: any = {
      family_id: familyId,
      mood_type: moodType,
      mood_score: options?.moodScore || moodScoreMap[moodType],
      source: options?.source || 'manual',
    };

    if (options?.elderlyId) {
      recordData.elderly_id = options.elderlyId;
    }
    if (options?.note) {
      recordData.note = options.note;
    }
    if (options?.triggerEvent) {
      recordData.trigger_event = options.triggerEvent;
    }
    if (options?.location) {
      recordData.location = options.location;
    }
    if (options?.weather) {
      recordData.weather = options.weather;
    }

    const response = await fetch(`${getApiUrl()}/elderly/moods`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(recordData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('创建情绪记录失败:', errorData);
      throw new Error(errorData.error || '创建情绪记录失败');
    }

    const data = await response.json();
    console.log('情绪记录创建成功，ID:', data.record_id);
    return data.record_id;
  } catch (error) {
    console.error('创建情绪记录错误:', error);
    throw error;
  }
}

/**
 * 获取情绪记录列表
 */
export async function getMoodRecords(
  familyId: string,
  options?: {
    elderlyId?: number;
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
    if (options?.limit) {
      params.append('limit', options.limit.toString());
    }
    if (options?.offset) {
      params.append('offset', options.offset.toString());
    }

    const response = await fetch(`${getApiUrl()}/elderly/moods?${params}`);

    if (!response.ok) {
      throw new Error(`获取情绪记录失败: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('获取情绪记录错误:', error);
    throw error;
  }
}

/**
 * 获取今日情绪记录
 */
export async function getTodayMoods(
  familyId: string,
  elderlyId?: number
): Promise<MoodRecord[]> {
  try {
    const params = new URLSearchParams({
      family_id: familyId,
    });

    if (elderlyId) {
      params.append('elderly_id', elderlyId.toString());
    }

    const response = await fetch(`${getApiUrl()}/elderly/moods/today?${params}`);

    if (!response.ok) {
      throw new Error(`获取今日情绪记录失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.records || [];
  } catch (error) {
    console.error('获取今日情绪记录错误:', error);
    throw error;
  }
}

/**
 * 获取最新情绪记录
 */
export async function getLatestMood(
  familyId: string,
  elderlyId?: number
): Promise<MoodRecord | null> {
  try {
    const params = new URLSearchParams({
      family_id: familyId,
    });

    if (elderlyId) {
      params.append('elderly_id', elderlyId.toString());
    }

    const response = await fetch(`${getApiUrl()}/elderly/moods/latest?${params}`);

    if (!response.ok) {
      throw new Error(`获取最新情绪记录失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.record;
  } catch (error) {
    console.error('获取最新情绪记录错误:', error);
    throw error;
  }
}
