import React, { useEffect, useRef, useState } from 'react';
import { loadXmovSDK } from '../utils/sdkLoader';
import { getXmovConfig, isXmovConfigValid } from '../services/xmovConfig';
import { getApiBaseUrl } from '../../config/api';
import { SocketIOService, WebSocketMessage } from '../services/socketIOService';
import type { XmovAvatarSDK } from '../types/xmov';

interface XmovAvatarProps {
  isActive?: boolean;
  onSDKReady?: () => void;
  onSDKError?: (error: any) => void;
  onSpeaking?: (isSpeaking: boolean) => void;
  onSDKStatusChange?: (status: 'loading' | 'ready' | 'error' | 'config-missing') => void;
  onWSStatusChange?: (status: 'disconnected' | 'connecting' | 'connected') => void;
  onLogMessage?: (message: string) => void;
  onIdleStateChange?: (isIdle: boolean) => void; // 空闲状态变化回调
  onTextReceived?: () => void; // 收到text消息时的回调（用于关闭文件播放器）
  onSubtitleChange?: (subtitle: string) => void; // 字幕变化回调
  idleTimeout?: number; // 空闲超时时间（毫秒），默认5分钟
  resetIdleTrigger?: number; // 当此值变化时，重置空闲计时器
  isMediaPlaying?: boolean; // 是否正在播放文件（透明窗口），用于切换SDK离线/在线模式
  isVisible?: boolean; // 组件是否可见
}

/**
 * Xmov 数字人组件
 * 通过服务端 Socket.IO 接收 Fay 消息驱动数字人说话
 */
