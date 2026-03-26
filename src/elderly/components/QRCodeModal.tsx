import React, { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Edit3, Smartphone, X } from 'lucide-react';
import {
  buildAdminEntryUrl,
  getInitialLanIp,
  hydratePersistedLanIp,
  isValidLanIp,
  savePersistedLanIp,
} from '../utils/lanAccess';

interface QRCodeModalProps {
  onClose: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ onClose }) => {
  const [lanIp, setLanIp] = useState(getInitialLanIp);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    let cancelled = false;

    void hydratePersistedLanIp().then((savedLanIp) => {
      if (!cancelled) {
        setLanIp(savedLanIp || getInitialLanIp());
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const qrCodeUrl = useMemo(() => {
    return buildAdminEntryUrl(lanIp);
  }, [lanIp]);

  const handleEdit = () => {
    setEditValue(lanIp || getInitialLanIp());
    setIsEditing(true);
  };

  const handleSave = async () => {
    const savedLanIp = await savePersistedLanIp(editValue);
    if (!savedLanIp) {
      return;
    }

    setLanIp(savedLanIp);
    setEditValue(savedLanIp);
    setIsEditing(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="relative mx-4 w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 transition-colors hover:bg-gray-200"
          aria-label="关闭"
        >
          <X size={24} className="text-gray-600" />
        </button>

        <div className="mb-6 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <Smartphone size={32} className="text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">扫码打开管理端</h2>
          <p className="mt-2 text-gray-500">使用手机扫码访问管理控制台</p>
        </div>

        <div className="mb-6 flex justify-center">
          <div className="rounded-2xl border-4 border-blue-100 bg-white p-4 shadow-inner">
            <QRCodeSVG
              value={qrCodeUrl}
              size={200}
              level="M"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#1e40af"
            />
          </div>
        </div>

        <div className="text-center">
          <p className="mb-2 text-sm text-gray-400">访问地址</p>

          {isEditing ? (
            <div className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2">
              <span className="font-mono text-sm text-gray-600">http://</span>
              <input
                type="text"
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                placeholder="192.168.1.x"
                className="flex-1 rounded border border-blue-300 bg-white px-2 py-1 text-center font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    handleSave();
                  }
                }}
              />
              <span className="font-mono text-sm text-gray-600">:3001</span>
              <button
                onClick={handleSave}
                disabled={!isValidLanIp(editValue.trim())}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white transition-colors hover:bg-green-600 disabled:bg-gray-300"
                aria-label="保存局域网 IP"
              >
                <Check size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <div className="break-all rounded-lg bg-gray-100 px-4 py-2 font-mono text-sm text-gray-600">
                {qrCodeUrl}
              </div>
              <button
                onClick={handleEdit}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-gray-600 transition-colors hover:bg-gray-300"
                title="编辑局域网 IP"
                aria-label="编辑局域网 IP"
              >
                <Edit3 size={14} />
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 text-center text-xs text-gray-500">
          请确保手机与当前设备处于同一局域网。
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-blue-600 py-3 font-medium text-white transition-colors hover:bg-blue-700"
        >
          关闭
        </button>
      </div>
    </div>
  );
};
