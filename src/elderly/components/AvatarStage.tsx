import React, { useState } from 'react';
import { XmovAvatar } from './XmovAvatar';

interface AvatarStageProps {
  isActive?: boolean;
  onSDKStatusChange?: (status: 'loading' | 'ready' | 'error' | 'config-missing') => void;
  onWSStatusChange?: (status: 'disconnected' | 'connecting' | 'connected') => void;
  onLogMessage?: (message: string) => void;
  onIdleStateChange?: (isIdle: boolean) => void;
  onTextReceived?: () => void; // 收到text消息时的回调（用于关闭文件播放器）
  onSpeakingChange?: (isSpeaking: boolean) => void; // 数字人说话状态变化回调（用于控制麦克风）
  onSubtitleChange?: (subtitle: string) => void; // 字幕变化回调
  idleTimeout?: number;
  resetIdleTrigger?: number;
  isMediaPlaying?: boolean; // 是否正在播放文件（透明窗口），用于切换SDK离线/在线模式
  isVisible?: boolean; // 组件是否可见
}

/**
 * 数字人画面组件 - 承载 xmovsdk 渲染流
 * 占据主要屏幕空间，支持 9:16 竖屏
 * 通过服务端 Socket.IO 接收 Fay 消息驱动数字人说话
 */
export const AvatarStage: React.FC<AvatarStageProps> = ({
  isActive = false,
  onSDKStatusChange,
  onWSStatusChange,
  onLogMessage,
  onIdleStateChange,
  onTextReceived,
  onSpeakingChange,
  onSubtitleChange,
  idleTimeout,
  resetIdleTrigger,
  isMediaPlaying = false,
  isVisible = true,
}) => {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleSDKReady = () => {
    console.log('[AvatarStage] 数字人SDK就绪');
  };

  const handleSDKError = (error: any) => {
    console.error('[AvatarStage] 数字人SDK错误:', error);
  };

  const handleSpeaking = (speaking: boolean) => {
    setIsSpeaking(speaking);
    // 通知父组件说话状态变化（用于控制麦克风）
    onSpeakingChange?.(speaking);
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      <XmovAvatar
        isActive={isActive || isSpeaking}
        onSDKReady={handleSDKReady}
        onSDKError={handleSDKError}
        onSpeaking={handleSpeaking}
        onSDKStatusChange={onSDKStatusChange}
        onWSStatusChange={onWSStatusChange}
        onLogMessage={onLogMessage}
        onIdleStateChange={onIdleStateChange}
        onTextReceived={onTextReceived}
        onSubtitleChange={onSubtitleChange}
        idleTimeout={idleTimeout}
        resetIdleTrigger={resetIdleTrigger}
        isMediaPlaying={isMediaPlaying}
        isVisible={isVisible}
      />
    </div>
  );
};