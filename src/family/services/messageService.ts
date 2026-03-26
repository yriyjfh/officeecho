/**
 * 管理端通知服务
 * 负责与后端API交互，管理通知的创建、查询和删除
 */

import { getApiBaseUrl } from '../../config/api';

const getApiUrl = () => getApiBaseUrl();

export interface FamilyMessage {
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

export interface CreateMessageData {
  family_id: string;
  content: string;
  sender_name: string;
  sender_relation: string;
  scheduled_time: string;
}

/**
 * 获取家庭所有通知
 */
export async function getFamilyMessages(familyId: string): Promise<FamilyMessage[]> {
  try {
    const response = await fetch(
      `${getApiUrl()}/family/messages?family_id=${familyId}`
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
 * 创建新通知
 */
export async function createMessage(messageData: CreateMessageData): Promise<number> {
  try {
    const response = await fetch(`${getApiUrl()}/family/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messageData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `创建通知失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.message_id;
  } catch (error) {
    console.error('创建通知错误:', error);
    throw error;
  }
}

/**
 * 删除通知
 */
export async function deleteMessage(messageId: number): Promise<boolean> {
  try {
    const response = await fetch(
      `${getApiUrl()}/family/messages/${messageId}`,
      {
        method: 'DELETE',
      }
    );

    if (!response.ok) {
      throw new Error(`删除通知失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('删除通知错误:', error);
    throw error;
  }
}

/**
 * 格式化日期时间为本地格式
 */
export function formatDateTime(dateTimeStr: string): string {
  try {
    const date = new Date(dateTimeStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    if (messageDate.getTime() === today.getTime()) {
      return `今天 ${timeStr}`;
    } else if (messageDate.getTime() === yesterday.getTime()) {
      return `昨天 ${timeStr}`;
    } else {
      return `${date.getMonth() + 1}/${date.getDate()} ${timeStr}`;
    }
  } catch {
    return dateTimeStr;
  }
}

// ==================== 管理端消息/告警 API ====================

export interface FamilyAlert {
  id: number;
  family_id: string;
  elderly_id?: number;
  elderly_name?: string;
  alert_type: 'urgent_help' | 'contact_family' | 'medication' | 'emotion' | 'inactive' | 'emergency';
  level: 'low' | 'medium' | 'high';
  title?: string;
  message: string;
  metadata?: any;
  source: 'elderly' | 'system' | 'family';
  handled: boolean;
  handled_at?: string;
  handled_by?: number;
  handler_name?: string;
  reply_message?: string;
  read: boolean;
  read_at?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAlertData {
  family_id: string;
  alert_type: FamilyAlert['alert_type'];
  level: FamilyAlert['level'];
  message: string;
}

/**
 * 获取家庭所有消息/告警
 */
export async function getFamilyAlerts(
  familyId: string,
  options?: {
    handled?: boolean;
    read?: boolean;
    level?: string;
    alert_type?: string;
    elderly_id?: number;
    limit?: number;
    offset?: number;
  }
): Promise<{ alerts: FamilyAlert[]; total: number }> {
  try {
    const params = new URLSearchParams({ family_id: familyId });

    if (options) {
      if (options.handled !== undefined) params.append('handled', options.handled.toString());
      if (options.read !== undefined) params.append('read', options.read.toString());
      if (options.level) params.append('level', options.level);
      if (options.alert_type) params.append('alert_type', options.alert_type);
      if (options.elderly_id) params.append('elderly_id', options.elderly_id.toString());
      if (options.limit) params.append('limit', options.limit.toString());
      if (options.offset) params.append('offset', options.offset.toString());
    }

    const response = await fetch(
      `${getApiUrl()}/family/alerts?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error(`获取消息失败: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      alerts: data.alerts || [],
      total: data.total || 0
    };
  } catch (error) {
    console.error('获取消息错误:', error);
    throw error;
  }
}

/**
 * 创建新消息/告警（通常由屏幕端触发）
 */
export async function createAlert(alertData: CreateAlertData): Promise<number> {
  try {
    const response = await fetch(`${getApiUrl()}/family/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(alertData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `创建消息失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.alert_id;
  } catch (error) {
    console.error('创建消息错误:', error);
    throw error;
  }
}

/**
 * 标记消息为已读
 */
export async function markAlertAsRead(alertId: number): Promise<boolean> {
  try {
    const response = await fetch(
      `${getApiUrl()}/family/alerts/${alertId}/read`,
      {
        method: 'POST',
      }
    );

    if (!response.ok) {
      throw new Error(`标记已读失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('标记已读错误:', error);
    throw error;
  }
}

/**
 * 标记消息/告警为已处理（带回复）
 */
export async function handleAlert(
  alertId: number,
  handledBy?: number,
  replyMessage?: string
): Promise<boolean> {
  try {
    const body: any = {};
    if (handledBy) body.handled_by = handledBy;
    if (replyMessage) body.reply_message = replyMessage;

    const response = await fetch(
      `${getApiUrl()}/family/alerts/${alertId}/handle`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      throw new Error(`处理消息失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('处理消息错误:', error);
    throw error;
  }
}

/**
 * 回复消息给学生
 */
export async function replyAlert(
  alertId: number,
  replyMessage: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `${getApiUrl()}/family/alerts/${alertId}/reply`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reply_message: replyMessage }),
      }
    );

    if (!response.ok) {
      throw new Error(`回复消息失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('回复消息错误:', error);
    throw error;
  }
}

/**
 * 删除消息/告警
 */
export async function deleteAlert(alertId: number): Promise<boolean> {
  try {
    const response = await fetch(
      `${getApiUrl()}/family/alerts/${alertId}`,
      {
        method: 'DELETE',
      }
    );

    if (!response.ok) {
      throw new Error(`删除消息失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('删除消息错误:', error);
    throw error;
  }
}

/**
 * 获取消息统计
 */
export async function getAlertStats(familyId: string): Promise<{
  today_count: number;
  status_stats: {
    unread: number;
    unhandled: number;
    handled: number;
  };
  level_stats: Record<string, number>;
  type_stats: Record<string, number>;
}> {
  try {
    const response = await fetch(
      `${getApiUrl()}/family/alerts/stats?family_id=${familyId}`
    );

    if (!response.ok) {
      throw new Error(`获取统计失败: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('获取消息统计错误:', error);
    throw error;
  }
}
