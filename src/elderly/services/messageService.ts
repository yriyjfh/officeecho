/**
 * 屏幕端通知服务
 * 负责获取待播报的通知、标记已播放、点赞等操作
 */

import { getApiBaseUrl } from '../../config/api';

const getApiUrl = () => getApiBaseUrl();

export interface ElderlyMessage {
  id: number;
  family_id: string;
  content: string;
  sender_name: string;
  sender_relation: string;
  scheduled_time: string;
  played: boolean;
  played_at?: string;
  liked: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * 获取所有通知（按预约时间排序）
 */
export async function getMessages(familyId: string): Promise<ElderlyMessage[]> {
  try {
    const response = await fetch(
      `${getApiUrl()}/elderly/messages?family_id=${familyId}`
    );

    if (!response.ok) {
      throw new Error(`获取通知失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error('获取通知错误:', error);
    throw error;
  }
}

/**
 * 获取待播放的通知（预约时间已到但未播放的）
 */
export async function getPendingMessages(familyId: string): Promise<ElderlyMessage[]> {
  try {
    const response = await fetch(
      `${getApiUrl()}/elderly/messages/pending?family_id=${familyId}`
    );

    if (!response.ok) {
      throw new Error(`获取待播放通知失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.messages || [];
  } catch (error) {
    console.error('获取待播放通知错误:', error);
    throw error;
  }
}

/**
 * 标记通知为已播放
 */
export async function markAsPlayed(messageId: number): Promise<boolean> {
  try {
    const response = await fetch(
      `${getApiUrl()}/elderly/messages/${messageId}/play`,
      {
        method: 'POST',
      }
    );

    if (!response.ok) {
      throw new Error(`标记已播放失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('标记已播放错误:', error);
    throw error;
  }
}

/**
 * 点赞通知
 */
export async function likeMessage(messageId: number): Promise<boolean> {
  try {
    const response = await fetch(
      `${getApiUrl()}/elderly/messages/${messageId}/like`,
      {
        method: 'POST',
      }
    );

    if (!response.ok) {
      throw new Error(`点赞通知失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('点赞通知错误:', error);
    throw error;
  }
}

/**
 * 取消点赞
 */
export async function unlikeMessage(messageId: number): Promise<boolean> {
  try {
    const response = await fetch(
      `${getApiUrl()}/elderly/messages/${messageId}/unlike`,
      {
        method: 'POST',
      }
    );

    if (!response.ok) {
      throw new Error(`取消点赞失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('取消点赞错误:', error);
    throw error;
  }
}

/**
 * 推送通知到数字人播报（通过5000端口的透传接口）
 */
export async function playMessageOnAvatar(message: ElderlyMessage): Promise<void> {
  try {
    const text = `来自辅导员${message.sender_name}的通知：${message.content}`;

    // 使用与课表相同的透传接口（5000端口）
    const response = await fetch('http://127.0.0.1:5000/transparent-pass', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user: 'User',
        text: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`推送数字人播报失败: ${response.statusText}`);
    }

    console.log('通知已推送到数字人播报:', text);
  } catch (error) {
    console.error('推送数字人播报错误:', error);
    // 不抛出错误，让流程继续
  }
}
