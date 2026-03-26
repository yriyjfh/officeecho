import React, { useEffect, useState } from 'react';

interface LogNotificationProps {
  message: string | null;
  onHide?: () => void;
}

/**
 * Log通知组件
 * 从麦克风按钮向右延伸显示WebSocket log信息
 * 5秒后自动消失
 */
export const LogNotification: React.FC<LogNotificationProps> = ({ message, onHide }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setIsVisible(true);

      // 5秒后自动隐藏
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => {
          onHide?.();
        }, 300); // 等待淡出动画完成
      }, 5000);

      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [message, onHide]);

  if (!message) return null;

  return (
    <div
      className={`
        absolute left-20 w-64 px-4 py-3
        bg-black/70
        border border-white/20 rounded-r-2xl
        text-white text-base
        transition-all duration-300
        ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}
      `}
      style={{
        top: '50%',
        transform: isVisible ? 'translateY(-50%)' : 'translate(-1rem, -50%)',
      }}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">{message}</span>
      </div>
    </div>
  );
};
