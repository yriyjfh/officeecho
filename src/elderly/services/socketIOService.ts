/**
 * Socket.IO service for connecting to backend server (elderly namespace)
 * 通过服务端转发接收 Fay 消息，比直接连接 Fay WebSocket 更可靠
 */

import { io, Socket } from 'socket.io-client';

export interface WebSocketMessage {
  Topic?: string;
  Data: {
    Key: 'text' | 'audio' | 'question' | 'log';
    Value?: string;
    Text?: string;
    IsFirst?: number;
    IsEnd?: number;
  };
  Username?: string;
  robot?: string;
}

export interface SocketIOServiceOptions {
  url: string;  // 服务端地址，如 http://localhost:8000
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export class SocketIOService {
  private socket: Socket | null = null;
  private url: string;
  private onMessageCallback?: (message: WebSocketMessage) => void;
  private onConnectCallback?: () => void;
  private onDisconnectCallback?: () => void;
  private onErrorCallback?: (error: Error) => void;
  private reconnectAttempts = 0;

  constructor(options: SocketIOServiceOptions) {
    this.url = options.url;
    this.onMessageCallback = options.onMessage;
    this.onConnectCallback = options.onConnect;
    this.onDisconnectCallback = options.onDisconnect;
    this.onErrorCallback = options.onError;
  }

  connect(): void {
    if (this.socket?.connected) {
      console.log('[SocketIO] 已连接，跳过');
      return;
    }

    console.log('[SocketIO] 正在连接到', this.url);

    try {
      // 连接到 /elderly namespace
      this.socket = io(this.url + '/elderly', {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        timeout: 20000,
      });

      this.socket.on('connect', () => {
        console.log('[SocketIO] 已连接到服务端, sid:', this.socket?.id);
        this.reconnectAttempts = 0;

        // 发送初始化消息
        this.socket?.emit('init', { Username: 'User', Output: false });

        this.onConnectCallback?.();
      });

      this.socket.on('connected', (data: any) => {
        console.log('[SocketIO] 服务端确认连接:', data);
      });

      this.socket.on('init_ack', (data: any) => {
        console.log('[SocketIO] 初始化确认:', data);
      });

      this.socket.on('fay_message', (data: any) => {
        console.log('='.repeat(60));
        console.log('[SocketIO] 收到 Fay 消息:', data);

        try {
          const message: WebSocketMessage = data;

          if (!message || !message.Data || !message.Data.Key) {
            console.warn('[SocketIO] 消息格式不完整:', message);
            return;
          }

          // 处理文本消息（用于驱动数字人说话）
          if (message.Data.Key === 'text') {
            const text = message.Data.Value || '';
            const isFirst = message.Data.IsFirst === 1;
            const isEnd = message.Data.IsEnd === 1;

            if (text && text.trim()) {
              console.log('[SocketIO] 收到文本消息:', text, { is_start: isFirst, is_end: isEnd });
              this.onMessageCallback?.(message);
            } else {
              console.warn('[SocketIO] 收到空文本消息');
            }
          }
          // audio 消息已在服务端过滤，不再处理（避免与 text 消息重复）
          else if (message.Data.Key === 'audio') {
            // 服务端已经不再转发 audio 消息给屏幕端
            // 如果收到说明是旧版服务端，忽略以避免重复
            console.log('[SocketIO] 忽略 audio 消息（已通过 text 消息处理）');
          }
          // 处理日志消息
          else if (message.Data.Key === 'log') {
            const logText = message.Data.Value || '';
            console.log('[SocketIO] 收到日志消息:', logText);
            this.onMessageCallback?.(message);
          }
          // 处理问题消息
          else if (message.Data.Key === 'question') {
            console.log('[SocketIO] 用户问题:', message.Data.Value);
          } else {
            console.log('[SocketIO] 未知消息类型:', message.Data.Key);
          }
        } catch (error) {
          console.error('[SocketIO] 处理消息出错:', error);
        }
        console.log('='.repeat(60));
      });

      this.socket.on('disconnect', (reason: string) => {
        console.log('[SocketIO] 连接断开, 原因:', reason);
        this.onDisconnectCallback?.();
      });

      this.socket.on('connect_error', (error: Error) => {
        console.error('[SocketIO] 连接错误:', error);
        this.reconnectAttempts++;
        this.onErrorCallback?.(error);
      });

      this.socket.on('error', (error: Error) => {
        console.error('[SocketIO] Socket 错误:', error);
        this.onErrorCallback?.(error);
      });

    } catch (error) {
      console.error('[SocketIO] 创建连接失败:', error);
      this.onErrorCallback?.(error as Error);
    }
  }

  send(data: any): void {
    if (this.socket?.connected) {
      try {
        this.socket.emit('message', data);
      } catch (error) {
        console.error('[SocketIO] 发送消息失败:', error);
      }
    }
  }

  disconnect(): void {
    if (this.socket) {
      console.log('[SocketIO] 断开连接');
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }
}
