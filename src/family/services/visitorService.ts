/**
 * 学生信息服务
 * 管理学生个人资料的读取和保存
 */

const API_BASE = `http://${window.location.hostname}:8000`;

export interface VisitorInfo {
  name: string;
  cognitive_status: string;
  cognitive_status_label: string;
  hearing: string;
  hearing_label: string;
  vision: string;
  vision_label: string;
  hobbies: string;
  hobbies_list: string[];
  avoid_topics: string;
  avoid_topics_list: string[];
}

export interface VisitorUpdateData {
  name?: string;
  cognitive_status?: string;
  hearing?: string;
  vision?: string;
  hobbies?: string;
  avoid_topics?: string;
}

/**
 * 获取学生信息
 */
export async function getVisitorInfo(): Promise<VisitorInfo> {
  const response = await fetch(`${API_BASE}/api/visitor/info`);
  if (!response.ok) {
    throw new Error('获取学生信息失败');
  }
  const data = await response.json();
  return data.visitor;
}

/**
 * 更新学生信息
 */
export async function updateVisitorInfo(data: VisitorUpdateData): Promise<void> {
  const response = await fetch(`${API_BASE}/api/visitor/info`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('保存学生信息失败');
  }
}

/**
 * 将前端 ElderInfo 格式转换为后端 API 格式
 */
export function convertToApiFormat(elderInfo: {
  name: string;
  cognitive_status: string;
  hearing_vision: {
    hearing: string;
    vision: string;
  };
  preferences: {
    music: string[];
    avoid_topics: string[];
  };
}): VisitorUpdateData {
  // 前端使用 ok/mild_loss/moderate_loss/severe_loss
  // 后端使用 normal/mild/moderate/severe
  const hearingMap: Record<string, string> = {
    'ok': 'normal',
    'mild_loss': 'mild',
    'moderate_loss': 'moderate',
    'severe_loss': 'severe',
  };
  const visionMap: Record<string, string> = {
    'ok': 'normal',
    'mild_loss': 'mild',
    'moderate_loss': 'moderate',
    'severe_loss': 'severe',
  };

  return {
    name: elderInfo.name,
    cognitive_status: elderInfo.cognitive_status,
    hearing: hearingMap[elderInfo.hearing_vision.hearing] || elderInfo.hearing_vision.hearing,
    vision: visionMap[elderInfo.hearing_vision.vision] || elderInfo.hearing_vision.vision,
    hobbies: elderInfo.preferences.music.join(','),
    avoid_topics: elderInfo.preferences.avoid_topics.join(','),
  };
}

/**
 * 将后端 API 格式转换为前端 ElderInfo 格式
 */
export function convertFromApiFormat(visitor: VisitorInfo): {
  name: string;
  age: number;
  cognitive_status: 'normal' | 'mild' | 'moderate' | 'severe';
  hearing_vision: {
    hearing: 'ok' | 'mild_loss' | 'moderate_loss' | 'severe_loss';
    vision: 'ok' | 'mild_loss' | 'moderate_loss' | 'severe_loss';
  };
  preferences: {
    music: string[];
    avoid_topics: string[];
  };
} {
  // 后端使用 normal/mild/moderate/severe
  // 前端使用 ok/mild_loss/moderate_loss/severe_loss
  const hearingMap: Record<string, 'ok' | 'mild_loss' | 'moderate_loss' | 'severe_loss'> = {
    'normal': 'ok',
    'mild': 'mild_loss',
    'moderate': 'moderate_loss',
    'severe': 'severe_loss',
  };
  const visionMap: Record<string, 'ok' | 'mild_loss' | 'moderate_loss' | 'severe_loss'> = {
    'normal': 'ok',
    'mild': 'mild_loss',
    'moderate': 'moderate_loss',
    'severe': 'severe_loss',
  };

  return {
    name: visitor.name,
    age: 0, // 后端没有存储年龄
    cognitive_status: (visitor.cognitive_status || 'normal') as 'normal' | 'mild' | 'moderate' | 'severe',
    hearing_vision: {
      hearing: hearingMap[visitor.hearing] || 'ok',
      vision: visionMap[visitor.vision] || 'ok',
    },
    preferences: {
      music: visitor.hobbies_list || [],
      avoid_topics: visitor.avoid_topics_list || [],
    },
  };
}
