import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Video,
  VideoOff,
  Maximize2,
  Minimize2,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react';
import * as videoService from '../services/videoService';

interface VideoPlayerProps {
  familyId: string;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  familyId,
  onFullscreenChange,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState<videoService.VideoStatus | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 获取视频流URL
  const streamUrl = videoService.getVideoStreamUrl(familyId);

  // 加载摄像头状态
  const loadStatus = useCallback(async () => {
    try {
      const statusData = await videoService.getVideoStatus();
      setStatus(statusData);
      return statusData;
    } catch (err) {
      console.error('获取状态失败:', err);
      return null;
    }
  }, []);

  // 重新加载视频流
  const reloadStream = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setRetryCount(0);
    // 重新设置 img src 触发重新加载
    if (imgRef.current) {
      imgRef.current.src = `${streamUrl}&_t=${Date.now()}`;
    }
  }, [streamUrl]);

  // 处理图片加载成功
  const handleLoad = useCallback(() => {
    setIsConnected(true);
    setIsLoading(false);
    setError(null);
    setRetryCount(0);
  }, []);

  // 处理图片加载错误
  const handleError = useCallback(() => {
    setIsConnected(false);
    setIsLoading(false);

    if (retryCount < 3) {
      setError('连接中断，正在重连...');
      setTimeout(() => {
        setRetryCount((prev) => prev + 1);
        // 触发重新加载
        if (imgRef.current) {
          imgRef.current.src = `${streamUrl}&_t=${Date.now()}`;
        }
      }, 2000);
    } else {
      setError('视频流连接失败，请检查摄像头');
    }
  }, [streamUrl, retryCount]);

  // 手动重连
  const handleReconnect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setRetryCount(0);

    try {
      // 先启动摄像头
      await videoService.startCamera();
      // 重新加载流
      if (imgRef.current) {
        imgRef.current.src = `${streamUrl}&_t=${Date.now()}`;
      }
    } catch (err) {
      setError('重连失败');
      setIsLoading(false);
    }
  }, [streamUrl]);

  // 全屏切换
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
        onFullscreenChange?.(true);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
        onFullscreenChange?.(false);
      });
    }
  }, [onFullscreenChange]);

  // 监听全屏变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFS = !!document.fullscreenElement;
      setIsFullscreen(isFS);
      onFullscreenChange?.(isFS);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [onFullscreenChange]);

  // 初始化
  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, [loadStatus]);

  // 组件卸载时断开视频流连接
  useEffect(() => {
    return () => {
      // 清除 img src 来断开 MJPEG 流连接
      if (imgRef.current) {
        console.log('[VideoPlayer] 组件卸载，断开视频流连接');
        imgRef.current.src = '';
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative bg-gray-900 ${isFullscreen ? 'fixed inset-0 z-50' : 'aspect-video'}`}
    >
      {/* MJPEG 视频流 */}
      <img
        ref={imgRef}
        src={`${streamUrl}&_t=${Date.now()}`}
        alt="实时视频"
        className={`w-full h-full object-contain ${isLoading || error ? 'hidden' : ''}`}
        onLoad={handleLoad}
        onError={handleError}
      />

      {/* 加载状态 */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <RefreshCw size={32} className="text-gray-500 animate-spin mx-auto mb-2" />
            <p className="text-gray-400 text-sm">正在连接摄像头...</p>
          </div>
        </div>
      )}

      {/* 错误状态 */}
      {error && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <VideoOff size={48} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm mb-3">{error}</p>
            <button
              onClick={handleReconnect}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm"
            >
              重新连接
            </button>
          </div>
        </div>
      )}

      {/* 占位图标 (未连接时) */}
      {!isConnected && !isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Video size={48} className="text-gray-600" />
        </div>
      )}

      {/* 实时状态标签 */}
      {isConnected && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 text-white px-2.5 py-1 rounded-full text-xs font-medium">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
          实时
        </div>
      )}

      {/* 客户端数量 */}
      {status && status.client_count > 0 && (
        <div className="absolute top-3 left-20 bg-black/50 text-white px-2 py-1 rounded text-xs">
          {status.client_count} 人在看
        </div>
      )}

      {/* 控制按钮 */}
      <div className="absolute top-3 right-3 flex gap-2">
        <button
          onClick={() => setShowSettings(true)}
          className="bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg transition-colors"
          title="设置"
        >
          <Settings size={18} />
        </button>
        <button
          onClick={toggleFullscreen}
          className="bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg transition-colors"
          title={isFullscreen ? '退出全屏' : '全屏'}
        >
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      {/* 底部信息栏 */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-3">
        <div className="text-white">
          <div className="text-xs opacity-90 mb-0.5">实时监控</div>
          <div className="text-sm font-medium">
            {isConnected ? '学生正在与数字人对话' : '等待连接...'}
          </div>
        </div>
      </div>

      {/* 设置面板 */}
      {showSettings && (
        <VideoSettingsPanel
          status={status}
          onClose={() => setShowSettings(false)}
          onConfigChange={() => {
            loadStatus();
            // 延迟重新加载视频流，等待后端重启摄像头
            setTimeout(reloadStream, 1000);
          }}
        />
      )}
    </div>
  );
};

// 设置面板组件
interface VideoSettingsPanelProps {
  status: videoService.VideoStatus | null;
  onClose: () => void;
  onConfigChange: () => void;
}

const VideoSettingsPanel: React.FC<VideoSettingsPanelProps> = ({
  status,
  onClose,
  onConfigChange,
}) => {
  const [config, setConfig] = useState({
    frame_rate: 12,
    jpeg_quality: 70,
    device_index: 0,
  });
  const [saving, setSaving] = useState(false);
  const [devices, setDevices] = useState<videoService.VideoDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);

  useEffect(() => {
    // 加载配置
    videoService.getVideoConfig().then((cfg) => {
      setConfig({
        frame_rate: cfg.frame_rate,
        jpeg_quality: cfg.jpeg_quality,
        device_index: cfg.device_index,
      });
    });

    // 加载可用设备列表
    videoService.getVideoDevices()
      .then((result) => {
        setDevices(result.devices);
      })
      .catch((err) => {
        console.error('获取设备列表失败:', err);
      })
      .finally(() => {
        setLoadingDevices(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await videoService.updateVideoConfig(config);
      onConfigChange();
      onClose();
    } catch (err) {
      console.error('保存配置失败:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-5 w-80 max-w-[90%] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">视频设置</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              摄像头设备
            </label>
            {loadingDevices ? (
              <div className="text-sm text-gray-500 py-2">正在检测摄像头...</div>
            ) : devices.length === 0 ? (
              <div className="text-sm text-red-500 py-2">未检测到可用摄像头</div>
            ) : (
              <select
                value={config.device_index}
                onChange={(e) =>
                  setConfig({ ...config, device_index: Number(e.target.value) })
                }
                className="w-full border rounded-lg px-3 py-2"
              >
                {devices.map((device) => (
                  <option key={device.index} value={device.index}>
                    {device.name} ({device.resolution})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              帧率: {config.frame_rate} FPS
            </label>
            <input
              type="range"
              min={5}
              max={30}
              value={config.frame_rate}
              onChange={(e) =>
                setConfig({ ...config, frame_rate: Number(e.target.value) })
              }
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              画质: {config.jpeg_quality}%
            </label>
            <input
              type="range"
              min={30}
              max={100}
              value={config.jpeg_quality}
              onChange={(e) =>
                setConfig({ ...config, jpeg_quality: Number(e.target.value) })
              }
              className="w-full"
            />
          </div>

          {status && (
            <div className="text-xs text-gray-500 space-y-1">
              <p>状态: {status.status === 'running' ? '运行中' : status.status}</p>
              <p>分辨率: {status.config.resolution}</p>
              {status.error && <p className="text-red-500">错误: {status.error}</p>}
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};
