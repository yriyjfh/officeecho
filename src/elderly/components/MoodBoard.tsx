import React, { useState } from 'react';
import { Smile, Meh, Frown, Zap, Angry, Battery } from 'lucide-react';
import * as moodService from '../services/moodService';

interface MoodBoardProps {
  familyId?: string;
  elderlyId?: number;
  onMoodSelect?: (mood: moodService.MoodType) => void;
  onClose?: () => void;
}

/**
 * 心情选择组件 - 六宫格设计
 * 用于情绪记录和触发回忆疗法
 */
export const MoodBoard: React.FC<MoodBoardProps> = ({
  familyId = 'family_001',
  elderlyId,
  onMoodSelect,
  onClose
}) => {
  const [isSaving, setIsSaving] = useState(false);

  const moods: Array<{
    id: moodService.MoodType;
    icon: typeof Smile;
    label: string;
    color: string;
    emoji: string;
  }> = [
    {
      id: 'happy',
      icon: Smile,
      label: '开心',
      color: 'bg-green-400 hover:bg-green-500',
      emoji: '😊',
    },
    {
      id: 'calm',
      icon: Meh,
      label: '平静',
      color: 'bg-blue-400 hover:bg-blue-500',
      emoji: '😌',
    },
    {
      id: 'sad',
      icon: Frown,
      label: '有点难过',
      color: 'bg-yellow-400 hover:bg-yellow-500',
      emoji: '😔',
    },
    {
      id: 'anxious',
      icon: Zap,
      label: '焦虑',
      color: 'bg-orange-400 hover:bg-orange-500',
      emoji: '😰',
    },
    {
      id: 'angry',
      icon: Angry,
      label: '生气',
      color: 'bg-red-400 hover:bg-red-500',
      emoji: '😠',
    },
    {
      id: 'tired',
      icon: Battery,
      label: '疲惫',
      color: 'bg-violet-400 hover:bg-violet-500',
      emoji: '😫',
    },
  ];

  const handleMoodSelect = async (moodId: moodService.MoodType) => {
    setIsSaving(true);
    try {
      // 保存情绪记录到数据库
      await moodService.createMoodRecord(familyId, moodId, {
        elderlyId,
        source: 'manual',
      });
      console.log('情绪记录已保存:', moodId);

      // 调用回调
      onMoodSelect?.(moodId);
      onClose?.();
    } catch (error) {
      console.error('保存情绪记录失败:', error);
      // 即使保存失败，也调用回调
      onMoodSelect?.(moodId);
      onClose?.();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in p-6">
      <div className="card-elderly max-w-4xl w-full space-y-8">
        <h2 className="text-elderly-xl font-bold text-gray-900 text-center">
          您现在感觉怎么样？
        </h2>

        {/* 六宫格心情选择 */}
        <div className="grid grid-cols-2 gap-4">
          {moods.map((mood) => (
            <button
              key={mood.id}
              onClick={() => handleMoodSelect(mood.id)}
              disabled={isSaving}
              className={`
                ${mood.color}
                text-white
                rounded-3xl
                p-6
                flex flex-col items-center justify-center
                gap-3
                min-h-[150px]
                transition-all
                active:scale-95
                shadow-lg
                hover:shadow-xl
                ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <span className="text-5xl">{mood.emoji}</span>
              <span className="text-elderly-base font-bold">{mood.label}</span>
            </button>
          ))}
        </div>

        {/* 关闭按钮 */}
        {onClose && (
          <button
            onClick={onClose}
            disabled={isSaving}
            className="w-full btn-elderly bg-gray-300 hover:bg-gray-400 text-gray-800"
          >
            暂时不说
          </button>
        )}
      </div>
    </div>
  );
};
