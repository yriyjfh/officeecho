import React, { useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

/**
 * Toast 提示组件
 * 用于显示操作结果的轻量级提示
 */
export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  duration = 3000,
  onClose,
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="text-green-500" size={24} />;
      case 'error':
        return <XCircle className="text-red-500" size={24} />;
      case 'warning':
        return <AlertCircle className="text-orange-500" size={24} />;
      default:
        return <AlertCircle className="text-blue-500" size={24} />;
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-orange-50 border-orange-200';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-[9999] animate-in slide-in-from-top">
      <div
        className={`
          flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border
          ${getBackgroundColor()}
          max-w-md
        `}
      >
        {getIcon()}
        <p className="flex-1 text-sm font-medium text-gray-900">{message}</p>
        <button
          onClick={onClose}
          className="p-1 hover:bg-black/5 rounded transition-colors"
          aria-label="关闭"
        >
          <X size={18} className="text-gray-500" />
        </button>
      </div>
    </div>
  );
};
