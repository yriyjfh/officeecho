import React from 'react';
import { CheckCircle, AlertCircle, Phone } from 'lucide-react';

interface ToastMessageProps {
  type: 'success' | 'info' | 'calling';
  message: string;
  onClose: () => void;
}

/**
 * 学生友好的提示消息组件
 * 替代浏览器的 alert
 */
export const ToastMessage: React.FC<ToastMessageProps> = ({ type, message, onClose }) => {
  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle size={64} className="text-green-500" />;
      case 'calling':
        return <Phone size={64} className="text-blue-500 animate-pulse" />;
      default:
        return <AlertCircle size={64} className="text-blue-500" />;
    }
  };

  const getColor = () => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-300';
      case 'calling':
        return 'bg-blue-50 border-blue-300';
      default:
        return 'bg-blue-50 border-blue-300';
    }
  };

  // 不自动关闭，由调用方控制关闭时间
  // React.useEffect(() => {
  //   const timer = setTimeout(() => {
  //     onClose();
  //   }, 3000);
  //   return () => clearTimeout(timer);
  // }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className={`${getColor()} rounded-3xl shadow-2xl p-8 max-w-md w-full border-4 animate-in fade-in zoom-in duration-300`}>
        <div className="flex flex-col items-center gap-6">
          {getIcon()}
          <p className="text-elderly-xl text-gray-900 text-center font-bold leading-relaxed">
            {message}
          </p>
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
