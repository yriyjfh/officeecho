import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 确认对话框组件
 * 用于需要用户确认的操作
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  title = '确认操作',
  message,
  confirmText = '确定',
  cancelText = '取消',
  type = 'warning',
  onConfirm,
  onCancel,
}) => {
  const getColors = () => {
    switch (type) {
      case 'danger':
        return {
          icon: 'text-red-500',
          button: 'bg-red-600 hover:bg-red-700',
        };
      case 'warning':
        return {
          icon: 'text-orange-500',
          button: 'bg-orange-600 hover:bg-orange-700',
        };
      default:
        return {
          icon: 'text-blue-500',
          button: 'bg-blue-600 hover:bg-blue-700',
        };
    }
  };

  const colors = getColors();

  return (
    <div className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full animate-in zoom-in-95">
        {/* 头部 */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className={colors.icon} size={24} />
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="关闭"
          >
            <X size={20} />
          </button>
        </div>

        {/* 内容 */}
        <div className="px-6 py-4">
          <p className="text-gray-700">{message}</p>
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onCancel(); // 确认后也关闭对话框
            }}
            className={`flex-1 py-2.5 px-4 text-white rounded-lg transition-colors font-medium ${colors.button}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
