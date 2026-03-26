import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface EmergencyAlertProps {
  message: string;
  timestamp: string;
  onHandle: () => void;
}

/**
 * 紧急通知弹窗组件
 * 用于显示屏幕端发送的紧急求助通知
 */
export const EmergencyAlert: React.FC<EmergencyAlertProps> = ({
  message,
  timestamp,
  onHandle,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* 背景遮罩 */}
      <div className="absolute inset-0 bg-black bg-opacity-50" />

      {/* 弹窗内容 */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full animate-scale-in">
        {/* 紧急图标 */}
        <div className="flex justify-center pt-8 pb-4">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center animate-pulse">
            <AlertTriangle size={48} className="text-red-600" />
          </div>
        </div>

        {/* 标题 */}
        <div className="text-center px-6 pb-4">
          <h2 className="text-2xl font-bold text-red-600 mb-2">🚨 紧急求助</h2>
          <p className="text-gray-600 text-sm">{timestamp}</p>
        </div>

        {/* 消息内容 */}
        <div className="px-6 pb-6">
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
            <p className="text-red-800 font-medium text-center">
              {message}
            </p>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="px-6 pb-6">
          <button
            onClick={onHandle}
            className="w-full py-4 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors font-bold text-lg shadow-lg"
          >
            马上处理
          </button>
        </div>
      </div>
    </div>
  );
};
