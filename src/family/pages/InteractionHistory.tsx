import React, { useState, useEffect, useRef } from 'react';
import { Bot, User, RefreshCw, Send, Sun, Moon, Wifi, WifiOff } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { getApiBaseUrl } from '../../config/api';

/**
 * 聊天记录页面
 * 展示学生与数字人的聊天对话内容
 * 通过 app.py 转发获取 Fay 的聊天记录，支持手机扫码访问
 */

interface ChatMessage {
  username: string;
  is_adopted: number;
  type: 'fay' | 'member';
  way: string;
  content: string;
  createtime: number;
  timetext: string;
}

// Fay WebSocket 消息类型
interface FayWsMessage {
  type?: string;
  text?: string;
  is_first?: number;
  is_end?: number;
  username?: string;
  // 其他可能的字段
  [key: string]: unknown;
}

export const InteractionHistory: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [streamingReply, setStreamingReply] = useState(''); // 流式回复内容
  const [wakeLockActive, setWakeLockActive] = useState(false); // 屏幕常亮状态
  const [wsConnected, setWsConnected] = useState(false); // WebSocket 连接状态
  const [realtimeText, setRealtimeText] = useState(''); // 实时接收的文本
  const username = 'User'; // 实际使用时从用户上下文获取
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const realtimeTextRef = useRef(''); // 用于累积实时文本
  const refreshTimeoutRef = useRef<number | null>(null); // 刷新聊天记录的延迟定时器

  // 滚动到底部
  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  };

  // 请求屏幕常亮
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        setWakeLockActive(true);
        console.log('[WakeLock] 屏幕常亮已启用');

        // 监听释放事件
        wakeLockRef.current.addEventListener('release', () => {
          setWakeLockActive(false);
          console.log('[WakeLock] 屏幕常亮已释放');
        });
      }
    } catch (err) {
      console.error('[WakeLock] 请求失败:', err);
    }
  };

  // 释放屏幕常亮
  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  };

  // 页面可见性变化时重新请求 Wake Lock
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && wakeLockActive && !wakeLockRef.current) {
        // 页面重新可见且之前是常亮状态，重新请求
        await requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // 组件卸载时释放
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
      }
    };
  }, [wakeLockActive]);

  // 连接到 Socket.IO 接收实时消息
  useEffect(() => {
    // 获取 API 基础地址，转换为 Socket.IO 地址
    const apiBase = getApiBaseUrl();
    const socketUrl = apiBase.replace('/api', '') + '/fay'; // 连接到 /fay 命名空间

    console.log('[Socket.IO] 正在连接:', socketUrl);

    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Socket.IO] 已连接');
      setWsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('[Socket.IO] 已断开');
      setWsConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket.IO] 连接错误:', err);
      setWsConnected(false);
    });

    // 监听 Fay 消息
    socket.on('fay_message', (data: FayWsMessage) => {
      console.log('[Socket.IO] 收到 Fay 消息:', data);

      const msgType = data.type;

      // 忽略 log 消息，只处理 text 消息
      // log 消息可能会干扰刷新逻辑
      if (msgType === 'log') {
        console.log('[Socket.IO] 忽略 log 消息:', data.text);
        return;
      }

      // 处理文本消息
      if ((msgType === 'text' || !msgType) && data.text) {
        const isEnd = data.is_end === 1;

        // 收到新消息，取消之前的刷新定时器
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
          refreshTimeoutRef.current = null;
        }

        // Fay 的流式输出每次发送的是完整的累积文本，直接替换显示
        // 不需要在前端再累积，否则会重复
        realtimeTextRef.current = data.text;
        setRealtimeText(data.text);
        setTimeout(scrollToBottom, 50);

        if (isEnd) {
          // 对话结束，设置延迟刷新
          // 使用较长的延迟（1.5秒），因为 Fay 可能会把一个回复分成多段发送
          // 如果在延迟期间收到新消息，定时器会被取消
          refreshTimeoutRef.current = window.setTimeout(() => {
            // 清空实时显示
            setRealtimeText('');
            realtimeTextRef.current = '';
            // 刷新聊天记录
            loadChatHistory();
            refreshTimeoutRef.current = null;
          }, 1500);
        }
      }
    });

    // 监听 Fay WS 状态
    socket.on('fay_ws_status', (data: { connected: boolean }) => {
      console.log('[Socket.IO] Fay WS 状态:', data);
    });

    socketRef.current = socket;

    return () => {
      console.log('[Socket.IO] 断开连接');
      socket.disconnect();
      socketRef.current = null;
      // 清理刷新定时器
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, []);

  // 加载聊天记录
  const loadChatHistory = async () => {
    try {
      setLoading(true);
      setError(null);

      // 通过 app.py 转发获取 Fay 聊天记录
      const response = await fetch(`${getApiBaseUrl()}/fay/chat-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, limit: 100 }),
      });

      if (!response.ok) {
        throw new Error('获取聊天记录失败');
      }

      const data = await response.json();
      // 按时间正序排列，旧的在前面（聊天记录应该从上到下时间递增）
      const sortedMessages = (data.list || []).sort(
        (a: ChatMessage, b: ChatMessage) => a.createtime - b.createtime
      );
      setMessages(sortedMessages);
    } catch (err) {
      console.error('加载聊天记录失败:', err);
      setError('无法连接到数字人服务');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChatHistory();
    // 每30秒刷新一次
    const interval = setInterval(loadChatHistory, 30000);
    return () => clearInterval(interval);
  }, []);

  // 消息加载完成后滚动到底部
  useEffect(() => {
    if (!loading && messages.length > 0) {
      // 使用 setTimeout 确保 DOM 已更新
      setTimeout(scrollToBottom, 100);
    }
  }, [loading, messages]);

  // 过滤掉think和prestart标签内的内容
  const filterSpecialTags = (content: string) => {
    return content
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<prestart>[\s\S]*?<\/prestart>/gi, '')
      .trim();
  };

  // 格式化时间戳（精确到毫秒）
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    // 获取毫秒部分
    const ms = Math.floor((timestamp % 1) * 1000);
    const msStr = ms > 0 ? `.${ms.toString().padStart(3, '0')}` : '';

    const timeStr = date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + msStr;

    if (isToday) {
      return timeStr;
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `昨天 ${timeStr}`;
    }

    return date.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
    }) + ' ' + timeStr;
  };

  // 按日期分组消息
  const groupMessagesByDate = (msgs: ChatMessage[]) => {
    const groups: { [key: string]: ChatMessage[] } = {};

    msgs.forEach(msg => {
      const date = new Date(msg.createtime * 1000);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();

      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday = date.toDateString() === yesterday.toDateString();

      let dateKey: string;
      if (isToday) {
        dateKey = '今天';
      } else if (isYesterday) {
        dateKey = '昨天';
      } else {
        dateKey = date.toLocaleDateString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
        });
      }

      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(msg);
    });

    return groups;
  };

  const groupedMessages = groupMessagesByDate(messages);

  // 发送消息到 Fay（流式接收回复）
  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    try {
      setSending(true);
      setStreamingReply(''); // 清空之前的流式回复
      setInputText(''); // 立即清空输入框

      // 先添加用户消息到列表
      const now = new Date();
      const userMessage: ChatMessage = {
        username: 'User',
        is_adopted: 0,
        type: 'member',
        way: 'web',
        content: text,
        createtime: Date.now() / 1000, // 使用毫秒级精度（秒+小数部分）
        timetext: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      };
      setMessages(prev => [...prev, userMessage]);
      setTimeout(scrollToBottom, 100);

      // 通过 app.py 转发到 Fay 的聊天接口（流式）
      const response = await fetch(`${getApiBaseUrl()}/fay/chat-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'User',
          content: text,
        }),
      });

      if (!response.ok) {
        throw new Error('发送消息失败');
      }

      // 读取流式响应
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullReply = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          // 解析 SSE 格式的数据
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                continue;
              }
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  fullReply += parsed.content;
                  setStreamingReply(fullReply);
                  setTimeout(scrollToBottom, 50);
                }
              } catch {
                // 忽略解析错误
              }
            }
          }
        }
      }

      // 流式结束后，刷新聊天记录获取完整数据
      setTimeout(() => {
        setStreamingReply('');
        loadChatHistory();
      }, 500);

    } catch (err) {
      console.error('发送消息失败:', err);
      setError('发送消息失败，请重试');
    } finally {
      setSending(false);
    }
  };

  // 处理回车发送
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 显示加载状态
  if (loading && messages.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">正在加载聊天记录...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="flex-1 overflow-y-auto px-4 py-4" ref={scrollContainerRef}>
        {/* 顶部标题和按钮 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">聊天记录</h2>
            {/* WebSocket 连接状态 */}
            <span
              className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${
                wsConnected
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-500'
              }`}
              title={wsConnected ? '实时连接已建立' : '实时连接断开'}
            >
              {wsConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
              {wsConnected ? '实时' : '离线'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* 屏幕常亮开关 */}
            {'wakeLock' in navigator && (
              <button
                onClick={wakeLockActive ? releaseWakeLock : requestWakeLock}
                className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  wakeLockActive
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'text-gray-500 hover:bg-gray-100'
                }`}
                title={wakeLockActive ? '关闭常亮' : '保持屏幕常亮'}
              >
                {wakeLockActive ? <Sun size={16} /> : <Moon size={16} />}
                {wakeLockActive ? '常亮' : '常亮'}
              </button>
            )}
            {/* 刷新按钮 */}
            <button
              onClick={loadChatHistory}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              刷新
            </button>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="card p-3 text-center">
            <div className="text-2xl font-bold text-primary-600">{messages.length}</div>
            <div className="text-xs text-gray-600 mt-1">消息总数</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-2xl font-bold text-green-600">
              {messages.filter(m => m.type === 'member').length}
            </div>
            <div className="text-xs text-gray-600 mt-1">学生发言</div>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded-lg">
            <p className="text-sm text-yellow-800">{error}</p>
          </div>
        )}

        {/* 聊天记录列表 */}
        {Object.keys(groupedMessages).length > 0 ? (
          Object.entries(groupedMessages).map(([dateKey, msgs]) => (
            <div key={dateKey} className="mb-6">
              {/* 日期分隔 */}
              <div className="flex items-center justify-center mb-4">
                <span className="px-3 py-1 bg-gray-200 text-gray-600 text-xs rounded-full">
                  {dateKey}
                </span>
              </div>

              {/* 消息列表 - 按时间正序显示（旧消息在上，新消息在下） */}
              <div className="space-y-3">
                {msgs.map((msg, index) => (
                  <div
                    key={`${msg.createtime}-${index}`}
                    className={`flex gap-2 ${
                      msg.type === 'member' ? 'flex-row-reverse' : ''
                    }`}
                  >
                    {/* 头像 */}
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.type === 'fay'
                          ? 'bg-primary-100'
                          : 'bg-green-100'
                      }`}
                    >
                      {msg.type === 'fay' ? (
                        <Bot size={20} className="text-primary-600" />
                      ) : (
                        <User size={20} className="text-green-600" />
                      )}
                    </div>

                    {/* 消息气泡 */}
                    <div
                      className={`flex-1 ${
                        msg.type === 'member' ? 'flex flex-col items-end' : ''
                      }`}
                    >
                      <div
                        className={`inline-block max-w-[80%] rounded-2xl px-4 py-2.5 ${
                          msg.type === 'fay'
                            ? 'bg-white border border-gray-200 shadow-sm'
                            : 'bg-primary-600 text-white shadow-sm'
                        }`}
                      >
                        <p
                          className={`text-sm leading-relaxed ${
                            msg.type === 'fay' ? 'text-gray-800' : 'text-white'
                          }`}
                        >
                          {filterSpecialTags(msg.content)}
                        </p>
                      </div>
                      <div
                        className={`flex items-center gap-1 mt-1 px-2 ${
                          msg.type === 'member' ? 'justify-end' : ''
                        }`}
                      >
                        <span className="text-xs text-gray-400">
                          {formatTime(msg.createtime)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12">
            <Bot size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">暂无聊天记录</p>
          </div>
        )}

        {/* 流式回复显示（发送消息时的回复） */}
        {streamingReply && (
          <div className="flex gap-2 mt-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-primary-100">
              <Bot size={20} className="text-primary-600" />
            </div>
            <div className="flex-1">
              <div className="inline-block max-w-[80%] rounded-2xl px-4 py-2.5 bg-white border border-gray-200 shadow-sm">
                <p className="text-sm leading-relaxed text-gray-800">
                  {filterSpecialTags(streamingReply)}
                  <span className="inline-block w-1.5 h-4 bg-primary-600 ml-0.5 animate-pulse" />
                </p>
              </div>
              <div className="flex items-center gap-1 mt-1 px-2">
                <span className="text-xs text-gray-400">正在回复...</span>
              </div>
            </div>
          </div>
        )}

        {/* 实时消息显示（WebSocket 推送） */}
        {realtimeText && !streamingReply && (
          <div className="flex gap-2 mt-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-primary-100">
              <Bot size={20} className="text-primary-600" />
            </div>
            <div className="flex-1">
              <div className="inline-block max-w-[80%] rounded-2xl px-4 py-2.5 bg-white border border-gray-200 shadow-sm">
                <p className="text-sm leading-relaxed text-gray-800">
                  {filterSpecialTags(realtimeText)}
                  <span className="inline-block w-1.5 h-4 bg-green-500 ml-0.5 animate-pulse" />
                </p>
              </div>
              <div className="flex items-center gap-1 mt-1 px-2">
                <span className="text-xs text-green-500">实时对话中...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部输入框 */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            disabled={sending}
            className="flex-1 px-4 py-2.5 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputText.trim() || sending}
            className="flex items-center justify-center w-10 h-10 bg-primary-600 text-white rounded-full hover:bg-primary-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            <Send size={18} className={sending ? 'animate-pulse' : ''} />
          </button>
        </div>
      </div>
    </div>
  );
};

