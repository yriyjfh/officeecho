import React, { useState, useEffect } from 'react';
import { Clock, X } from 'lucide-react';

interface ScheduleReminderProps {
  title: string;
  description?: string;
  time: string;
  onClose: () => void;
}

/**
 * 课表提醒卡组件
 * 简化版 - 只显示提醒内容，5分钟后自动关闭
 */
export const MedicationCard: React.FC<ScheduleReminderProps> = ({
  title,
  description,
  time,
  onClose,
}) => {
  const [remainingSeconds, setRemainingSeconds] = useState(5 * 60); // 5分钟

  // 倒计时：5分钟后自动关闭
  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          console.log('提醒弹窗已显示5分钟，自动关闭');
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onClose]);

  // 格式化剩余时间 (MM:SS)
  const formatRemainingTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in p-6">
      <div className="card-elderly max-w-2xl w-full space-y-6 relative">
        {/* 右上角关闭按钮和倒计时 */}
        <div className="absolute top-4 right-4 flex items-center gap-3">
          <span className="text-sm text-gray-500">{formatRemainingTime(remainingSeconds)}</span>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors"
            aria-label="关闭"
          >
            <X size={24} className="text-gray-600" />
          </button>
        </div>

        {/* 标题 */}
        <div className="flex items-center justify-between">
          <h2 className="text-elderly-xl font-bold text-gray-900">
            日常计划
          </h2>
        </div>

        {/* 提醒信息 */}
        <div className="bg-primary-50 rounded-xl p-6 space-y-3">
          <p className="text-elderly-lg font-bold text-gray-900">
            {title}
          </p>
          {description && (
            <p className="text-elderly-base text-gray-700">
              {description}
            </p>
          )}
          <div className="flex items-center gap-2 text-elderly-base text-gray-600">
            <Clock size={20} />
            <span>时间：{time}</span>
          </div>
        </div>

        {/* 倒计时提示 */}
        <div className="flex items-center justify-center gap-3 bg-yellow-50 rounded-xl p-4">
          <Clock size={28} className="text-yellow-600" />
          <p className="text-elderly-base text-gray-700">
            此提醒将在 <span className="font-bold text-yellow-700">{formatRemainingTime(remainingSeconds)}</span> 后自动关闭
          </p>
        </div>
      </div>
    </div>
  );
};
