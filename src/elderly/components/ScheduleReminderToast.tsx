import React, { useEffect, useState } from 'react';
import { Clock, X } from 'lucide-react';
import * as scheduleService from '../services/scheduleService';

interface ScheduleReminderToastProps {
  schedule: scheduleService.Schedule;
  onClose: () => void; // 关闭提醒
}

/**
 * 课表提醒 Toast 组件
 * 以半透明悬浮卡片形式显示在屏幕中央
 * 5分钟后自动关闭
 */
export const ScheduleReminderToast: React.FC<ScheduleReminderToastProps> = ({
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
          console.log('提醒已显示5分钟，自动关闭');
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none animate-fadeIn">
      {/* 文件内容容器 - 数字人中部，下调10% */}
      <div className="relative w-full h-full flex flex-col items-center justify-center p-4 pt-[calc(1rem+10vh)] pointer-events-auto">
        <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full pointer-events-auto border-2 border-primary-300">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <div className="text-5xl">{typeIcon}</div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Clock size={24} className="text-primary-600" />
                <span className="text-2xl font-bold text-primary-600">{time}</span>
              </div>
              <p className="text-lg text-gray-600">{typeLabel}</p>
            </div>
          </div>

          {/* 右上角：倒计时 + 关闭按钮 */}
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500">
              {formatRemainingTime(remainingSeconds)}
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors"
              aria-label="关闭"
            >
              <X size={24} className="text-gray-600" />
            </button>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="px-6 py-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">
            {schedule.title}
          </h2>

          {schedule.description && (
            <p className="text-xl text-gray-700 leading-relaxed">
              {schedule.description}
            </p>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};
