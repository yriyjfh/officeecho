/**
 * 屏幕端消息推送服务
 * 负责向管理端推送紧急求助、联系辅导员等消息
 */

import { getApiBaseUrl } from '../../config/api';

const getApiUrl = () => getApiBaseUrl();

export interface AlertData {
  family_id: string;
  alert_type: 'urgent_help' | 'contact_family' | 'medication' | 'emotion' | 'inactive' | 'emergency';
  level: 'low' | 'medium' | 'high';
  message: string;
}

/**
 * 推送紧急求助消息到管理端
 */
export async function sendUrgentHelpAlert(familyId: string, elderlyId?: number, elderlyName?: string): Promise<boolean> {
  try {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dateStr = `${now.getMonth() + 1}月${now.getDate()}日`;

    const displayName = elderlyName || '学生';
    const alertData: any = {
      family_id: familyId,
      alert_type: 'urgent_help',
      level: 'high',
      title: '紧急求助',
      message: `${displayName}触发了紧急求助（${dateStr} ${timeStr}）`,
      metadata: JSON.stringify({
        device: '屏幕',
        location: '前台'
      })
    };

    if (elderlyId) {
      alertData.elderly_id = elderlyId;
    }

    const response = await fetch(`${getApiUrl()}/elderly/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(alertData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('发送紧急求助消息失败:', errorData);
      return false;
    }

    const data = await response.json();
    console.log('紧急求助消息发送成功，ID:', data.alert_id);
    return true;
  } catch (error) {
    console.error('发送紧急求助消息错误:', error);
    return false;
  }
}

/**
 * 推送联系辅导员消息到管理端
 */
export async function sendContactFamilyAlert(familyId: string, elderlyId?: number, elderlyName?: string): Promise<boolean> {
  try {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dateStr = `${now.getMonth() + 1}月${now.getDate()}日`;

    const displayName = elderlyName || '学生';
    const alertData: any = {
      family_id: familyId,
      alert_type: 'contact_family',
      level: 'medium',
      message: `${displayName}想要联系您（${dateStr} ${timeStr}）`,
    };

    if (elderlyId) {
      alertData.elderly_id = elderlyId;
    }

    const response = await fetch(`${getApiUrl()}/elderly/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(alertData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('发送联系辅导员消息失败:', errorData);
      return false;
    }

    const data = await response.json();
    console.log('联系辅导员消息发送成功，ID:', data.alert_id);
    return true;
  } catch (error) {
    console.error('发送联系辅导员消息错误:', error);
    return false;
  }
}

/**
 * 推送用药提醒消息到管理端
 */
export async function sendMedicationAlert(
  familyId: string,
  medicationName: string,
  delayMinutes: number,
  elderlyId?: number
): Promise<boolean> {
  try {
    const alertData: any = {
      family_id: familyId,
      alert_type: 'medication',
      level: delayMinutes > 30 ? 'medium' : 'low',
      message: `${medicationName}延迟${delayMinutes}分钟服用`,
    };

    if (elderlyId) {
      alertData.elderly_id = elderlyId;
    }

    const response = await fetch(`${getApiUrl()}/elderly/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(alertData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('发送用药消息失败:', errorData);
      return false;
    }

    const data = await response.json();
    console.log('用药消息发送成功，ID:', data.alert_id);
    return true;
  } catch (error) {
    console.error('发送用药消息错误:', error);
    return false;
  }
}

/**
 * 推送情绪异常消息到管理端
 */
export async function sendEmotionAlert(
  familyId: string,
  emotionDescription: string,
  elderlyId?: number
): Promise<boolean> {
  try {
    const alertData: any = {
      family_id: familyId,
      alert_type: 'emotion',
      level: 'medium',
      message: emotionDescription,
    };

    if (elderlyId) {
      alertData.elderly_id = elderlyId;
    }

    const response = await fetch(`${getApiUrl()}/elderly/alerts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(alertData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('发送情绪消息失败:', errorData);
      return false;
    }

    const data = await response.json();
    console.log('情绪消息发送成功，ID:', data.alert_id);
    return true;
  } catch (error) {
    console.error('发送情绪消息错误:', error);
    return false;
  }
}

/**
 * 获取辅导员的回复消息
 */
export async function getFamilyReplies(elderlyId: number): Promise<any[]> {
  try {
    const response = await fetch(
      `${getApiUrl()}/elderly/alerts/replies?elderly_id=${elderlyId}`
    );

    if (!response.ok) {
      throw new Error(`获取回复失败: ${response.statusText}`);
    }

    const data = await response.json();
    return data.replies || [];
  } catch (error) {
    console.error('获取辅导员回复错误:', error);
    throw error;
  }
}
