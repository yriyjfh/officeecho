/**
 * SSE Toast通知Hook
 * 通过Server-Sent Events接收实时Toast推送
 */

import { useEffect } from 'react';
import { getApiBaseUrl } from '../../config/api';

export interface ToastData {
  id: number;
  type: 'success' | 'info' | 'calling';
  message: string;
  duration: number;
}

interface UseToastSSEOptions {
  familyId: string;
  onToast: (toast: ToastData) => void;
}

export function useToastSSE({ familyId, onToast }: UseToastSSEOptions) {
  useEffect(() => {
    const sseUrl = `${getApiBaseUrl()}/elderly/toast/stream?family_id=${familyId}`;
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connect = () => {
      try {
        console.log('[SSE Toast] 连接中...');
        eventSource = new EventSource(sseUrl);

        eventSource.onopen = () => {
          console.log('[SSE Toast] 连接已建立');
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // 忽略连接确认消息
            if (data.type === 'connected') {
              console.log('[SSE Toast] 连接已确认');
              return;
            }

            // 收到Toast通知
            console.log('[SSE Toast] 收到通知:', data);
            onToast(data as ToastData);
          } catch (err) {
            console.error('[SSE Toast] 解析数据失败:', err);
          }
        };

        eventSource.onerror = (error) => {
          console.error('[SSE Toast] 连接错误:', error);
          eventSource?.close();

          // 5秒后重连
          reconnectTimeout = setTimeout(() => {
            console.log('[SSE Toast] 尝试重新连接...');
            connect();
          }, 5000);
        };
      } catch (error) {
        console.error('[SSE Toast] 连接失败:', error);
      }
    };

    // 建立连接
    connect();

    // 清理
    return () => {
      console.log('[SSE Toast] 清理连接');
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [familyId, onToast]);
}