export const XmovAvatar: React.FC<XmovAvatarProps> = ({
  isActive: _isActive = false,
  onSDKReady,
  onSDKError,
  onSpeaking,
  onSDKStatusChange,
  onWSStatusChange,
  onLogMessage,
  onIdleStateChange,
  onTextReceived,
  onSubtitleChange,
  idleTimeout = 5 * 60 * 1000, // 默认5分钟
  resetIdleTrigger,
  isMediaPlaying = false,
  isVisible = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sdkRef = useRef<XmovAvatarSDK | null>(null);
  const wsServiceRef = useRef<SocketIOService | null>(null);
  const [sdkStatus, setSDKStatus] = useState<'loading' | 'ready' | 'error' | 'config-missing'>('loading');
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const sdkRenderStateRef = useRef<string>('unknown'); // SDK渲染状态
  const sdkInternalStateRef = useRef<string>('unknown'); // SDK内部状态
  const isSDKReadyForSpeakRef = useRef<boolean>(false); // SDK是否准备好接收speak调用
  const isConversationActiveRef = useRef<boolean>(false); // 追踪当前对话是否在进行中
  const hasSpeakStartedRef = useRef<boolean>(false); // 追踪当前对话是否已开始播放（用于处理 think 标签后的第一次播放）
  const isThinkingRef = useRef<boolean>(false); // 追踪是否正在思考中（<think> 和 </think> 之间）
  const conversationTimeoutRef = useRef<number | null>(null); // 对话超时定时器
  const idleTimerRef = useRef<number | null>(null); // 空闲检测定时器
  const thinkingTimeoutRef = useRef<number | null>(null); // 思考超时定时器（3秒无text则播报"请稍等"）
  const hasPlayedPleaseWaitRef = useRef<boolean>(false); // 是否已播报过"请稍等"
  const isIdleRef = useRef<boolean>(false); // 是否处于空闲状态
  const lastTextMessageTimeRef = useRef<number>(Date.now()); // 最后一次收到text消息的时间
  const resetIdleTimerFnRef = useRef<(() => void) | null>(null); // 重置空闲计时器的函数引用
  const healthCheckIntervalRef = useRef<number | null>(null); // SDK健康检查定时器
  const lastHealthCheckTimeRef = useRef<number>(Date.now()); // 上次健康检查时间
  const sdkRecoveryAttemptsRef = useRef<number>(0); // SDK恢复尝试次数
  const lastRecoveryFailTimeRef = useRef<number>(0); // 上次恢复失败时间（用于冷却）
  const reinitSDKFnRef = useRef<(() => Promise<void>) | null>(null); // 重新初始化SDK的函数
  const isReinitializingRef = useRef<boolean>(false); // 是否正在重新初始化
  const isRecoveringRef = useRef<boolean>(false); // 是否正在恢复中（防止重复恢复）
  const pendingRecoveryTimeoutRef = useRef<number | null>(null); // 待执行的恢复定时器
  const checkSDKHealthFnRef = useRef<(() => Promise<void>) | null>(null); // 健康检查函数引用
  const [recoveryStatus, setRecoveryStatus] = useState<'idle' | 'recovering' | 'failed'>('idle'); // 恢复状态（用于UI显示）
  const pendingMessagesRef = useRef<WebSocketMessage[]>([]); // 缓存 SDK 初始化期间收到的消息
  const handleWebSocketMessageFnRef = useRef<((message: WebSocketMessage) => Promise<void>) | null>(null); // WebSocket 消息处理函数引用
  const wasMediaPlayingRef = useRef<boolean>(false); // 上一次的文件播放状态
  const wasVisibleRef = useRef<boolean>(true); // 上一次的可见状态
  const currentSubtitleRef = useRef<string>(''); // 用于累积流式消息的文本

  // 重试机制相关
  const lastSpeakTimeRef = useRef<number>(0); // 上次调用 speak 的时间
  const SPEAK_MIN_INTERVAL = 200; // speak 调用最小间隔（毫秒）

  // 使用 ref 保存最新的回调函数，避免触发 useEffect 重新执行
  const onSDKReadyRef = useRef(onSDKReady);
  const onSDKErrorRef = useRef(onSDKError);
  const onSpeakingRef = useRef(onSpeaking);
  const onSDKStatusChangeRef = useRef(onSDKStatusChange);
  const onWSStatusChangeRef = useRef(onWSStatusChange);
  const onIdleStateChangeRef = useRef(onIdleStateChange);
  const onTextReceivedRef = useRef(onTextReceived);
  const onSubtitleChangeRef = useRef(onSubtitleChange);

  
  useEffect(() => {
    onSDKReadyRef.current = onSDKReady;
    onSDKErrorRef.current = onSDKError;
    onSpeakingRef.current = onSpeaking;
    onSDKStatusChangeRef.current = onSDKStatusChange;
    onWSStatusChangeRef.current = onWSStatusChange;
    onIdleStateChangeRef.current = onIdleStateChange;
    onTextReceivedRef.current = onTextReceived;
    onSubtitleChangeRef.current = onSubtitleChange;
  });
  
  // 当状态变化时通知父组件
  useEffect(() => {
    onSDKStatusChangeRef.current?.(sdkStatus);
  }, [sdkStatus]);

  useEffect(() => {
    onWSStatusChangeRef.current?.(wsStatus);
  }, [wsStatus]);

  // 监听 resetIdleTrigger 变化，重置空闲计时器
  useEffect(() => {
    if (resetIdleTrigger !== undefined && resetIdleTimerFnRef.current) {
      console.log('[xmov] 🔄 外部触发重置空闲计时器');
      resetIdleTimerFnRef.current();
    }
  }, [resetIdleTrigger]);

  // 强制恢复 SDK 到在线待机状态（带重试机制和冷却时间）
  const forceRecoverSDK = async (reason: string): Promise<boolean> => {
    // 如果已经在恢复中，跳过
    if (isRecoveringRef.current) {
      console.log('[xmov] ⏳ SDK 已经在恢复中，跳过重复恢复');
      return false;
    }

    // 如果正在重新初始化，跳过
    if (isReinitializingRef.current) {
      console.log('[xmov] ⏳ SDK 正在重新初始化中，跳过恢复');
      return false;
    }

    isRecoveringRef.current = true;
    setRecoveryStatus('recovering');
    console.log(`[xmov] 🔄 开始恢复 SDK (原因: ${reason})`);

    try {
      // 如果 SDK 实例不存在，尝试重新初始化
      if (!sdkRef.current) {
        console.warn('[xmov] ⚠️ SDK 实例不存在，尝试重新初始化');
        if (reinitSDKFnRef.current) {
          isReinitializingRef.current = true;
          try {
            await reinitSDKFnRef.current();
            isReinitializingRef.current = false;
            isRecoveringRef.current = false;
            setRecoveryStatus('idle');
            return true;
          } catch (e) {
            console.error('[xmov] ❌ 重新初始化失败:', e);
            isReinitializingRef.current = false;
            isRecoveringRef.current = false;
            setRecoveryStatus('failed');
            return false;
          }
        }
        isRecoveringRef.current = false;
        setRecoveryStatus('failed');
        return false;
      }

      // 检查恢复次数，如果失败太多次，直接重新初始化
      if (sdkRecoveryAttemptsRef.current >= 3) {
        console.log('[xmov] ⚠️ 恢复失败次数过多，尝试重新初始化 SDK');
        if (reinitSDKFnRef.current && !isReinitializingRef.current) {
          isReinitializingRef.current = true;
          sdkRecoveryAttemptsRef.current = 0;
          try {
            // 先销毁旧的 SDK
            if (sdkRef.current) {
              try {
                sdkRef.current.destroy();
                console.log('[xmov] ✅ 旧 SDK 已销毁');
              } catch (e) {
                console.warn('[xmov] ⚠️ 销毁旧 SDK 失败:', e);
              }
              sdkRef.current = null;
            }
            await reinitSDKFnRef.current();
            isReinitializingRef.current = false;
            isRecoveringRef.current = false;
            setRecoveryStatus('idle');
            return true;
          } catch (e) {
            console.error('[xmov] ❌ 重新初始化失败:', e);
            isReinitializingRef.current = false;
            isRecoveringRef.current = false;
            setRecoveryStatus('failed');
            return false;
          }
        }
        isRecoveringRef.current = false;
        setRecoveryStatus('failed');
        return false;
      }

      console.log(`[xmov] 🔄 尝试恢复 SDK，第 ${sdkRecoveryAttemptsRef.current + 1} 次尝试`);
      sdkRecoveryAttemptsRef.current++;

      // 步骤0: 恢复 AudioContext（解决浏览器自动播放策略问题）
      try {
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const audioCtx = (window as any).audioContext || new AudioContextClass();
          if (audioCtx.state === 'suspended') {
            console.log('[xmov] 🔊 AudioContext 处于暂停状态，正在恢复...');
            await audioCtx.resume();
            console.log('[xmov] ✅ AudioContext 已恢复:', audioCtx.state);
          }
          (window as any).audioContext = audioCtx;
        }
      } catch (audioError) {
        console.warn('[xmov] ⚠️ AudioContext 恢复失败:', audioError);
      }

      // 检查 SDK 实例是否仍然有效
      if (!sdkRef.current || typeof sdkRef.current.onlineMode !== 'function') {
        console.error('[xmov] ❌ SDK 实例无效或已损坏');
        isRecoveringRef.current = false;
        setRecoveryStatus('failed');
        return false;
      }

      // 步骤1: 切换到在线模式
      sdkRef.current.onlineMode();
      console.log('[xmov] ✅ 步骤1: SDK 已切换到在线模式');

      // 等待状态稳定（增加延迟时间，确保SDK有足够时间切换状态）
      await new Promise(resolve => setTimeout(resolve, 800));

      // 再次检查 SDK 实例
      if (!sdkRef.current) {
        console.error('[xmov] ❌ SDK 实例在等待过程中丢失');
        isRecoveringRef.current = false;
        setRecoveryStatus('failed');
        return false;
      }

      // 步骤2: 切换到待机互动状态
      sdkRef.current.interactiveidle();
      console.log('[xmov] ✅ 步骤2: SDK 已切换到待机互动状态');

      // 等待状态稳定（增加延迟）
      await new Promise(resolve => setTimeout(resolve, 500));

      // 步骤3: 验证恢复是否成功
      const sdk = sdkRef.current as any;
      const currentState = sdk._state || sdk.state || sdkInternalStateRef.current;
      const currentStatus = sdk._status || sdk.status || 'unknown';
      console.log(`[xmov] 🔍 恢复验证: state=${currentState}, status=${currentStatus}`);

      // 检查是否恢复成功
      const isRecovered =
        currentState !== 'offline' &&
        currentState !== 'idle' &&
        currentStatus !== 'offline';

      if (!isRecovered) {
        console.warn('[xmov] ⚠️ SDK 状态验证未通过，再次尝试恢复');
        // 再次尝试
        sdkRef.current.onlineMode();
        await new Promise(resolve => setTimeout(resolve, 500));
        sdkRef.current.interactiveidle();
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // 重置恢复计数
      sdkRecoveryAttemptsRef.current = 0;
      isSDKReadyForSpeakRef.current = true;
      isRecoveringRef.current = false;
      setRecoveryStatus('idle');
      console.log('[xmov] ✅ SDK 恢复成功');
      return true;
    } catch (error) {
      console.error('[xmov] ❌ SDK 恢复失败:', error);
      lastRecoveryFailTimeRef.current = Date.now();

      // 如果尝试次数过多，标记失败
      if (sdkRecoveryAttemptsRef.current >= 3) {
        console.error('[xmov] ❌ SDK 恢复失败次数过多');
        isSDKReadyForSpeakRef.current = false;
        setRecoveryStatus('failed');
      }
      isRecoveringRef.current = false;
      return false;
    }
  };

  // ==================== 消息队列和重试机制 ====================

  // 带重试的 speak 函数
  const speakWithRetry = async (
    text: string,
    isFirst: boolean,
    isEnd: boolean,
    retryCount: number = 0,
    maxRetries: number = 3
  ): Promise<boolean> => {
    const MAX_RETRY_DELAY = 1000; // 最大重试延迟
    const BASE_RETRY_DELAY = 300; // 基础重试延迟

    console.log(`[xmov] 🔊 speakWithRetry: text="${text.substring(0, 30)}...", isFirst=${isFirst}, isEnd=${isEnd}, retry=${retryCount}/${maxRetries}`);

    // 检查 SDK 是否存在
    if (!sdkRef.current) {
      console.error('[xmov] ❌ speakWithRetry: SDK 实例不存在');
      if (retryCount < maxRetries) {
        console.log(`[xmov] 🔄 等待 SDK 初始化后重试 (${retryCount + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, Math.min(BASE_RETRY_DELAY * Math.pow(2, retryCount), MAX_RETRY_DELAY)));
        return speakWithRetry(text, isFirst, isEnd, retryCount + 1, maxRetries);
      }
      return false;
    }

    // 检查 SDK 是否准备好
    if (!isSDKReadyForSpeakRef.current) {
      console.warn('[xmov] ⚠️ speakWithRetry: SDK 尚未准备好');
      try {
        sdkRef.current.onlineMode();
        await new Promise(resolve => setTimeout(resolve, 100));
        sdkRef.current.interactiveidle();
        isSDKReadyForSpeakRef.current = true;
        console.log('[xmov] ✅ SDK 已切换到在线待机状态');
      } catch (e) {
        console.error('[xmov] ❌ 切换 SDK 状态失败:', e);
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.min(BASE_RETRY_DELAY * Math.pow(2, retryCount), MAX_RETRY_DELAY)));
          return speakWithRetry(text, isFirst, isEnd, retryCount + 1, maxRetries);
        }
        return false;
      }
    }

    try {
      // 检查是否需要等待（避免调用过快）
      const now = Date.now();
      const timeSinceLastSpeak = now - lastSpeakTimeRef.current;
      if (timeSinceLastSpeak < SPEAK_MIN_INTERVAL) {
        const waitTime = SPEAK_MIN_INTERVAL - timeSinceLastSpeak;
        console.log(`[xmov] ⏳ 等待 ${waitTime}ms 以满足 speak 调用间隔限制`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      // 调用 speak
      console.log('[xmov] 🔊 执行 speak 调用...');
      sdkRef.current.speak(text, isFirst, isEnd);
      lastSpeakTimeRef.current = Date.now();
      console.log('[xmov] ✅ speak 调用成功');
      return true;
    } catch (error) {
      console.error('[xmov] ❌ speak 调用失败:', error);

      if (retryCount < maxRetries) {
        const delay = Math.min(BASE_RETRY_DELAY * Math.pow(2, retryCount), MAX_RETRY_DELAY);
        console.log(`[xmov] 🔄 ${delay}ms 后重试 speak (${retryCount + 1}/${maxRetries})`);

        // 尝试恢复 SDK 状态
        try {
          await forceRecoverSDK(`speak 失败，第 ${retryCount + 1} 次重试`);
        } catch (e) {
          console.warn('[xmov] ⚠️ 恢复 SDK 失败:', e);
        }

        await new Promise(resolve => setTimeout(resolve, delay));
        return speakWithRetry(text, isFirst, isEnd, retryCount + 1, maxRetries);
      }

      console.error('[xmov] ❌ speak 重试次数已用完，放弃');
      return false;
    }
  };

  // 重新初始化 SDK 的函数（抽取出来复���）
  const reinitializeSDK = async (force: boolean = false) => {
    if (isReinitializingRef.current && !force) {
      console.log('[xmov] ⏳ SDK 正在重新初始化中，跳过');
      return;
    }

    isReinitializingRef.current = true;
    sdkRecoveryAttemptsRef.current = 0;
    setRecoveryStatus('recovering');

    // 重置所有对话相关的状态标志
    isConversationActiveRef.current = false;
    hasSpeakStartedRef.current = false;
    isThinkingRef.current = false; // 重置思考状态
    hasPlayedPleaseWaitRef.current = false;

    // 清除所有定时器
    if (conversationTimeoutRef.current) {
      clearTimeout(conversationTimeoutRef.current);
      conversationTimeoutRef.current = null;
    }
    if (thinkingTimeoutRef.current) {
      clearTimeout(thinkingTimeoutRef.current);
      thinkingTimeoutRef.current = null;
    }

    try {
      // 销毁旧的 SDK
      if (sdkRef.current) {
        console.log('[xmov] 🗑️ 销毁旧 SDK...');
        try {
          sdkRef.current.destroy();
          console.log('[xmov] ✅ 旧 SDK 已销毁');
        } catch (e) {
          console.warn('[xmov] ⚠️ 销毁旧 SDK 失败:', e);
        }
        sdkRef.current = null;
      }

      // 重新初始化
      if (reinitSDKFnRef.current) {
        console.log('[xmov] 🚀 开始重新初始化 SDK...');
        await reinitSDKFnRef.current();
        console.log('[xmov] ✅ SDK 重新初始化完成');

        // 播放缓存的消息（确保 SDK 完全准备好后再播放）
        if (pendingMessagesRef.current.length > 0) {
          console.log(`[xmov] 📨 准备播放缓存的 ${pendingMessagesRef.current.length} 条消息`);

          // 等待 SDK 完全准备好
          let waitAttempts = 0;
          const maxWaitAttempts = 20; // 最多等待 2 秒（20 * 100ms）
          while (!isSDKReadyForSpeakRef.current && waitAttempts < maxWaitAttempts) {
            console.log(`[xmov] ⏳ 等待 SDK 准备好... (${waitAttempts + 1}/${maxWaitAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 100));
            waitAttempts++;
          }

          if (!isSDKReadyForSpeakRef.current) {
            console.warn('[xmov] ⚠️ SDK 未能在规定时间内准备好，尝试强制切换到在线模式');
            // 注意：此时 SDK 应该已经被 reinitSDKFnRef.current() 重新初始化
            // 使用类型断言因为 TypeScript 不知道 reinitSDKFnRef.current() 会修改 sdkRef.current
            const currentSDK = sdkRef.current as XmovAvatarSDK | null;
            if (currentSDK) {
              try {
                currentSDK.onlineMode();
                await new Promise(resolve => setTimeout(resolve, 100));
                currentSDK.interactiveidle();
                isSDKReadyForSpeakRef.current = true;
                console.log('[xmov] ✅ SDK 强制切换到在线待机状态');
              } catch (e) {
                console.error('[xmov] ❌ 强制切换状态失败:', e);
              }
            }
          }

          // 再等待一小段时间确保状态稳定
          await new Promise(resolve => setTimeout(resolve, 200));
          console.log('[xmov] ✅ SDK 已准备好');

          // 重要：先设置标志，确保SDK可以接收消息
          isReinitializingRef.current = false;

          // 确保SDK处于正确状态，强制切换到在线待机模式
          const currentSDK = sdkRef.current as XmovAvatarSDK | null;
          if (currentSDK) {
            try {
              console.log('[xmov] 🔄 确保SDK处于在线待机状态');
              currentSDK.onlineMode();
              await new Promise(resolve => setTimeout(resolve, 300));
              currentSDK.interactiveidle();
              await new Promise(resolve => setTimeout(resolve, 100));
              isSDKReadyForSpeakRef.current = true;
              console.log('[xmov] ✅ SDK已确认处于在线待机状态');
            } catch (e) {
              console.warn('[xmov] ⚠️ 切换SDK状态时出错:', e);
              isSDKReadyForSpeakRef.current = true;
            }

            // 播放缓存的消息
            if (pendingMessagesRef.current.length > 0) {
              console.log(`[xmov] 📨 处理 ${pendingMessagesRef.current.length} 条缓存消息`);
              const messagesToPlay = [...pendingMessagesRef.current];
              pendingMessagesRef.current = []; // 立即清空队列
              
              if (handleWebSocketMessageFnRef.current) {
                // 顺序处理消息
                for (const msg of messagesToPlay) {
                   console.log('[xmov] 📨 正在处理缓存消息:', msg.Data.Key);
                   // 捕获异常，防止一条消息失败阻塞后续
                   try {
                     await handleWebSocketMessageFnRef.current(msg);
                   } catch (err) {
                     console.error('[xmov] ❌ 处理缓存消息失败:', err);
                   }
                   // 消息间短暂延迟
                   await new Promise(r => setTimeout(r, 200));
                }
              }
            }

            // 播放固定欢迎语 - 已移除
            /*
            try {
              console.log('[xmov] 💬 播放欢迎语："主人，你有什么要跟我说吗？"');
              await new Promise(resolve => setTimeout(resolve, 300)); // 再等一下确保状态稳定
              currentSDK.speak('主人，你有什么要跟我说吗？', true, true);
              console.log('[xmov] ✅ 欢迎语已播放');
            } catch (e) {
              console.warn('[xmov] ⚠️ 播放欢迎语失败:', e);
            }
            */
          }
        }

        setRecoveryStatus('idle');
      }
    } catch (e) {
      console.error('[xmov] ❌ 重新初始化失败:', e);
      setRecoveryStatus('failed');
      isReinitializingRef.current = false;
    }

    // 确保标志在函数结束时被重置（兜底逻辑）
    if (isReinitializingRef.current) {
      isReinitializingRef.current = false;
    }
  };

  // 监听 isMediaPlaying 和 isVisible 变化，销毁或重新初始化SDK
  useEffect(() => {
    // 检测是否从文件播放状态退出（在更新ref之前进行判断）
    const wasPlaying = wasMediaPlayingRef.current;
    const wasVisible = wasVisibleRef.current;

    // 判断是否需要重新初始化（从任何文件播放状态退出）
    const exitedFromMediaPlaying = wasPlaying && !isMediaPlaying;
    const exitedFromHidden = !wasVisible && isVisible;
    const needsReinit = (exitedFromMediaPlaying || exitedFromHidden) && isVisible && !isMediaPlaying;

    // 判断是否需要销毁SDK（进入文件播放状态）
    const enteredMediaPlaying = !wasPlaying && isMediaPlaying;

    console.log(`[xmov] 📊 状态变化: isMediaPlaying=${isMediaPlaying}, isVisible=${isVisible}, wasPlaying=${wasPlaying}, wasVisible=${wasVisible}, needsReinit=${needsReinit}, enteredMediaPlaying=${enteredMediaPlaying}`);
    console.log(`[xmov] 📊 详细判断: exitedFromMediaPlaying=${exitedFromMediaPlaying}, exitedFromHidden=${exitedFromHidden}`);
    console.log(`[xmov] 📊 SDK状态: sdkRef.current=${!!sdkRef.current}, isReinitializingRef=${isReinitializingRef.current}`);

    // 更新 ref（在判断逻辑之后更新）
    wasMediaPlayingRef.current = isMediaPlaying;
    wasVisibleRef.current = isVisible;

    if (enteredMediaPlaying || (isMediaPlaying && sdkRef.current)) {
      // 进入文件播放模式，销毁SDK以减少资源消耗
      console.log('[xmov] 🎬 进入文件播放模式，销毁SDK以减少资源消耗');

      // 重置所有对话状态标志
      isConversationActiveRef.current = false;
      hasSpeakStartedRef.current = false;
      isThinkingRef.current = false;
      hasPlayedPleaseWaitRef.current = false;

      // 清除所有定时器
      if (conversationTimeoutRef.current) {
        clearTimeout(conversationTimeoutRef.current);
        conversationTimeoutRef.current = null;
      }
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
        thinkingTimeoutRef.current = null;
      }

      if (sdkRef.current) {
        try {
          // 停止健康检查
          if (healthCheckIntervalRef.current) {
            clearInterval(healthCheckIntervalRef.current);
            healthCheckIntervalRef.current = null;
            console.log('[xmov] 💓 已停止 SDK 健康检查');
          }
          // 销毁SDK
          sdkRef.current.destroy();
          sdkRef.current = null;
          isSDKReadyForSpeakRef.current = false;
          setSDKStatus('loading'); // 标记为loading状态，表示SDK已被销毁
          console.log('[xmov] ✅ SDK已销毁');
        } catch (error) {
          console.warn('[xmov] ⚠️ 销毁SDK失败:', error);
          sdkRef.current = null;
        }
      }
    } else if (!isVisible && !isMediaPlaying) {
      // 组件不可见（全屏文件播放器覆盖），切换到离线模式节省资源
      console.log('[xmov] 🙈 组件隐藏(全屏覆盖)，切换到离线模式');
      if (sdkRef.current) {
        try {
          sdkRef.current.offlineMode();
        } catch (error) {
          console.warn('[xmov] ⚠️ 切换离线模式失败:', error);
        }
      }
    } else if (needsReinit) {
      // 从文件播放退出（透明窗口或全屏），重新初始化 SDK
      console.log('[xmov] 🔄 从文件播放退出，准备重新初始化 SDK');

      // 清除之前待执行的恢复定时器（防抖）
      if (pendingRecoveryTimeoutRef.current) {
        console.log('[xmov] 🧹 清除之前的恢复定时器');
        clearTimeout(pendingRecoveryTimeoutRef.current);
        pendingRecoveryTimeoutRef.current = null;
      }

      // 立即设置标志，确保期间收到的消息会被正确缓存
      isReinitializingRef.current = true;

      // 使用较短延迟确保文件播放完全停止（减少到100ms）
      pendingRecoveryTimeoutRef.current = window.setTimeout(() => {
        reinitializeSDK(true);
      }, 100);
    }

    // 清理函数：无论如何都清理定时器
    return () => {
      if (pendingRecoveryTimeoutRef.current) {
        clearTimeout(pendingRecoveryTimeoutRef.current);
        pendingRecoveryTimeoutRef.current = null;
        // 如果取消了重置操作，需要重置标志
        if (needsReinit) {
          console.log('[xmov] 🧹 取消重新初始化，重置标志');
          isReinitializingRef.current = false;
        }
      }
    };
  }, [isMediaPlaying, isVisible]);

  useEffect(() => {
    let mounted = true;
    let initTimeout: number | null = null;

    const initializeSDK = async () => {
      try {
        // 检查配置
        const config = getXmovConfig();
        if (!isXmovConfigValid(config)) {
          console.error('[xmov] 配置无效');
          setSDKStatus('config-missing');
          setErrorMessage('请配置 XMOV_APP_ID 和 XMOV_APP_SECRET');
          return;
        }

        // 加载 SDK
        console.log('[xmov] 正在加载SDK...');
        await loadXmovSDK();

        if (!mounted) return;

        // 创建 SDK 实例
        console.log('[xmov] 正在创建SDK实例...');
        const containerId = `xmov-container-${Date.now()}`;
        if (containerRef.current) {
          containerRef.current.id = containerId;
        }

        initTimeout = window.setTimeout(() => {
          console.error('[xmov] SDK初始化超时');
          setSDKStatus('error');
          setErrorMessage('SDK初始化超时');
          onSDKErrorRef.current?.(new Error('SDK initialization timeout'));
        }, 30000);

        const sdk = new window.XmovAvatar({
          containerId: `#${containerId}`,
          appId: config.appId,
          appSecret: config.appSecret,
          gatewayServer: config.gatewayServer || 'https://nebula-agent.xingyun3d.com/user/v1/ttsa/session',

          onWidgetEvent(data: any) {
            console.log('[xmov] Widget事件:', data);
          },

          onNetworkInfo(networkInfo: any) {
            console.log('[xmov] 网络信息:', networkInfo);
          },

          onMessage(message: any) {
            console.log('[xmov] 📩 SDK消息:', message);
            // 检查是否有音频相关的消息
            if (message && typeof message === 'object') {
              if (message.type === 'audio' || message.audio) {
                console.log('[xmov] 🔊 收到音频消息:', message);
              }
              // 检查是否有错误消息
              if (message.type === 'error' || message.error || message.code) {
                console.error('[xmov] ❌ SDK错误消息:', message);
              }
              // 检查渲染相关消息
              if (message.type === 'render' || message.frame || message.bodyFrame !== undefined) {
                console.log('[xmov] 🎨 SDK渲染消息:', message);
              }
            }
          },

          onStateChange(state: string) {
            console.log('[xmov] 🔄 状态变化:', state);
            sdkInternalStateRef.current = state;
            // 检查SDK是否准备好
            // 常见状态: 'init', 'loading', 'ready', 'speaking', 'idle' 等
            if (state === 'ready' || state === 'idle' || state === 'interactiveidle') {
              isSDKReadyForSpeakRef.current = true;
              console.log('[xmov] ✅ SDK 已准备好接收speak调用');
            }
          },

          onStatusChange(status: string) {
            console.log('[xmov] 📊 SDK状态:', status);
            // status 可能是 'online', 'offline', 'connecting' 等
            if (status === 'online' || status === 'ready') {
              isSDKReadyForSpeakRef.current = true;
              console.log('[xmov] ✅ SDK 在线状态，可以接收speak调用');
            }
          },

          onStateRenderChange(state: string, duration: number) {
            console.log('[xmov] 🎨 渲染状态:', state, 'duration:', duration);
            sdkRenderStateRef.current = state;
            // 渲染状态用于判断SDK是否正在正常渲染
          },

          onVoiceStateChange(status: 'start' | 'end') {
            console.log('[xmov] 🎵 音频状态变化:', status);
            if (status === 'start') {
              console.log('[xmov] 🎵 数字人开始说话');
              onSpeakingRef.current?.(true);
            } else if (status === 'end') {
              console.log('[xmov] 🎵 数字人结束说话');
              onSpeakingRef.current?.(false);
            }
          },

          enableLogger: true,
        });

        sdkRef.current = sdk;

        // 初始化 SDK
        let resourcesFullyLoaded = false;
        await sdk.init({
          onDownloadProgress: (progress: number) => {
            console.log('[xmov] 加载资源:', progress + '%');
            setLoadingProgress(progress);
            if (progress >= 100) {
              resourcesFullyLoaded = true;
              console.log('[xmov] ✅ 资源加载完成 100%');
            }
          },
          onError: (error: any) => {
            console.error('[xmov] SDK错误:', error);
            if (initTimeout) clearTimeout(initTimeout);
            setSDKStatus('error');
            setErrorMessage('SDK初始化失败');
            onSDKErrorRef.current?.(error);
          },
          onClose: () => {
            console.log('[xmov] SDK连接关闭');
          },
        });

        // 等待资源完全加载
        if (!resourcesFullyLoaded) {
          console.log('[xmov] ⏳ 等待资源加载完成...');
          await new Promise<void>((resolve) => {
            const checkInterval = setInterval(() => {
              if (resourcesFullyLoaded) {
                clearInterval(checkInterval);
                resolve();
              }
            }, 100);
            // 最多等待10秒
            setTimeout(() => {
              clearInterval(checkInterval);
              resolve();
            }, 10000);
          });
        }

        if (!mounted) return;

        if (initTimeout) clearTimeout(initTimeout);
        console.log('[xmov] SDK初始化成功');

        // SDK初始化完成后，等待一小段时间让内部状态稳定
        console.log('[xmov] 🚀 SDK初始化完成，等待状态稳定...');
        await new Promise(resolve => setTimeout(resolve, 500));

        // 进入待机互动状态
        console.log('[xmov] 🚀 切换到待机互动状态...');
        try {
          sdk.onlineMode();
          console.log('[xmov] ✅ SDK 已切换到在线模式');
          await new Promise(resolve => setTimeout(resolve, 100));
          sdk.interactiveidle();
          console.log('[xmov] ✅ SDK 已切换到待机互动状态');
          isSDKReadyForSpeakRef.current = true;
        } catch (error) {
          console.warn('[xmov] ⚠️ 切换初始状态失败:', error);
        }

        // 检查音频上下文状态
        console.log('[xmov] 🔊 检查浏览器音频支持...');
        if (typeof AudioContext !== 'undefined' || typeof (window as any).webkitAudioContext !== 'undefined') {
          console.log('[xmov] ✅ 浏览器支持 Web Audio API');

          // 检查自动播放策略
          const checkAutoplay = async () => {
            try {
              const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
              const audioCtx = new AudioContextClass();
              console.log('[xmov] 🔊 AudioContext 状态:', audioCtx.state);

              if (audioCtx.state === 'suspended') {
                console.warn('[xmov] ⚠️ AudioContext 被暂停，尝试恢复...');
                await audioCtx.resume();
                console.log('[xmov] ✅ AudioContext 已恢复');
              }
              audioCtx.close();
            } catch (error) {
              console.error('[xmov] ❌ AudioContext 检查失败:', error);
            }
          };
          checkAutoplay();
        } else {
          console.error('[xmov] ❌ 浏览器不支持 Web Audio API');
        }

        setSDKStatus('ready');
        onSDKReadyRef.current?.();

        // 检查SDK实例的所有方法和属性
        console.log('[xmov] 🔍 SDK实例方法:', Object.getOwnPropertyNames(Object.getPrototypeOf(sdk)));
        console.log('[xmov] 🔍 SDK实例属性:', Object.keys(sdk));

        // 暴露SDK实例到全局，方便在控制台调试
        (window as any).xmovSDK = sdk;
        console.log('[xmov] 💡 SDK实例已暴露到 window.xmovSDK，可在控制台检查');

        // 暴露测试函数到全局，方便调试
        (window as any).testXmovSpeak = async (text: string = '你好，这是测试') => {
          console.log('[xmov] 🧪 测试speak功能:', text);
          console.log('[xmov] 🧪 当前状态:', {
            sdkExists: !!sdkRef.current,
            isSDKReadyForSpeak: isSDKReadyForSpeakRef.current,
            sdkRenderState: sdkRenderStateRef.current,
            sdkInternalState: sdkInternalStateRef.current,
          });
          if (sdkRef.current) {
            console.log('[xmov] 🧪 SDK实例存在');
            try {
              // 先切换到在线模式和待机互动状态
              console.log('[xmov] 🧪 步骤1: 切换到在线模式');
              sdkRef.current.onlineMode();
              console.log('[xmov] 🧪 步骤2: 切换到待机互动状态');
              sdkRef.current.interactiveidle();
              // 等待一小段时间让状态切换生效
              await new Promise(resolve => setTimeout(resolve, 100));
              console.log('[xmov] 🧪 步骤3: 调用speak...');
              sdkRef.current.speak(text, true, true);
              console.log('[xmov] 🧪 speak调用完成');
            } catch (error) {
              console.error('[xmov] 🧪 speak调用失败:', error);
            }
          } else {
            console.error('[xmov] 🧪 SDK实例不存在');
          }
        };
        console.log('[xmov] 💡 提示：在控制台输入 testXmovSpeak("测试文字") 来测试音频播放');

        // 暴露SDK状态检查函数
        (window as any).checkXmovStatus = () => {
          console.log('[xmov] 📊 SDK状态检查:', {
            sdkExists: !!sdkRef.current,
            isSDKReadyForSpeak: isSDKReadyForSpeakRef.current,
            sdkRenderState: sdkRenderStateRef.current,
            sdkInternalState: sdkInternalStateRef.current,
            hasSpeakStarted: hasSpeakStartedRef.current,
            isConversationActive: isConversationActiveRef.current,
            isThinking: isThinkingRef.current,
          });
          // 检查SDK内部属性
          if (sdkRef.current) {
            const sdk = sdkRef.current as any;
            console.log('[xmov] 📊 SDK内部属性:', {
              _state: sdk._state,
              _status: sdk._status,
              _renderState: sdk._renderState,
              state: sdk.state,
              status: sdk.status,
            });
          }
        };
        console.log('[xmov] 💡 提示：在控制台输入 checkXmovStatus() 来检查SDK状态');

        // SDK 就绪后，连接 WebSocket
        connectWebSocket();

        // 启动 SDK 健康检查（每30秒检查一次）
        startHealthCheck();
      } catch (error) {
        console.error('[xmov] 初始化错误:', error);
        if (initTimeout) clearTimeout(initTimeout);
        if (mounted) {
          setSDKStatus('error');
          setErrorMessage(error instanceof Error ? error.message : '未知错误');
          onSDKErrorRef.current?.(error);
        }
      }
    };

    const connectWebSocket = () => {
      if (wsServiceRef.current) {
        wsServiceRef.current.disconnect();
      }

      // 使用服务端 Socket.IO 地址（通过服务端转发 Fay 消息）
      const apiUrl = getApiBaseUrl();
      const serverUrl = apiUrl.replace('/api', ''); // http://host:8000
      console.log('[xmov] 🔌 Socket.IO 连接地址:', serverUrl);

      wsServiceRef.current = new SocketIOService({
        url: serverUrl,
        onConnect: () => {
          setWsStatus('connected');
          // 连接成功时，如果不在空闲状态才重置计时器
          if (!isIdleRef.current) {
            resetIdleTimer();
          }
        },
        onDisconnect: () => {
          setWsStatus('disconnected');
        },
        onError: () => {
          setWsStatus('disconnected');
        },
        onMessage: (message: WebSocketMessage) => {
          handleWebSocketMessage(message);
        },
      });

      setWsStatus('connecting');
      wsServiceRef.current.connect();
    };

    // SDK 健康检查函数
    const checkSDKHealth = async () => {
      if (!sdkRef.current) {
        console.warn('[xmov] ⚠️ 健康检查: SDK 实例不存在');
        // 如果 SDK 实例不存在但应该可见，尝试重新初始化
        if (isVisible && !isMediaPlaying && reinitSDKFnRef.current && !isReinitializingRef.current) {
          console.log('[xmov] 💓 健康检查: SDK 实例丢失，尝试重新初始化');
          isReinitializingRef.current = true;
          try {
            await reinitSDKFnRef.current();
          } catch (e) {
            console.error('[xmov] ❌ 重新初始化失败:', e);
          }
          isReinitializingRef.current = false;
        }
        return;
      }

      const now = Date.now();
      lastHealthCheckTimeRef.current = now;

      try {
        // 检查 SDK 内部状态
        const sdk = sdkRef.current as any;
        const currentState = sdk._state || sdk.state || sdkInternalStateRef.current;
        const currentStatus = sdk._status || sdk.status || 'unknown';

        console.log(`[xmov] 💓 健康检查: state=${currentState}, status=${currentStatus}, isReady=${isSDKReadyForSpeakRef.current}, recovering=${isRecoveringRef.current}`);

        // 如果组件可见且不在文件播放中，但 SDK 状态异常，尝试恢复
        if (isVisible && !isMediaPlaying && !isRecoveringRef.current) {
          // 检查是否需要恢复
          const needsRecovery =
            currentState === 'offline' ||
            currentState === 'idle' ||
            currentStatus === 'offline' ||
            !isSDKReadyForSpeakRef.current;

          if (needsRecovery) {
            console.log('[xmov] 💓 健康检查: 检测到 SDK 状态异常，尝试恢复');
            await forceRecoverSDK('健康检查发现异常状态');
          } else {
            // SDK 状态正常，重置恢复计数器和状态
            if (sdkRecoveryAttemptsRef.current > 0) {
              console.log('[xmov] 💓 健康检查: SDK 状态正常，重置恢复计数器');
              sdkRecoveryAttemptsRef.current = 0;
            }
            if (recoveryStatus !== 'idle') {
              setRecoveryStatus('idle');
            }
          }
        }

        // 检查 WebSocket 连接
        if (wsServiceRef.current && !wsServiceRef.current.isConnected()) {
          console.log('[xmov] 💓 健康检查: WebSocket 断开，尝试重连');
          wsServiceRef.current.connect();
        }
      } catch (error) {
        console.error('[xmov] ❌ 健康检查异常:', error);
      }
    };

    // 保存健康检查函数到 ref，供外部调用
    checkSDKHealthFnRef.current = checkSDKHealth;

    // 启动健康检查定时器
    const startHealthCheck = () => {
      // 清除旧的定时器
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
      }

      console.log('[xmov] 💓 启动 SDK 健康检查（每15秒）');
      healthCheckIntervalRef.current = window.setInterval(() => {
        checkSDKHealth();
      }, 15000); // 每15秒检查一次（更频繁以快速检测问题）
    };

    // 停止健康检查
    const stopHealthCheck = () => {
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
        healthCheckIntervalRef.current = null;
        console.log('[xmov] 💓 已停止 SDK 健康检查');
      }
    };

    // 清除空闲检测定时器
    const clearIdleTimer = () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };

    // 重置空闲检测定时器（收到text消息时调用）
    const resetIdleTimer = () => {
      clearIdleTimer();
      lastTextMessageTimeRef.current = Date.now();

      console.log('[xmov] 🔍 resetIdleTimer 被调用，当前 isIdleRef.current =', isIdleRef.current);

      // 如果之前处于空闲状态，通知退出空闲
      if (isIdleRef.current) {
        isIdleRef.current = false;
        console.log('[xmov] 🔔 退出空闲状态，收到新的互动，调用 onIdleStateChange(false)');
        onIdleStateChangeRef.current?.(false);
      } else {
        console.log('[xmov] ℹ️ 当前不在空闲状态，仅重置计时器');
      }

      // 设置新的空闲检测定时器
      idleTimerRef.current = window.setTimeout(() => {
        console.log(`[xmov] ⏰ 空闲超时：${idleTimeout / 1000 / 60} 分钟无互动，进入空闲状态`);
        isIdleRef.current = true;
        onIdleStateChangeRef.current?.(true);
      }, idleTimeout);
    };

    // 启动空闲检测
    const startIdleDetection = () => {
      console.log(`[xmov] 🕐 启动空闲检测，超时时间：${idleTimeout / 1000 / 60} 分钟`);
      resetIdleTimer();
    };

    // 保存重置函数到ref，供外部调用
    resetIdleTimerFnRef.current = resetIdleTimer;

    // 组件初始化时立即启动空闲检测（不依赖WebSocket连接）
    console.log('[xmov] 🚀 组件初始化，启动空闲检测');
    startIdleDetection();

    // 清除对话超��定时器
    const clearConversationTimeout = () => {
      if (conversationTimeoutRef.current) {
        clearTimeout(conversationTimeoutRef.current);
        conversationTimeoutRef.current = null;
        console.log('[xmov] ⏱️ 清除对话超时定时器');
      }
    };

    // 设置对话超时定时器（30秒无消息自动结束）
    const resetConversationTimeout = () => {
      clearConversationTimeout();

      if (isConversationActiveRef.current && hasSpeakStartedRef.current) {
        conversationTimeoutRef.current = window.setTimeout(() => {
          console.warn('[xmov] ⏰ 对话超时，30秒未收到结束信号，强制结束对话');
          if (sdkRef.current && hasSpeakStartedRef.current) {
            try {
              sdkRef.current.speak(' ', false, true);
              console.log('[xmov] ✅ 已发送超时结束信号');
            } catch (error) {
              console.error('[xmov] ❌ 发送超时结束信号失败:', error);
            }
          }
          isConversationActiveRef.current = false;
          hasSpeakStartedRef.current = false;
          isThinkingRef.current = false;
        }, 30000); // 30秒超时
        console.log('[xmov] ⏱️ 设置对话超时定时器（30秒）');
      }
    };

    // 确保 AudioContext 处于运行状态（修���iOS和浏览器自动播放策略问题）
    const ensureAudioContextRunning = async () => {
      try {
        if (typeof AudioContext === 'undefined' && typeof (window as any).webkitAudioContext === 'undefined') {
          console.warn('[xmov] ⚠️ 浏览器不支持 AudioContext');
          return;
        }

        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
        // 尝试获取全局的 audioContext（如果SDK暴露了的话）
        const audioCtx = (window as any).audioContext || new AudioContextClass();

        if (audioCtx.state === 'suspended') {
          console.warn('[xmov] ⚠️ AudioContext 处于暂停状态，尝试恢复...');
          await audioCtx.resume();
          console.log('[xmov] ✅ AudioContext 已恢复到运行状态:', audioCtx.state);
        } else {
          console.log('[xmov] ✅ AudioContext 状态正常:', audioCtx.state);
        }

        // 保存到全局以便后续检查
        (window as any).audioContext = audioCtx;
      } catch (error) {
        console.error('[xmov] ❌ AudioContext 检查/恢复失败:', error);
      }
    };

    const handleWebSocketMessage = async (message: WebSocketMessage) => {
      console.log('[xmov] 📨 handleWebSocketMessage 被调用');
      console.log('[xmov] 📨 消息内容:', JSON.stringify(message, null, 2));

      // 如果 SDK 正在重新初始化，或者不可见，或者正在播放文件，缓存 text/audio 消息
      // 注意：使用 wasVisibleRef 和 wasMediaPlayingRef 获取最新的 props 状态
      if (isReinitializingRef.current || !wasVisibleRef.current || wasMediaPlayingRef.current) {
        const { Data } = message;
        if (Data.Key === 'text' || Data.Key === 'audio') {
          console.log(`[xmov] 📦 SDK 状态不就绪（重初始化=${isReinitializingRef.current}/隐藏=${!wasVisibleRef.current}/文件播放=${wasMediaPlayingRef.current}），缓存消息: ${Data.Key}`);
          pendingMessagesRef.current.push(message);
          // 通知父组件收到消息（用于关闭文件播放器）
          onTextReceivedRef.current?.();
        }
        return;
      }

      if (!sdkRef.current) {
        console.error('[xmov] ❌ SDK未就绪或speak方法不可用');
        // 缓存消息以便稍后处理
        const { Data } = message;
        if (Data.Key === 'text') {
          console.log('[xmov] 📦 SDK 实例不存在，缓存消息');
          pendingMessagesRef.current.push(message);
          onTextReceivedRef.current?.();
        }
        return;
      }

      // 检查SDK是否真正准备好
      if (!isSDKReadyForSpeakRef.current) {
        console.warn('[xmov] ⚠️ SDK尚未完全准备好，尝试等待...');
        // 尝试切换到在线模式
        try {
          sdkRef.current.onlineMode();
          sdkRef.current.interactiveidle();
          isSDKReadyForSpeakRef.current = true;
          console.log('[xmov] ✅ SDK已切换到在线待机状态');
        } catch (error) {
          console.error('[xmov] ❌ 切换SDK状态失败:', error);
        }
      }

      const { Data } = message;
      let text = '';
      const isFirst = Data.IsFirst === 1;
      const isEnd = Data.IsEnd === 1;

      // 处理 log 消息（仅用于显示，不切换SDK状态）
      if (Data.Key === 'log') {
        const logText = Data.Value || '';
        console.log('[xmov] 📝 收到日志消息:', logText);

        // 传递log消息给父组件显示
        if (onLogMessage) {
          onLogMessage(logText);
        }

        // 检测"思考中..."消息，启动3秒超时计时器
        if (logText.includes('思考中')) {
          console.log('[xmov] 🧠 检测到思考��，启动3秒超时计时器');
          // 清除之前的计时器
          if (thinkingTimeoutRef.current) {
            clearTimeout(thinkingTimeoutRef.current);
          }
          // 重置"请稍等"播报标记
          hasPlayedPleaseWaitRef.current = false;

          // 3秒后如果没有收到text消息，播报"请稍等"
          thinkingTimeoutRef.current = window.setTimeout(() => {
            // 检查是否仍在思考中且没有收到text消息
            if (!hasPlayedPleaseWaitRef.current && sdkRef.current) {
              console.log('[xmov] ⏰ 思考超过3秒，播报"请稍等"');
              hasPlayedPleaseWaitRef.current = true;
              // 使用与正常输出一致的节流/重试路径，避免速率限制导致后续输出丢失
              (async () => {
                try {
                  await ensureAudioContextRunning();
                  const success = await speakWithRetry('请稍等', true, true);
                  if (success) {
                    console.log('[xmov] ✅ 已播报"请稍等"');
                  } else {
                    console.warn('[xmov] ⚠️ 播报"请稍等"失败：speakWithRetry 返回 false');
                  }
                } catch (error) {
                  console.error('[xmov] ❌ 播报"请稍等"失败:', error);
                }
              })();
            }
          }, 3000);
        }

        // 不再切换任何SDK状态（listen/think/interactiveidle），避免打断数字人说话
        return; // log 消息不需要播放
      }

      if (Data.Key === 'text') {
        text = Data.Value || '';
        console.log('[xmov] 📨 收到text消息，isFirst=', isFirst, 'isEnd=', isEnd, 'text长度=', text.length);
        console.log('[xmov] 📨 text内容:', text.substring(0, 100), text.length > 100 ? '...' : '');

        // 通知父组件收到text消息（用于关闭文件播放器，切换回数字人界面）
        console.log('[xmov] 📨 通知父组件关闭文件播放器');
        onTextReceivedRef.current?.();

        // 收到text消息，清除思考超时计时器（不需要播报"请稍等"了）
        if (thinkingTimeoutRef.current) {
          console.log('[xmov] ⏰ 收到text消息，清除思考超时计时器');
          clearTimeout(thinkingTimeoutRef.current);
          thinkingTimeoutRef.current = null;
        }

        console.log('[xmov] 📨 确保SDK在线模式');
        try {
          sdkRef.current.onlineMode();
          console.log('[xmov] ✅ SDK 已确认在线模式');
        } catch (error) {
          console.warn('[xmov] ⚠️ 切换在线模式失败:', error);
        }
        // 收到text消息，重置空闲定时器
        resetIdleTimer();
        
        // 处理流式消息
        if (isFirst) {
          // 新消息开始，重置字幕
          currentSubtitleRef.current = text;
          // 新消息开始时也发送字幕更新
          if (text && text.trim()) {
            console.log('[xmov] 📢 发送字幕更新（新消息开始）:', text);
            onSubtitleChangeRef.current?.(text);
          }
        } else {
          // 消息继续，累积文本
          currentSubtitleRef.current += text;
          // 消息继续时也发送字幕更新
          if (text && text.trim()) {
            console.log('[xmov] 📢 发送字幕更新（消息继续）:', currentSubtitleRef.current);
            onSubtitleChangeRef.current?.(currentSubtitleRef.current);
          }
        }
        
        // 当消息结束时发送最终字幕更新
        if (isEnd && text && text.trim()) {
          const fullSubtitle = currentSubtitleRef.current;
          console.log('[xmov] 📢 发送完整字幕更新（消息结束）:', fullSubtitle);
          onSubtitleChangeRef.current?.(fullSubtitle);
          // 重置字幕缓存
          currentSubtitleRef.current = '';
        }
      } else if (Data.Key === 'audio') {
        text = Data.Text || '';
        console.log('[xmov] 📨 收到audio消息，确保SDK在线模式');
        try {
          sdkRef.current.onlineMode();
          console.log('[xmov] ✅ SDK 已确认在线模式');
        } catch (error) {
          console.warn('[xmov] ⚠️ 切换在线模式失败:', error);
        }
        // 收到audio消息，也重置空闲定时器
        resetIdleTimer();
        
        // audio消息通常是完整的，直接发送字幕更新
        if (text && text.trim()) {
          console.log('[xmov] 📢 发送字幕更新:', text);
          onSubtitleChangeRef.current?.(text);
        }
      }

      console.log('[xmov] 📋 提���的文本:', text);
      console.log('[xmov] 📋 isFirst:', isFirst, 'isEnd:', isEnd);

      // 检测到新对话开始（isFirst=1）
      if (isFirst) {
        // 清除旧的超时定时器
        clearConversationTimeout();

        // 🔧 根据SDK文档：speak不允许连续调用
        // 无论本地状态如何，只要是新对话开始，都先发送结束信号确保SDK状态正确
        // 这样可以解决上轮流式输出未完整时推送新消息的问题
        console.log('[xmov] 🔄 新对话开始，先确保上一轮已结束');
        try {
          // 发送空内容的结束信号，确保上一轮讲话结束
          sdkRef.current.speak('', false, true);
          console.log('[xmov] ✅ 已发送结束信号 (is_end=true)');
          // 等待SDK处理结束信号，避免新对话被丢弃
          await new Promise(resolve => setTimeout(resolve, 100));
          console.log('[xmov] ✅ 等待100ms完成');
        } catch (error) {
          console.error('[xmov] ❌ 结束上轮对话失败:', error);
        }
        // 重置状态，开始新对话
        isConversationActiveRef.current = true;
        hasSpeakStartedRef.current = false;
        isThinkingRef.current = false; // 新对话开始，重置思考状态
        console.log('[xmov] 🆕 新对话开始');
      }

      if (text && text.trim()) {
        const thinkStartIndex = text.indexOf('<think>');
        const thinkEndIndex = text.indexOf('</think>');

        // 检测思考结束标签（<think> 通过 log 消息处理）
        if (thinkStartIndex !== -1 && !isThinkingRef.current) {
          // 如果在 text 消息中检测到 <think>，也切换状态（兼容处理）
          isThinkingRef.current = true;
          console.log('[xmov] 🧠 在 text 消息中检测到 <think>，调用 SDK think()');
          try {
            sdkRef.current.think();
            console.log('[xmov] ✅ SDK 已切换到思考状态');
          } catch (error) {
            console.error('[xmov] ❌ 切换到思考状态失败:', error);
          }
        }
        if (thinkEndIndex !== -1 && isThinkingRef.current) {
          isThinkingRef.current = false;
          console.log('[xmov] 🧠 检测到 </think>，退出思考模式');
          // 注意：不需要调用 interactiveIdle，因为接下来会调用 speak
        }

        let contentToSpeak = '';

        // 情况1: 当前正在思考中，且消息中没有 </think>
        if (isThinkingRef.current && thinkEndIndex === -1) {
          console.log('[xmov] 🧠 正在思考中，跳过内容播放');
          console.log('[xmov] 原始文本:', text);
          // 如果是 isEnd，必须发送结束信号给 SDK
          if (isEnd && hasSpeakStartedRef.current) {
            console.log('[xmov] 📢 虽然在思考中，但必须发送 is_end=true 结束对话');
            // 使用带重试的函数发送结束信号
            await speakWithRetry(' ', false, true);
            isConversationActiveRef.current = false;
            hasSpeakStartedRef.current = false;
          }
          return; // 不播放思考内容
        }
        // 情况2: 同时包含 <think> 和 </think>（在同一条消息中完成思考）
        else if (thinkStartIndex !== -1 && thinkEndIndex !== -1 && thinkStartIndex < thinkEndIndex) {
          const beforeThink = text.substring(0, thinkStartIndex);
          const afterThink = text.substring(thinkEndIndex + 8); // 8 是 '</think>' 的长度
          contentToSpeak = (beforeThink + afterThink).trim();
          console.log('[xmov] 🧠 检测到完整的 <think> 标签，移除思考内容');
          console.log('[xmov] 原始文本:', text);
          console.log('[xmov] 移除思考后:', contentToSpeak);
        }
        // 情况3: 只有 </think>（跨消息思考结束）
        else if (thinkStartIndex === -1 && thinkEndIndex !== -1) {
          contentToSpeak = text.substring(thinkEndIndex + 8).trim();
          console.log('[xmov] 🧠 检测到 </think> 标签（跨消息思考结束），提取后续内容:', contentToSpeak);
        }
        // 情况4: 没有思考标签，正常内容
        else {
          contentToSpeak = text;
        }

        // 如果有内容要播放
        if (contentToSpeak && contentToSpeak.trim()) {
          const shouldBeStart = !hasSpeakStartedRef.current;
          console.log('[xmov] 🔊 准备调用speak（使用重试机制）');
          console.log('[xmov] 🔊 参数: contentToSpeak=', contentToSpeak);
          console.log('[xmov] 🔊 参数: shouldBeStart=', shouldBeStart);
          console.log('[xmov] 🔊 参数: isEnd=', isEnd);
          console.log('[xmov] 🔊 状态: hasSpeakStartedRef=', hasSpeakStartedRef.current);
          console.log('[xmov] 🔊 状态: isConversationActiveRef=', isConversationActiveRef.current);
          console.log('[xmov] 🔊 状态: isSDKReadyForSpeak=', isSDKReadyForSpeakRef.current);

          // 🔧 在调用speak之前，确保AudioContext处于运行状态
          await ensureAudioContextRunning();

          // 🔧 如果是新对话的第一条消息，确保SDK处于正确状态
          if (shouldBeStart && sdkRef.current) {
            console.log('[xmov] 🔊 这是新对话的第一条消息，确保SDK在正确状态');
            try {
              sdkRef.current.onlineMode();
              console.log('[xmov] ✅ 已确认在线模式');
            } catch (e) {
              console.warn('[xmov] ⚠️ 状态切换失败:', e);
            }
          }

          // 使用带重试的 speak 函数
          console.log('[xmov] 🔊 ===== 调用 speakWithRetry =====');
          const success = await speakWithRetry(contentToSpeak, shouldBeStart, isEnd);

          if (success) {
            console.log('[xmov] ✅ speak 调用成功（可能经过重试）');
            hasSpeakStartedRef.current = true; // 标记已开始播放

            if (isEnd) {
              // 对话结束，清除超时定时器
              clearConversationTimeout();
              isConversationActiveRef.current = false;
              hasSpeakStartedRef.current = false;
              console.log('[xmov] 🔊 对话已结束，状态已重置');
            } else {
              // 对话继续，重置超时定时器
              resetConversationTimeout();
              console.log('[xmov] 🔊 对话进行中，已重置超时定时器');
            }
          } else {
            console.error('[xmov] ❌ speak 调用失败（已达最大重试次数）');
            // 即使失败，如果是 isEnd 也要重置状态
            if (isEnd) {
              clearConversationTimeout();
              isConversationActiveRef.current = false;
              hasSpeakStartedRef.current = false;
            }
          }

          console.log('[xmov] 🔊 最终状态: 对话状态=', isConversationActiveRef.current ? '进行中' : '已结束');
        } else {
          console.log('[xmov] ⚠️ 移除思考内容后无有效内容, contentToSpeak=', contentToSpeak);
          // 如果是 isEnd，必须发送结束信号给 SDK（即使没有内容）
          if (isEnd && hasSpeakStartedRef.current) {
            console.log('[xmov] 📢 虽然无内容，但必须发送 is_end=true 结束对话');
            // 使用带重试的函数发送结束信号
            await speakWithRetry(' ', false, true);
            clearConversationTimeout();
            isConversationActiveRef.current = false;
            hasSpeakStartedRef.current = false;
          }
        }
      }
    };

    // 保存初始化函数到 ref，供重新初始化时使用
    reinitSDKFnRef.current = initializeSDK;

    // 保存消息处理函数到 ref，供重新初始化后处理缓存消息
    handleWebSocketMessageFnRef.current = handleWebSocketMessage;

    initializeSDK();

    // 页面可见性变化处理 - 解决浏览器后台节流问题
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[xmov] 📺 页面恢复可见，检查连接状态...');

        // 切换 SDK 到在线模式
        if (sdkRef.current) {
          try {
            sdkRef.current.onlineMode();
            console.log('[xmov] ✅ SDK 已切换到在线模式');
          } catch (error) {
            console.warn('[xmov] ⚠️ 切换在线模式失败:', error);
          }
        }

        // 检查 WebSocket 连接状态，如果断开则重连
        if (wsServiceRef.current && !wsServiceRef.current.isConnected()) {
          console.log('[xmov] 🔄 WebSocket 已断开，正在重连...');
          wsServiceRef.current.connect();
        }

        // 如果不在空闲状态，重置空闲计时器
        if (!isIdleRef.current) {
          resetIdleTimer();
        }

        // 恢复 AudioContext（如果被暂停）
        ensureAudioContextRunning();
      } else {
        console.log('[xmov] 📺 页面进入后台');

        // 切换 SDK 到离线模式（节省资源）
        if (sdkRef.current) {
          try {
            sdkRef.current.offlineMode();
            console.log('[xmov] ✅ SDK 已切换到离线模式');
          } catch (error) {
            console.warn('[xmov] ⚠️ 切换离线模式失败:', error);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);


    return () => {
      mounted = false;
      if (initTimeout) clearTimeout(initTimeout);

      // 移除可见性监听
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // 清理对话超时定时器
      clearConversationTimeout();

      // 清理思考超时定时器
      if (thinkingTimeoutRef.current) {
        clearTimeout(thinkingTimeoutRef.current);
        thinkingTimeoutRef.current = null;
      }

      // 清理空闲检测定时器
      clearIdleTimer();

      // 停止 SDK 健康检查
      stopHealthCheck();

      // 清理 WebSocket
      if (wsServiceRef.current) {
        wsServiceRef.current.disconnect();
        wsServiceRef.current = null;
      }

      // 清理 SDK
      if (sdkRef.current) {
        try {
          sdkRef.current.destroy();
          console.log('[xmov] SDK已销毁');
        } catch (error) {
          console.warn('[xmov] 销毁SDK时出错:', error);
        }
        sdkRef.current = null;
      }
    };
  }, [idleTimeout]);

  // 手动触发重新初始化
  const handleManualRetry = async () => {
    console.log('[xmov] 🔄 用户手动触发重新初始化');
    setRecoveryStatus('recovering');
    if (reinitSDKFnRef.current && !isReinitializingRef.current) {
      isReinitializingRef.current = true;
      sdkRecoveryAttemptsRef.current = 0;
      try {
        // 先销毁旧的 SDK
        if (sdkRef.current) {
          try {
            sdkRef.current.destroy();
          } catch (e) {
            console.warn('[xmov] ⚠️ 销毁旧 SDK 失败:', e);
          }
          sdkRef.current = null;
        }
        await reinitSDKFnRef.current();
        setRecoveryStatus('idle');
      } catch (e) {
        console.error('[xmov] ❌ 手动重新初始化失败:', e);
        setRecoveryStatus('failed');
      }
      isReinitializingRef.current = false;
    }
  };

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-blue-50 via-cyan-50 to-blue-100">
      {/* SDK 容器 - 使用style设置z-index为1，确保UI按钮可以覆盖在上面 */}
      <div ref={containerRef} className="w-full h-full relative" style={{ zIndex: 1 }} />

      {/* 恢复状态提示 - 半透明覆盖层 */}
      {sdkStatus === 'ready' && recoveryStatus !== 'idle' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 z-20 pointer-events-auto">
          <div className="bg-white/95 rounded-2xl p-6 shadow-2xl text-center max-w-sm mx-4">
            {recoveryStatus === 'recovering' && (
              <>
                <div className="w-12 h-12 mx-auto mb-3 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-lg text-gray-700 font-medium">正在恢复连接...</p>
                <p className="text-sm text-gray-500 mt-1">请稍候</p>
              </>
            )}
            {recoveryStatus === 'failed' && (
              <>
                <div className="w-16 h-16 mx-auto mb-3 flex items-center justify-center text-5xl">⚠️</div>
                <p className="text-lg text-red-600 font-medium mb-2">连接中断</p>
                <p className="text-sm text-gray-600 mb-4">数字人暂时无法响应</p>
                <button
                  onClick={handleManualRetry}
                  className="px-6 py-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 active:scale-95 transition-all text-base font-medium"
                >
                  点击重新连接
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 状态覆盖层 */}
      {sdkStatus !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-50 via-cyan-50 to-blue-100 z-10">
          <div className="text-center px-8">
            {sdkStatus === 'loading' && (
              <>
                <div className="w-16 h-16 mx-auto mb-4 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xl text-gray-700 font-medium mb-2">初始化中...</p>
                {loadingProgress > 0 && (
                  <p className="text-base text-gray-500">加载资源 {loadingProgress}%</p>
                )}
              </>
            )}
            {sdkStatus === 'config-missing' && (
              <>
                <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center text-6xl">⚠️</div>
                <p className="text-xl text-red-600 font-medium mb-2">配置未完成</p>
                <p className="text-base text-gray-600 mb-4">{errorMessage}</p>
                <div className="bg-white p-4 rounded-lg text-left text-sm text-gray-700 max-w-md">
                  <p className="font-semibold mb-2">请在系统环境变量中配置：</p>
                  <div className="bg-gray-100 p-3 rounded font-mono text-xs">
                    <p>变量名: XMOV_APP_ID</p>
                    <p>变量值: 您的AppID</p>
                    <p className="mt-2">变量名: XMOV_APP_SECRET</p>
                    <p>变量值: 您的AppSecret</p>
                  </div>
                  <p className="text-xs text-gray-600 mt-3">
                    在 <a href="https://xingyun3d.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">魔珐星云</a> 应用中心创建驱动应用后获取。
                    ���置后需<strong className="text-red-600">重启应用程序</strong>。
                  </p>
                </div>
              </>
            )}
            {sdkStatus === 'error' && (
              <>
                <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center text-6xl">❌</div>
                <p className="text-xl text-red-600 font-medium mb-2">加载失败</p>
                <p className="text-base text-gray-600">{errorMessage}</p>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
};