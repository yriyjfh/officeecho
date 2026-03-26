import React, { useEffect, useState } from 'react';
import { Clock, X } from 'lucide-react';
import * as scheduleService from '../services/scheduleService';

interface ScheduleReminderProps {
  schedule: scheduleService.Schedule;
  onClose: () => void; // 关闭提醒
}

/**
 * 课表提醒弹窗组件
 * 当课表到达执行时间时弹出的大字体提醒
 * 5分钟后自动关闭
 */
export const ScheduleReminder: React.FC<ScheduleReminderProps> = ({
  schedule,
  onClose,
}) => {
  const [remainingSeconds, setRemainingSeconds] = useState(5 * 60); // 5分钟
  const typeIcon = scheduleService.getScheduleTypeIcon(schedule.schedule_type || 'other');
  const typeLabel = scheduleService.getScheduleTypeLabel(schedule.schedule_type || 'other');
  const time = scheduleService.formatTime(schedule.schedule_time);

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
    <div className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-6 animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full animate-in zoom-in-95 relative">
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

        {/* 头部 - 大图标 */}
        <div className="text-center pt-8 pb-6">
          <div className="text-8xl mb-4 animate-bounce">{typeIcon}</div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Clock size={32} className="text-primary-600" />
            <span className="text-elderly-2xl font-bold text-primary-600">
              {time}
            </span>
          </div>
          <p className="text-elderly-base text-gray-600">{typeLabel}</p>
        </div>

        {/* 主要内容 */}
        <div className="px-8 pb-8">
          <h1 className="text-elderly-3xl font-bold text-center text-gray-900 mb-4">
            {schedule.title}
          </h1>

          {schedule.description && (
            <p className="text-elderly-xl text-center text-gray-700 leading-relaxed">
              {schedule.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
