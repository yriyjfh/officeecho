import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 学生友好的确认对话框
 * 替代浏览器的 confirm
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ message, onConfirm, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-yellow-50 border-4 border-yellow-300 rounded-3xl shadow-2xl p-8 max-w-md w-full animate-in fade-in zoom-in duration-300">
        <div className="flex flex-col items-center gap-6">
          <AlertTriangle size={64} className="text-yellow-600" />
          <p className="text-elderly-xl text-gray-900 text-center font-bold leading-relaxed">
            {message}
          </p>
          <div className="flex gap-4 w-full">
            <button
              onClick={onCancel}
              className="btn-elderly bg-gray-400 hover:bg-gray-500 flex-1"
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              className="btn-elderly bg-yellow-500 hover:bg-yellow-600 flex-1"
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
