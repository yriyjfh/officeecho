import React from 'react';
import { Mic, Users, Heart, Image } from 'lucide-react';

interface MacroButtonsProps {
  onMicClick?: () => void;
  onFamilyClick?: () => void;
  onEmergencyClick?: () => void;
  onPhotosClick?: () => void;
}

/**
 * 四宫格大按钮组件
 * 9:16 竖屏优化 - 2x2 网格布局
 * 满足无障碍触达要求 (≥ 48dp)
 */
export const MacroButtons: React.FC<MacroButtonsProps> = ({
  onMicClick,
  onFamilyClick,
  onEmergencyClick,
  onPhotosClick,
}) => {
  const buttons = [
    {
      icon: Mic,
      label: '说话',
      onClick: onMicClick,
      color: 'bg-blue-500 hover:bg-blue-600',
      ariaLabel: '点击开始说话',
    },
    {
      icon: Users,
      label: '辅导员',
      onClick: onFamilyClick,
      color: 'bg-green-500 hover:bg-green-600',
      ariaLabel: '联系辅导员',
    },
    {
      icon: Heart,
      label: '我不舒服',
      onClick: onEmergencyClick,
      color: 'bg-red-500 hover:bg-red-600',
      ariaLabel: '我不舒服，需要帮助',
    },
    {
      icon: Image,
      label: '看看照片',
      onClick: onPhotosClick,
      color: 'bg-purple-500 hover:bg-purple-600',
      ariaLabel: '查看照片和视频',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 p-4 bg-gradient-to-t from-black/70 to-transparent">
      {buttons.map((button, index) => (
        <button
          key={index}
          onClick={button.onClick}
          aria-label={button.ariaLabel}
          className={`
            ${button.color}
            text-white
            flex flex-col items-center justify-center
            gap-2
            py-5 px-3
            rounded-2xl
            shadow-2xl
            active:scale-95
            transition-transform duration-150
            min-h-[90px]
            bg-opacity-100
          `}
        >
          <button.icon size={40} strokeWidth={2.5} />
          <span className="text-base font-bold leading-tight text-center drop-shadow-md">
            {button.label}
          </span>
        </button>
      ))}
    </div>
  );
};
