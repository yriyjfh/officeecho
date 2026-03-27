import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Mic, Users, Image, QrCode, RotateCw, PenSquare ,Phone,FileText} from 'lucide-react';
import { AvatarStage } from '../components/AvatarStage';
import { AvatarErrorBoundary } from '../components/AvatarErrorBoundary';
import { MemoryPlayer } from '../components/MemoryPlayer';
import { MediaPlayer } from '../components/MediaPlayer';
import { EmergencySheet } from '../components/EmergencySheet';
import { ScheduleList } from '../components/ScheduleList';
import { ScheduleReminderToast } from '../components/ScheduleReminderToast';
import { ToastMessage } from '../components/ToastMessage';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TransparentMediaOverlay } from '../components/TransparentMediaOverlay';
import { Whiteboard } from '../components/Whiteboard';
import { LogNotification } from '../components/LogNotification';
import { QRCodeModal } from '../components/QRCodeModal';
import * as scheduleService from '../services/scheduleService';
import * as mediaService from '../services/mediaService';
import * as messageService from '../services/messageService';
import * as alertService from '../services/alertService';
// import { useToastSSE } from '../hooks/useToastSSE';
import { getApiBaseUrl } from '../../config/api';
import { io } from 'socket.io-client';

const DESIGN_WIDTH = 1080;
const DESIGN_HEIGHT = 1920;

// 和风天气API配置
const PUBLIC_API_KEY = "bc9cd001561044d7a18ec315437f37cf"; // API密钥
const PUBLIC_API_HOST = "k42k5pca54.re.qweatherapi.com"; // 公共API地址
const CITY_ID = "101220401"; // 淮南

/**
 * 屏幕端主页
 * 优化为 9:16 竖屏使用（如平板竖屏）
 * 包含数字人、大按钮和各类卡片叠加层
 */
