import React from 'react';
import { Phone, AlertCircle } from 'lucide-react';

interface EmergencySheetProps {
  onContactFamily?: () => void;
  onClose?: () => void;
}

/**
 * 紧急联络组件
 * 用于紧急呼叫辅导员
 */
export const EmergencySheet: React.FC<EmergencySheetProps> = ({
  onContactFamily,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 bg-red-900 bg-opacity-95 flex items-center justify-center z-50 animate-fade-in p-6">
      <div className="max-w-2xl w-full space-y-8">
        {/* 标题 */}
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <AlertCircle size={80} className="text-white animate-pulse" />
          </div>
          <h2 className="text-elderly-2xl font-bold text-white">
            需要帮助吗？
          </h2>
          <p className="text-elderly-lg text-red-100">
            别担心，我在这里陪着您
          </p>
        </div>

        {/* 主要操作按钮 */}
        <div className="space-y-6">
          <button
            onClick={onContactFamily}
            className="w-full btn-elderly bg-white hover:bg-gray-100 text-red-600 flex items-center justify-center gap-4 py-8"
          >
            <Phone size={48} />
            <span className="text-elderly-xl">紧急联系辅导员</span>
          </button>
        </div>

        {/* 取消按钮 */}
        {onClose && (
          <button
            onClick={onClose}
            className="w-full btn-elderly bg-gray-700 bg-opacity-50 hover:bg-opacity-70 text-white"
          >
            我没事，返回
          </button>
        )}

        {/* 安抚文案 */}
        <div className="text-center">
          <p className="text-elderly-base text-red-100 leading-relaxed-plus">
            如果您需要帮助，请不要犹豫
            <br />
            辅导员会尽快为您提供帮助
          </p>
        </div>
      </div>
    </div>
  );
};
