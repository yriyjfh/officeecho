import React from 'react';
import { X, Clock } from 'lucide-react';
import * as scheduleService from '../services/scheduleService';

interface ScheduleItem {
  time: string;
  title: string;
  type: 'meeting' | 'off_work' | 'reception' | 'break' | 'other'|'math'|'politics'|'history'|'physics'|'chemistry'|'art'|'sports';
}

interface ScheduleListProps {
  schedules?: scheduleService.Schedule[];
  onClose: () => void;
}

/**
 * 课表列表组件
 * 显示今日所有待办事项
 */
export const ScheduleList: React.FC<ScheduleListProps> = ({ schedules: propSchedules, onClose }) => {
  // 使用传入的课表数据，或使用模拟数据
  const mockSchedules: ScheduleItem[] = [
  { time: '09:00', title: '晨会', type: 'meeting' },
  { time: '10:30', title: '客户评奖评优', type: 'reception' },
  { time: '12:00', title: '午休', type: 'break' },
  { time: '14:00', title: '项目评审', type: 'meeting' },
  { time: '18:00', title: '查寝', type: 'off_work' },

  // 👇 你要的课程全部加进来了
  { time: '08:00', title: '高等数学', type: 'math' },
  { time: '10:00', title: '思想政治', type: 'politics' },
  { time: '13:00', title: '中国近代史', type: 'history' },
  { time: '15:00', title: '大学物理', type: 'physics' },
  { time: '16:30', title: '有机化学', type: 'chemistry' },
  { time: '19:00', title: '美术鉴赏', type: 'art' },
  { time: '20:00', title: '体能训练', type: 'sports' },
];

  // 将 API 数据转换为组件使用的格式
  const schedules: ScheduleItem[] = propSchedules
    ? scheduleService.sortSchedulesByTime(propSchedules).map((schedule) => ({
        time: scheduleService.formatTime(schedule.schedule_time),
        title: schedule.title + (schedule.description ? ` - ${schedule.description}` : ''),
        type: (schedule.schedule_type || 'other') as any,
      }))
    : mockSchedules;

  const getTypeColor = (type: string) => {
    switch (type) {
        case 'meeting':
          return 'bg-blue-100 text-blue-700 border-blue-300';
        case 'reception':
          return 'bg-orange-100 text-orange-700 border-orange-300';
        case 'off_work':
          return 'bg-green-100 text-green-700 border-green-300';
        case 'break':
          return 'bg-cyan-100 text-cyan-700 border-cyan-300';
        case 'math':
          return 'bg-purple-100 text-purple-700 border-purple-300';
        case 'politics':
          return 'bg-red-100 text-red-700 border-red-300';
        case 'history':
          return 'bg-yellow-100 text-yellow-700 border-yellow-300';
        case 'physics':
          return 'bg-indigo-100 text-indigo-700 border-indigo-300';
        case 'chemistry':
          return 'bg-teal-100 text-teal-700 border-teal-300';
        case 'art':
          return 'bg-pink-100 text-pink-700 border-pink-300';
        case 'sports':
          return 'bg-lime-100 text-lime-700 border-lime-300';

        default:
          return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'meeting':
        return '👥';
      case 'reception':
        return '👋';
      case 'off_work':
        return '🏠';
      case 'break':
        return '☕';

      // 👇 你要的所有课程图标
      case 'math':
        return '🔢';      // 数学
      case 'politics':
        return '📜';      // 政治
      case 'history':
        return '⏳';      // 历史
      case 'physics':
        return '⚛️';      // 物理
      case 'chemistry':
        return '🧪';      // 化学
      case 'art':
        return '🎨';      // 美术
      case 'sports':
        return '🏃';      // 体育
      default:
        return '📌';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Clock size={32} className="text-primary-500" />
            <h2 className="text-elderly-xl font-bold text-gray-900">今日计划</h2>
          </div>
          <button
            onClick={onClose}
            className="w-12 h-12 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
            aria-label="关闭"
          >
            <X size={28} />
          </button>
        </div>

        {/* 课表列表 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {schedules.map((item, index) => (
              <div
                key={index}
                className={`
                  flex items-center gap-4 p-4 rounded-2xl border-2
                  ${getTypeColor(item.type)}
                  transition-all hover:scale-[1.02]
                `}
              >
                <div className="text-4xl">{getTypeIcon(item.type)}</div>
                <div className="flex-1">
                  <div className="text-elderly-lg font-bold">{item.time}</div>
                  <div className="text-elderly-base mt-1">{item.title}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="btn-elderly bg-primary-500 hover:bg-primary-600 w-full"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
};