export const HomePage: React.FC = () => {
  const [activeOverlay, setActiveOverlay] = useState<
    'none' | 'reminder' | 'memory' | 'emergency' | 'schedule' | 'media' | 'whiteboard'
  >('none');
  const [whiteboardReturnTo, setWhiteboardReturnTo] = useState<'none' | 'media'>('none');
  const [isAvatarActive, setIsAvatarActive] = useState(false);
  const [memoryMode, setMemoryMode] = useState<'pip' | 'fullscreen'>('fullscreen');
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'info' | 'calling'; message: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [viewportSize, setViewportSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [orientationMode, setOrientationMode] = useState<'portrait' | 'landscape'>('landscape');
  const [sdkStatus, setSDKStatus] = useState<'loading' | 'ready' | 'error' | 'config-missing'>('loading');
  const [wsStatus, setWSStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [todaySchedules, setTodaySchedules] = useState<scheduleService.Schedule[]>([]);
  const [reminderSchedule, setReminderSchedule] = useState<scheduleService.Schedule | null>(null);
  const [shownReminders, setShownReminders] = useState<Set<string>>(new Set());
  const [postponedReminders, setPostponedReminders] = useState<Map<number, Date>>(new Map()); // 记录推迟的课表和推迟到的时间
  const [recommendedMedia, setRecommendedMedia] = useState<mediaService.RecommendedMedia[]>([]);
  const [, setLoadingMedia] = useState(false);
  const [playedMessages, setPlayedMessages] = useState<Set<number>>(new Set()); // 记录已播报的通知ID
  const [mediaOverlay, setMediaOverlay] = useState<{
    filename: string;
    type: 'photo' | 'video';
    text?: string;
    duration?: number;
  } | null>(null); // 透明窗口文件展示状态
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState<boolean>(true); // 麦克风状态
  const [logMessage, setLogMessage] = useState<string | null>(null); // WebSocket log消息
  const [subtitle, setSubtitle] = useState<string | null>(null); // 数字人说话字幕
  const isIdle = useState<boolean>(false)[0]; // 是否处于空闲状态
  const setIsIdle = useState<boolean>(false)[1];
  const isIdleRef = React.useRef<boolean>(false); // 用于在回调中检查空闲状态
  const activeOverlayRef = React.useRef(activeOverlay); // 追踪 activeOverlay 状态
  const mediaOverlayRef = React.useRef(mediaOverlay); // 追踪 mediaOverlay 状态

  // 同步 refs
  useEffect(() => {
    activeOverlayRef.current = activeOverlay;
    mediaOverlayRef.current = mediaOverlay;
  }, [activeOverlay, mediaOverlay]);
  useEffect(() => {
    const handleResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);
  const [showQRCode, setShowQRCode] = useState<boolean>(false); // 是否显示二维码弹窗
  const [resetIdleTrigger, setResetIdleTrigger] = useState<number>(0); // 用于触发空闲计时器重置
  const [isAvatarVisible, setIsAvatarVisible] = useState<boolean>(true); // 数字人是否可见（不影响WebSocket连接）
  const [elderlyName, setElderlyName] = useState<string>('学生1'); // 学生名称
  const [systemStats, setSystemStats] = useState<{ cpu: number; memory: number; gpu?: number } | null>(null); // 系统资源监控
  const familyId = 'family_001'; // 实际使用时从用户上下文获取
  const elderlyId = 1; // 学生用户ID，实际使用时从用户上下文获取

  // 获取学生名称
  useEffect(() => {
    const fetchElderlyName = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/users/${familyId}`);
        if (response.ok) {
          const data = await response.json();
          const elderly = data.users?.find((u: any) => u.id === elderlyId);
          if (elderly?.name) {
            setElderlyName(elderly.name);
          }
        }
      } catch (error) {
        console.error('获取学生名称失败:', error);
      }
    };
    fetchElderlyName();
  }, []);

  // 从 Fay 同步麦克风状态
  const syncMicrophoneState = async () => {
    try {
      const response = await fetch('http://127.0.0.1:5000/api/get-audio-config');
      if (response.ok) {
        const data = await response.json();
        console.log('[HomePage] 同步麦克风状态:', data);
        setIsMicrophoneEnabled(data.mic ?? true);
      }
    } catch (error) {
      console.error('[HomePage] 同步麦克风状态失败:', error);
    }
  };

  // 初始加载时同步
  useEffect(() => {
    syncMicrophoneState();
  }, []);

  // 从文件播放界面返回时重新同步
  useEffect(() => {
    if (activeOverlay === 'none') {
      console.log('[HomePage] 从文件播放界面返回，重新同步麦克风状态');
      // 延迟 500ms 以等待 MediaPlayer 的清理函数（恢复麦克风）执行完成
      const timer = setTimeout(() => {
        syncMicrophoneState();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [activeOverlay]);

  // 监听系统资源
  useEffect(() => {
    const apiUrl = getApiBaseUrl();
    const socketUrl = apiUrl.replace('/api', ''); // http://host:8000
    const socket = io(socketUrl);

    socket.on('connect', () => {
      console.log('[SystemMonitor] Connected to backend Socket.IO');
    });

    socket.on('system_stats', (data: { cpu: number; memory: number; gpu?: number }) => {
      setSystemStats(data);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // 轮询检查联系辅导员的alerts（与管理端相同的方案）
  useEffect(() => {
    let lastAlertId = 0; // 记录上次处理的alert ID
    let isInitialized = false; // 标记是否已初始化

    const checkContactFamilyAlerts = async () => {
      try {
        const response = await fetch(
          `${getApiBaseUrl()}/family/alerts?family_id=${familyId}&handled=false&alert_type=contact_family&limit=1`
        );

        if (!response.ok) {
          console.error('[HomePage] 查询alerts失败:', response.status);
          return;
        }

        const data = await response.json();
        const alerts = data.alerts || [];

        if (alerts.length > 0) {
          const alert = alerts[0];

          // 首次初始化：只记录ID，不显示Toast（避免刷新页面时重复显示旧alert）
          if (!isInitialized) {
            lastAlertId = alert.id;
            isInitialized = true;
            console.log('[HomePage] 初始化lastAlertId:', lastAlertId);
            return;
          }

          // 只处理新的alert（避免重复显示）
          if (alert.id > lastAlertId) {
            lastAlertId = alert.id;

            console.log('[HomePage] ✓ 收到联系辅导员alert:', alert);

            // 显示Toast
            const message = alert.metadata?.is_emergency
              ? "正在紧急通知辅导员..."
              : "正在通知辅导员...";

            setToastMessage({
              type: 'calling',
              message: message
            });
            console.log('[HomePage] ✓ Toast已显示:', message);

            // 10秒后自动关闭
            setTimeout(() => {
              console.log('[HomePage] 关闭Toast');
              setToastMessage(null);
            }, 10000);
          }
        } else {
          // 没有未处理的alert时，标记为已初始化
          if (!isInitialized) {
            isInitialized = true;
            console.log('[HomePage] 初始化完成，当前无未处理alert');
          }
        }
      } catch (error) {
        console.error('[HomePage] 检查alerts失败:', error);
      }
    };

    // 立即执行一次
    checkContactFamilyAlerts();

    // 每2秒检查一次新alerts
    const interval = setInterval(checkContactFamilyAlerts, 2000);

    return () => clearInterval(interval);
  }, [familyId]);

  // 加载今日计划
  useEffect(() => {
    loadTodaySchedules();
    // 每分钟刷新一次
    const interval = setInterval(loadTodaySchedules, 60000);
    return () => clearInterval(interval);
  }, []);

  // 监听课表状态变化，自动关闭已完成/已忽略的弹窗
  useEffect(() => {
    if (reminderSchedule && reminderSchedule.id) {
      // 在最新的课表列表中查找当前弹窗对应的课表
      const updatedSchedule = todaySchedules.find(s => s.id === reminderSchedule.id);
      // 如果课表状态不是pending，关闭弹窗
      if (updatedSchedule && updatedSchedule.status !== 'pending') {
        console.log(`课表 ${reminderSchedule.title} 状态已变更为 ${updatedSchedule.status}，关闭弹窗`);
        setReminderSchedule(null);
      }
    }
  }, [todaySchedules, reminderSchedule]);

  // 加载推荐文件
  const loadRecommendedMedia = async () => {
    try {
      setLoadingMedia(true);
      const response = await mediaService.getRecommendedMedia(familyId, elderlyId);
      setRecommendedMedia(response.media);
      console.log('加载到推荐文件:', response.media.length, '个');
    } catch (error) {
      console.error('加载推荐文件失败:', error);
    } finally {
      setLoadingMedia(false);
    }
  };

  // 处理空闲状态变化
  const handleIdleStateChange = async (idle: boolean) => {
    console.log(`[HomePage] 空闲状态变化: ${idle ? '进入空闲' : '退出空闲'}`);
    setIsIdle(idle);
    isIdleRef.current = idle; // 同步更新ref，供定时器回调使用

    if (idle) {
      // 进入空闲状态，先加载推荐文件
      console.log('[HomePage] 进入空闲模式，加载推荐文件...');
      try {
        const response = await mediaService.getRecommendedMedia(familyId, elderlyId);
        const mediaList = response.media || [];
        setRecommendedMedia(mediaList);
        console.log('[HomePage] 加载到推荐文件:', mediaList.length, '个');

        if (mediaList.length > 0) {
          // 有推荐文件，隐藏数字人并打开文件播放器
          console.log('[HomePage] 有推荐文件，隐藏数字人，打开文件播放器');
          setIsAvatarVisible(false);
          setActiveOverlay('media');
        } else {
          // 没有文件时重置空闲状态，让数字人继续显示
          console.log('[HomePage] 没有推荐文件，保持数字人显示');
          setIsIdle(false);
          isIdleRef.current = false;
          // 重置空闲计时器，重新开始计时
          setResetIdleTrigger(prev => prev + 1);
        }
      } catch (error) {
        console.error('[HomePage] 加载推荐文件失败:', error);
        // 加载失败也重置状态
        setIsIdle(false);
        isIdleRef.current = false;
        setResetIdleTrigger(prev => prev + 1);
      }
    } else {
      // 退出空闲状态，显示数字人，关闭文件播放器
      console.log('[HomePage] 退出空闲模式，显示数字人，关闭文件播放器');
      setIsAvatarVisible(true);
      if (activeOverlay === 'media') {
        setActiveOverlay('none');
      }
    }
  };

  // 处理收到 WebSocket text 消息（关闭所有文件播放器，切换回数字人界面）
  const handleTextReceived = () => {
    console.log('[HomePage] 收到WebSocket text消息，关闭文件播放器，切换回数字人界面');
    // 关闭所有类型的文件播放器（待机自动进入的、手动点击的）
    if (activeOverlay === 'media' || activeOverlay === 'memory' || activeOverlay === 'whiteboard') {
      setActiveOverlay('none');
    }
    // 关闭透明窗口文件播放（这会使 isMediaPlaying 变为 false，触发 SDK 恢复）
    setMediaOverlay(null);
    // 显示数字人
    setIsAvatarVisible(true);
    // 重置空闲状态
    setIsIdle(false);
    isIdleRef.current = false;
  };

  // 用于控制麦克风恢复的定时器引用（防止竞态）
  const micRestoreTimerRef = React.useRef<number | null>(null);
  const isSpeakingRef = React.useRef<boolean>(false);

  // 用于控制字幕清除的定时器引用
  const subtitleClearTimerRef = React.useRef<number | null>(null);

  // 处理字幕变化
  const handleSubtitleChange = (subtitleText: string) => {
    console.log('[HomePage] 收到字幕更新:', subtitleText);
    setSubtitle(subtitleText);
    
    // 清除之前的定时器
    if (subtitleClearTimerRef.current) {
      clearTimeout(subtitleClearTimerRef.current);
      subtitleClearTimerRef.current = null;
    }
    
    // 暂时不自动清除字幕，等待数字人说话结束
  };

  // 处理数字人说话状态变化（用于控制 Fay 麦克风，避免回声）
  const handleSpeakingChange = async (isSpeaking: boolean) => {
    console.log('[HomePage] 数字人说话状态变化:', isSpeaking ? '开始说话' : '结束说话');
    isSpeakingRef.current = isSpeaking;

    try {
      if (isSpeaking) {
        // 数字人开始说话，立即取消任何待执行的麦克风恢复定时器
        if (micRestoreTimerRef.current) {
          console.log('[HomePage] 取消待执行的麦克风恢复定时器');
          clearTimeout(micRestoreTimerRef.current);
          micRestoreTimerRef.current = null;
        }

        // 关闭 Fay 麦克风（避免拾取数字人的声音）
        console.log('[HomePage] 关闭 Fay 麦克风（数字人正在说话）');
        const response = await fetch('http://127.0.0.1:5000/api/toggle-microphone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: false }),
        });
        if (response.ok) {
          const result = await response.json();
          console.log('[HomePage] Fay 麦克风已关闭:', result);
          setIsMicrophoneEnabled(false);
        }
      } else {
        // 数字人结束说话，延迟一小段时间后开启 Fay 麦克风（等音频完全结束）
        console.log('[HomePage] 数字人结束说话，500ms 后开启 Fay 麦克风');

        // 清除之前的定时器（如果有）
        if (micRestoreTimerRef.current) {
          clearTimeout(micRestoreTimerRef.current);
        }

        micRestoreTimerRef.current = window.setTimeout(async () => {
          // 再次检查：如果在等待期间又开始说话了，不要开启麦克风
          if (isSpeakingRef.current) {
            console.log('[HomePage] 定时器触发时数字人仍在说话，跳过开启麦克风');
            return;
          }

          try {
            const response = await fetch('http://127.0.0.1:5000/api/toggle-microphone', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ enabled: true }),
            });
            if (response.ok) {
              const result = await response.json();
              console.log('[HomePage] Fay 麦克风已开启:', result);
              setIsMicrophoneEnabled(true);
            }
          } catch (error) {
            console.error('[HomePage] 开启 Fay 麦克风失败:', error);
          }
          micRestoreTimerRef.current = null;
        }, 500);

        // 数字人结束说话后，延迟5秒清除字幕，让用户有足够时间阅读
        if (subtitleClearTimerRef.current) {
          clearTimeout(subtitleClearTimerRef.current);
        }
        subtitleClearTimerRef.current = window.setTimeout(() => {
          setSubtitle(null);
          subtitleClearTimerRef.current = null;
        }, 5000);
      }
    } catch (error) {
      console.error('[HomePage] 控制 Fay 麦克风失败:', error);
    }
  };

  // 当推荐文件更新且处于空闲状态时，确保文件播放器打开
  useEffect(() => {
    if (isIdle && recommendedMedia.length > 0 && activeOverlay !== 'media') {
      setActiveOverlay('media');
    }
  }, [recommendedMedia, isIdle]);

  // 处理文件播放器关闭（用户手动关闭）
  const handleMediaPlayerClose = () => {
    console.log('[HomePage] 用户手动关闭文件播放器');
    setActiveOverlay('none');
    // 重置空闲状态，这样空闲检测会重新开始计时
    setIsIdle(false);
    isIdleRef.current = false;
    // 显示数字人（不需要重新初始化，因为WebSocket一直保持连接）
    setIsAvatarVisible(true);
    // 触发 XmovAvatar 重置空闲计时器
    setResetIdleTrigger(prev => prev + 1);
  };

  // 检测课表到达时间
  useEffect(() => {
        const checkScheduleTime = () => {
          const now = new Date();
          const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
          // 遍历今日计划，查找需要提醒的
          todaySchedules.forEach((schedule) => {
            if (!schedule.id) return;
    
            // 只处理待执行状态的课表
            if (schedule.status !== 'pending') return;
    
            const reminderKey = `${schedule.id}_${todayStr}`;
    
            // 已经提醒过的跳过
            if (shownReminders.has(reminderKey)) return;
    
            // 检查是否被推迟，如果被推迟且未到推迟时间，则跳过
            const postponedTime = postponedReminders.get(schedule.id);
            if (postponedTime && now < postponedTime) {
              console.log(`课表 ${schedule.title} 已推迟到 ${postponedTime.toLocaleTimeString()}，暂不提醒`);
              return;
            }
    
            // 如果已过推迟时间，清除推迟记录
            if (postponedTime && now >= postponedTime) {
              console.log(`课表 ${schedule.title} 推迟时间已到，现在提醒`);
              setPostponedReminders(prev => {
                const newMap = new Map(prev);
                newMap.delete(schedule.id!);
                return newMap;
              });
            }
    
            // 规范化课表时间到今天（因为重复课表的日期可能是过去创建的时间）
            const scheduleTimeRaw = new Date(schedule.schedule_time);
            const scheduleTime = new Date(now);
            scheduleTime.setHours(scheduleTimeRaw.getHours(), scheduleTimeRaw.getMinutes(), 0, 0);
    
            const diffMinutes = (scheduleTime.getTime() - now.getTime()) / (1000 * 60);
    
            // 到达时间（允许 1 分钟误差）
            if (diffMinutes <= 1 && diffMinutes >= -1) {
              console.log('课表到达时间，显示提醒:', schedule.title);
    
              // 构建提醒内容
              const timeStr = scheduleService.formatTime(schedule.schedule_time);
              const typeLabel = scheduleService.getScheduleTypeLabel(schedule.schedule_type || 'other');
              let reminderText = `${timeStr}，${typeLabel}提醒：${schedule.title}`;
    
              // 如果有描述，添加描述
              if (schedule.description) {
                reminderText += `。${schedule.description}`;
              }
    
              // 检查是否正在播放文件（使用 ref 获取最新状态）
              const isMediaActive = 
                activeOverlayRef.current === 'media' || 
                activeOverlayRef.current === 'memory' || 
                activeOverlayRef.current === 'whiteboard' ||
                !!mediaOverlayRef.current;
    
              if (isMediaActive) {
                console.log('当前正在播放文件，先恢复数字人界面');
                // 关闭文件播放
                setActiveOverlay('none');
                setMediaOverlay(null);
                
                // 延迟执行播报和弹窗，确保数字人已恢复
                setTimeout(() => {
                  console.log('数字人界面已恢复，执行课表播报');
                  sendToAvatar(reminderText);
                  setReminderSchedule(schedule);
                }, 1000); // 1秒等待时间
              } else {
                // 正常流程
                sendToAvatar(reminderText);
                setReminderSchedule(schedule);
              }
    
              setShownReminders(prev => new Set(prev).add(reminderKey));
            }
          });
        };
    // 每 10 秒检查一次
    const interval = setInterval(checkScheduleTime, 10000);
    checkScheduleTime(); // 立即执行一次

    return () => clearInterval(interval);
  }, [todaySchedules, shownReminders, postponedReminders]);

  const loadTodaySchedules = async () => {
    try {
      const now = new Date().toLocaleTimeString('zh-CN');
      console.log(`[${now}] 自动检查课表更新...`);
      const data = await scheduleService.getTodaySchedules(familyId);
      setTodaySchedules(data);
      console.log(`[${now}] 加载到 ${data.length} 条课表`);
    } catch (error) {
      console.error('加载今日计划失败:', error);
    }
  };

  // 检查并播报待播放的通知
  const checkAndPlayMessages = async () => {
    try {
      const now = new Date().toLocaleTimeString('zh-CN');
      console.log(`[${now}] 检查待播放通知...`);

      const pendingMessages = await messageService.getPendingMessages(familyId);

      if (pendingMessages.length > 0) {
        console.log(`发现 ${pendingMessages.length} 条待播放通知`);

        for (const message of pendingMessages) {
          // 检查是否已经播报过（避免重复播报）
          if (!playedMessages.has(message.id)) {
            console.log(`播报通知 ID: ${message.id} - 来自辅导员${message.sender_name}`);

            // 推送到数字人播报
            await messageService.playMessageOnAvatar(message);

            // 显示Toast字幕提示（30秒）
            const toastText = `来自辅导员${message.sender_name}的通知：${message.content}`;
            setToastMessage({ type: 'info', message: toastText });

            // 30秒后自动关闭Toast
            setTimeout(() => {
              setToastMessage(null);
            }, 30000);

            // 标记为已播放
            await messageService.markAsPlayed(message.id);

            // 记录已播报
            setPlayedMessages((prev) => new Set(prev).add(message.id));

            console.log(`通知 ID: ${message.id} 播报完成`);
          }
        }
      }
    } catch (error) {
      console.error('检查并播报通知失败:', error);
    }
  };

  // 定时检查待播放通知（每5秒检查一次，确保立即发送的通知能快速响应）
  useEffect(() => {
    checkAndPlayMessages(); // 立即执行一次
    const interval = setInterval(checkAndPlayMessages, 5000); // 每5秒检查
    return () => clearInterval(interval);
  }, [playedMessages]);

  // 轮询文件展示事件（每5秒检查一次）
  const pollMediaEvents = async () => {
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/elderly/poll-media-events?family_id=${familyId}`
      );

      if (!response.ok) {
        throw new Error(`轮询文件事件失败: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.event && data.event.metadata) {
        const metadata = data.event.metadata;
        console.log('收到文件展示事件:', metadata);

        // 推送播报内容到数字人（与课表模块相同的逻辑）
        if (metadata.avatar_text) {
          console.log('准备调用 sendToAvatar，文本内容:', metadata.avatar_text);

          // 确保麦克风已开启（文件展示时需要数字人播报）
          await ensureMicrophoneEnabled();

          await sendToAvatar(metadata.avatar_text);
          console.log('sendToAvatar 调用完成');
        } else {
          console.warn('没有 avatar_text，跳过数字人播报');
        }

        // 设置文件展示状态，触发透明窗口弹出
        setMediaOverlay({
          filename: metadata.media_filename,
          type: metadata.media_type || 'photo',
          text: metadata.avatar_text,
          duration: metadata.duration || 30,
        });
      }
    } catch (error) {
      console.error('轮询文件事件错误:', error);
    }
  };

  // 定时轮询文件展示事件（每5秒检查一次）
  useEffect(() => {
    pollMediaEvents(); // 立即执行一次
    const interval = setInterval(pollMediaEvents, 5000); // 每5秒检查
    return () => clearInterval(interval);
  }, []);

  // 确保麦克风已开启
  const ensureMicrophoneEnabled = async () => {
    try {
      console.log('[ensureMicrophoneEnabled] 确保麦克风已开启...');
      const response = await fetch('http://127.0.0.1:5000/api/toggle-microphone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: true }),
      });

      if (!response.ok) {
        throw new Error(`开启麦克风失败: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[ensureMicrophoneEnabled] 麦克风状态:', result);
    } catch (error) {
      console.error('[ensureMicrophoneEnabled] 开启麦克风错误:', error);
    }
  };

  // 向数字人推送播报内容
  const sendToAvatar = async (text: string) => {
    try {
      console.log('[sendToAvatar] 开始推送播报内容:', text);
      console.log('[sendToAvatar] 请求URL: http://127.0.0.1:5000/transparent-pass');

      const requestBody = {
        user: 'User',
        text: text,
      };
      console.log('[sendToAvatar] 请求体:', requestBody);

      const response = await fetch('http://127.0.0.1:5000/transparent-pass', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('[sendToAvatar] 响应状态:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[sendToAvatar] 响应错误内容:', errorText);
        throw new Error(`推送播报失败: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[sendToAvatar] 播报内容推送成功，响应:', result);
    } catch (error) {
      console.error('[sendToAvatar] 推送播报内容错误:', error);
      // 不抛出错误，让流程继续（即使播报失败，也要显示文件）
    }
  };

  // 模拟文件库数据
  const mediaLibrary = [
    { id: '1', url: '/placeholder-photo.jpg', type: 'photo' as const, caption: '小米 2018 秋游' },
    { id: '2', url: '/placeholder-photo-2.jpg', type: 'photo' as const, caption: '2019 春节团聚' },
    { id: '3', url: '/placeholder-photo-3.jpg', type: 'photo' as const, caption: '奶奶80岁生日' },
    { id: '4', url: '/placeholder-photo-4.jpg', type: 'photo' as const, caption: '家庭野餐' },
    { id: '5', url: '/placeholder-photo-5.jpg', type: 'photo' as const, caption: '小孙子周岁' },
  ];

  // 获取当前时间和日期信息
  const now = new Date();
  const currentTime = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const currentDate = now.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
  });
  const currentDay = now.toLocaleDateString('zh-CN', {
    weekday: 'long',
  });
  // 使用和风天气API获取淮南天气信息
  const [weather, setWeather] = useState<string>('晴 22°C');
  const [weatherDetails, setWeatherDetails] = useState<{ humidity: string; wind: string }>({ humidity: '50%', wind: '微风' });
  const [weatherLoading, setWeatherLoading] = useState<boolean>(true);
  
  // 加载天气信息
  useEffect(() => {
    const fetchWeather = async () => {
      try {
        setWeatherLoading(true);
        
        const response = await axios.get(
          `https://${PUBLIC_API_HOST}/v7/weather/now`,
          {
            params: {
              location: CITY_ID,
              key: PUBLIC_API_KEY,
              lang: 'zh',         // 中文返回
              unit: 'm',          // 公制单位
              gzip: 'n'           // 不压缩
            },
            timeout: 5000,        // 5秒超时
          }
        );
        
        if (response.data.code === "200") {
          const data = response.data.now;
          setWeather(`${data.text} ${data.temp}℃`);
          setWeatherDetails({
            humidity: `${data.humidity}%`,
            wind: `${data.windDir} ${data.windScale}级`
          });
          console.log('✅ 天气数据获取成功:', data);
        } else {
          // 处理API错误码
          console.error('天气API错误:', response.data.code, response.data.message);
          setWeather("数据更新中");
          setWeatherDetails({ humidity: '50%', wind: '微风' });
        }
      } catch (err: any) {
        console.error('获取淮南天气失败:', err.message);
          setWeather("网络异常"); // 更友好的错误提示
          setWeatherDetails({ humidity: '50%', wind: '微风' });
      } finally {
        setWeatherLoading(false);
      }
    };

    fetchWeather();
    
    // 每30分钟更新一次天气
    const interval = setInterval(fetchWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // 切换麦克风开关
  const handleMicClick = async () => {
    try {
      console.log('[handleMicClick] 切换麦克风状态，当前状态:', isMicrophoneEnabled);

      // 先显示视觉反馈
      setIsAvatarActive(true);
      setTimeout(() => setIsAvatarActive(false), 1000);

      // 调用麦克风切换API（不传参数则自动切换）
      const response = await fetch('http://127.0.0.1:5000/api/toggle-microphone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}), // 不传参数，自动切换状态
      });

      if (!response.ok) {
        throw new Error(`切换麦克风失败: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[handleMicClick] 麦克风切换结果:', result);

      // 更新UI状态
      setIsMicrophoneEnabled(result.enabled);

    } catch (error) {
      console.error('[handleMicClick] 切换麦克风错误:', error);
    }
  };

  const handleFamilyClick = async () => {
    setToastMessage({ type: 'calling', message: '正在呼叫辅导员...' });
    // 推送普通消息到管理端
    try {
      await alertService.sendContactFamilyAlert(familyId, elderlyId, elderlyName);
      console.log('已通知辅导员');
    } catch (error) {
      console.error('通知辅导员失败:', error);
    }
  };

  // const handleEmergencyClick = () => {
  //   setActiveOverlay('emergency');
  // };

  const handlePhotosClick = async () => {
    // 加载推荐文件
    await loadRecommendedMedia();
    setActiveOverlay('media');
  };

  const handleNextMedia = () => {
    if (currentMediaIndex < mediaLibrary.length - 1) {
      setCurrentMediaIndex(currentMediaIndex + 1);
    }
  };

  const handlePreviousMedia = () => {
    if (currentMediaIndex > 0) {
      setCurrentMediaIndex(currentMediaIndex - 1);
    }
  };

  const handleSelectMedia = (index: number) => {
    setCurrentMediaIndex(index);
  };

  // 获取要显示的课表（下一个未过期的课表，或者最后一个课表）
  const getDisplaySchedule = () => {
    if (todaySchedules.length === 0) return null;

    const now = new Date();
    const sorted = scheduleService.sortSchedulesByTime(todaySchedules);

    // 查找下一个还未过期的课表（时间还没到或刚过去30分钟内的）
    let firstPending: scheduleService.Schedule | null = null;

    for (const schedule of sorted) {
      // 忽略非 pending 状态的课表（已完成、已跳过等）
      if (schedule.status && schedule.status !== 'pending') {
        continue;
      }

      // 记录第一个遇到的 pending 课表作为备选（即使它已经过期）
      if (!firstPending) {
        firstPending = schedule;
      }

      const scheduleTime = new Date(schedule.schedule_time);
      const diffMinutes = (scheduleTime.getTime() - now.getTime()) / (1000 * 60);

      // 如果课表还没到或刚过去30分钟内，显示这个课表
      if (diffMinutes >= -30) {
        return schedule;
      }
    }

    // 如果没有找到符合时间条件的，优先显示第一个待办课表（哪怕已过期）
    if (firstPending) {
      return firstPending;
    }

    // 如果所有课表都已过期且没有待办，显示最后一个课表
    return sorted[sorted.length - 1];
  };

  const displaySchedule = getDisplaySchedule();
  const isLandscape = orientationMode === 'landscape';
  const stageWidth = isLandscape ? DESIGN_HEIGHT : DESIGN_WIDTH;
  const stageHeight = isLandscape ? DESIGN_WIDTH : DESIGN_HEIGHT;
  const scale = Math.min(
    viewportSize.width / stageWidth,
    viewportSize.height / stageHeight
  );
  const orientationToggleLabel = orientationMode === 'landscape' ? '横屏' : '竖屏';
  const handleToggleOrientation = () => {
    setOrientationMode((prev) => (prev === 'portrait' ? 'landscape' : 'portrait'));
  };
  const stageStyle: React.CSSProperties = {
    width: stageWidth,
    height: stageHeight,
    transform: `translate(-50%, -50%) scale(${Number.isFinite(scale) ? scale : 1})`,
    transformOrigin: 'center'
  };

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <div className="absolute left-1/2 top-1/2 elderly-mode" style={stageStyle}>
      {/* 主内容区域 - 满屏显示 */}
        <div className="relative w-full h-full bg-gray-50 overflow-hidden">
        {/* 数字人画面 - 全屏背景（隐藏时保持WebSocket连接，用z-index控制层级而非visibility） */}
        <div className={`absolute inset-0 ${isAvatarVisible ? 'z-0' : 'z-[-1]'}`}>
          <AvatarErrorBoundary onError={(error) => console.error('[HomePage] 数字人组件错误:', error)}>
            <AvatarStage
              isActive={isAvatarActive}
              onSDKStatusChange={setSDKStatus}
              onWSStatusChange={setWSStatus}
              onLogMessage={setLogMessage}
              onIdleStateChange={handleIdleStateChange}
              onTextReceived={handleTextReceived}
              onSpeakingChange={handleSpeakingChange}
              onSubtitleChange={handleSubtitleChange}
              idleTimeout={5 * 60 * 1000} // 5分钟无互动后进入文件播放
              resetIdleTrigger={resetIdleTrigger}
              isMediaPlaying={!!mediaOverlay || activeOverlay === 'media' || activeOverlay === 'whiteboard'}
              isVisible={isAvatarVisible}
            />
          </AvatarErrorBoundary>
        </div>

      {/* PIP 模式的文件播放器 */}
      {activeOverlay === 'memory' && memoryMode === 'pip' && (
        <MemoryPlayer
          mediaType="photo"
          mode="pip"
          mediaList={mediaLibrary}
          currentIndex={currentMediaIndex}
          onLike={() => console.log('Liked')}
          onDislike={() => console.log('Disliked')}
          onClose={() => setActiveOverlay('none')}
          onToggleMode={() => setMemoryMode('fullscreen')}
          onNext={handleNextMedia}
          onPrevious={handlePreviousMedia}
          onSelectMedia={handleSelectMedia}
          logMessage={logMessage}
          orientationMode={orientationMode}
          onToggleOrientation={handleToggleOrientation}
        />
      )}

      {/* 顶部状态栏 - 悬浮层 */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/40 to-transparent px-4 py-3">
        <div className="flex items-center justify-between text-white">
          {/* 左侧区域：状态指示器 + 时间日期 */}
          <div className="flex items-center gap-4">
            {/* 连接状态指示器 - 竖排两个绿点 */}
            <div className="flex flex-col gap-2">
              <span
                className={`w-3 h-3 rounded-full animate-pulse ${
                  sdkStatus === 'ready' ? 'bg-green-500' : sdkStatus === 'loading' ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                title={sdkStatus === 'ready' ? 'SDK就绪' : sdkStatus === 'loading' ? 'SDK初始化中' : 'SDK错误'}
              />
              <span
                className={`w-3 h-3 rounded-full animate-pulse ${
                  wsStatus === 'connected' ? 'bg-green-500' : wsStatus === 'connecting' ? 'bg-yellow-500' : 'bg-gray-500'
                }`}
                title={wsStatus === 'connected' ? 'WebSocket已连接' : wsStatus === 'connecting' ? 'WebSocket连接中' : 'WebSocket未连接'}
              />
            </div>

            {/* 时间日期信息 */}
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold drop-shadow-lg">
                  {currentTime}
                </span>
                <span className="text-base drop-shadow-md">
                  {currentDate}
                </span>
              </div>
              <div className="flex flex-col gap-1 text-sm drop-shadow-md">
                <div className="flex items-center gap-2">
                  <span>{currentDay}</span>
                  <span className="text-yellow-300 text-lg font-bold">☀️ {weather}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-blue-500">
                  <span>湿度: {weatherDetails.humidity}</span>
                  <span>风力: {weatherDetails.wind}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 中间Logo区域 */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <div className="flex items-baseline gap-2 justify-center mb-1">
              <h1 className="text-2xl font-bold drop-shadow-lg">辅导员</h1>
              <span className="text-sm drop-shadow-md opacity-90">数字人</span>
            </div>
            <p className="text-xs drop-shadow-md opacity-80 italic whitespace-nowrap">
              让每个同学都能得到答案
            </p>
          </div>

          <button
            onClick={() => setActiveOverlay('schedule')}
            className="text-xl font-bold bg-white/40 px-4 py-2 rounded-full hover:bg-white/50 active:scale-95 transition-all"
          >
            {displaySchedule ? (
              <>
                {scheduleService.getScheduleTypeIcon(displaySchedule.schedule_type || 'other')}{' '}
                {scheduleService.formatTime(displaySchedule.schedule_time)}{' '}
                {displaySchedule.title}
              </>
            ) : (
              <>📅 今日暂无计划</>
            )}
          </button>

      </div>
      </div>

      <button
        onClick={handleToggleOrientation}
        className="absolute bottom-6 left-6 z-40 flex items-center gap-2 text-lg font-bold bg-black/55 text-white px-5 py-3 rounded-2xl shadow-2xl hover:bg-black/70 active:scale-95 transition-all"
        aria-label="切换横竖屏"
        title={`切换为${orientationToggleLabel}`}
      >
        <RotateCw size={24} strokeWidth={2.6} />
        <span>{orientationToggleLabel}</span>
      </button>

      {/* 左侧按钮组 - 功能按钮垂直排列 */}
      <div className="absolute left-1/2 flex flex-row gap-4 z-40" style={{ bottom: '30px', transform: 'translateX(-50%)' }}>
        {/* 麦克风按钮容器 - 用于承载log通知 */}
        <div className="relative">
          <button
            onClick={handleMicClick}
            className={`w-16 h-16 flex items-center justify-center ${
              isMicrophoneEnabled
                ? 'bg-green-500 hover:bg-green-600'
                : 'bg-gray-500 hover:bg-gray-600'
            } text-white rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all`}
            aria-label={isMicrophoneEnabled ? '点击关闭麦克风' : '点击开启麦克风'}
          >
            <Mic size={32} strokeWidth={2.5} />
          </button>


          {/* Log通知 - 从麦克风按钮向右延伸 */}
          {logMessage && (
            <LogNotification
              message={logMessage}
              onHide={() => setLogMessage(null)}
            />
          )}
        </div>
        </div>
        <div className="absolute left-4 top-1/2 flex flex-col gap-4 z-40" style={{ transform: 'translateY(-50%)' }}>
        <button
          onClick={handleFamilyClick}
          className="w-16 h-16 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all"
          aria-label="联系辅导员"
        >
          <Phone size={32} strokeWidth={2.5} />
        </button>

        <button
          onClick={handlePhotosClick}
          className="w-16 h-16 flex items-center justify-center bg-purple-500 hover:bg-purple-600 text-white rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all"
          aria-label="查看学校最新的相关政策"
        >
          <FileText size={32} strokeWidth={2.5} />
        </button>
        {/* <button
          onClick={() => {
            setWhiteboardReturnTo('none');
            setActiveOverlay('whiteboard');
          }}
          className="w-16 h-16 flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 text-white rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all"
          aria-label="打开白板"
        >
          <PenSquare size={30} strokeWidth={2.5} />
        </button> */}

      </div>
        

      {/* 右下角 - 管理端二维码按钮
      <div className="absolute right-4 bottom-4 z-40">
        <button
          onClick={() => setShowQRCode(true)}
          className="w-20 h-20 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all"
          aria-label="扫码打开管理端"
        >
          <QrCode size={40} strokeWidth={2} />
        </button>

      </div> */}

      {/* 叠加层 - 文件播放（全屏） */}
      {activeOverlay === 'memory' && memoryMode === 'fullscreen' && (
        <MemoryPlayer
          mediaType="photo"
          mode="fullscreen"
          mediaList={mediaLibrary}
          currentIndex={currentMediaIndex}
          onLike={() => console.log('Liked')}
          onDislike={() => console.log('Disliked')}
          onClose={() => setActiveOverlay('none')}
          onToggleMode={() => setMemoryMode('pip')}
          onNext={handleNextMedia}
          onPrevious={handlePreviousMedia}
          onSelectMedia={handleSelectMedia}
          logMessage={logMessage}
          orientationMode={orientationMode}
          onToggleOrientation={handleToggleOrientation}
        />
      )}

      {/* 叠加层 - 紧急求助 */}
      {activeOverlay === 'emergency' && (
        <EmergencySheet
          onContactFamily={async () => {
            setActiveOverlay('none');
            setToastMessage({ type: 'calling', message: '正在紧急呼叫辅导员...' });
            // 推送紧急求助消息到管理端
            try {
              await alertService.sendUrgentHelpAlert(familyId, elderlyId, elderlyName);
              console.log('已发送紧急求助通知给辅导员');
            } catch (error) {
              console.error('发送紧急求助通知失败:', error);
            }
          }}
          onClose={() => setActiveOverlay('none')}
        />
      )}

      {/* 叠加层 - 智能文件播放器 */}
      {activeOverlay === 'media' && (
        <MediaPlayer
          familyId={familyId}
          elderlyId={elderlyId}
          onClose={handleMediaPlayerClose}
          onOpenWhiteboard={() => {
            setWhiteboardReturnTo('media');
            setActiveOverlay('whiteboard');
          }}
          logMessage={logMessage}
          orientationMode={orientationMode}
          onToggleOrientation={handleToggleOrientation}
        />
      )}

      {activeOverlay === 'whiteboard' && (
        <Whiteboard
          familyId={familyId}
          orientationMode={orientationMode}
          onToggleOrientation={handleToggleOrientation}
          onClose={() => {
            if (whiteboardReturnTo === 'media') {
              setActiveOverlay('media');
            } else {
              setActiveOverlay('none');
            }
            setWhiteboardReturnTo('none');
          }}
        />
      )}
      {/* 叠加层 - 课表列表 */}
      {activeOverlay === 'schedule' && (
        <ScheduleList
          schedules={todaySchedules}
          onClose={() => setActiveOverlay('none')}
        />
      )}

      {/* Toast 消息提示 */}
      {toastMessage && (
        <ToastMessage
          type={toastMessage.type}
          message={toastMessage.message}
          onClose={() => setToastMessage(null)}
        />
      )}

      {/* 确认对话框 */}
      {confirmDialog && (
        <ConfirmDialog
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {/* 管理端二维码弹窗 */}
      {showQRCode && (
        <QRCodeModal onClose={() => setShowQRCode(false)} />
      )}

      {/* 透明窗口文件展示 */}
      {mediaOverlay && (
        <TransparentMediaOverlay
          mediaFilename={mediaOverlay.filename}
          mediaType={mediaOverlay.type}
          avatarText={mediaOverlay.text}
          duration={mediaOverlay.duration}
          onClose={() => setMediaOverlay(null)}
        />
      )}

      {/* 课表提醒 Toast */}
      {reminderSchedule && (
        <ScheduleReminderToast
          schedule={reminderSchedule}
          onClose={() => {
            // 关闭提醒
            setReminderSchedule(null);
          }}
        />
      )}

      {/* 数字人说话字幕 */}
      {subtitle && (
        <div className="absolute bottom-24 left-0 right-0 z-30 flex justify-center">
          <div className="bg-black/70 text-white px-6 py-4 rounded-xl max-w-3/4 text-center text-xl font-medium">
            {subtitle}
          </div>
        </div>
      )}

        {/* 系统资源监控条 - 文件播放界面时用白色字体 */}
        {systemStats && (
          <div className={`absolute bottom-0 left-0 right-0 bg-transparent text-[10px] font-mono py-1 px-4 flex justify-between items-center z-[60] pointer-events-none ${
            activeOverlay === 'media' ? 'text-white' : 'text-black'
          }`}>
            <div className="flex gap-4">
              <span className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${systemStats.cpu > 80 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></span>
                CPU: <span className={systemStats.cpu > 80 ? (activeOverlay === 'media' ? 'text-red-400 font-bold' : 'text-red-600 font-bold') : ''}>{systemStats.cpu.toFixed(1)}%</span>
              </span>
              <span className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${systemStats.memory > 80 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></span>
                MEM: <span className={systemStats.memory > 80 ? (activeOverlay === 'media' ? 'text-red-400 font-bold' : 'text-red-600 font-bold') : ''}>{systemStats.memory.toFixed(1)}%</span>
              </span>
              <span className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${(systemStats.gpu ?? 0) > 80 ? 'bg-red-500 animate-pulse' : 'bg-blue-500'}`}></span>
                GPU: <span className={(systemStats.gpu ?? 0) > 80 ? (activeOverlay === 'media' ? 'text-red-400 font-bold' : 'text-red-600 font-bold') : ''}>{systemStats.gpu !== undefined ? `${systemStats.gpu.toFixed(1)}%` : 'N/A'}</span>
              </span>
            </div>
            <div className="opacity-60 text-[9px]">Resource Monitor</div>
          </div>
        )}
      </div>
    </div>
  </div>
  );
};