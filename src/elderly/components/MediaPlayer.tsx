import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Grid3x3,
  Pause,
  Play,
  QrCode,
  RotateCw,
  Tag,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import * as mediaService from '../services/mediaService';
import { QRCodeModal } from './QRCodeModal';
import {
  buildMediaDownloadUrl,
  getInitialLanIp,
  hydratePersistedLanIp,
  subscribeLanIpChange,
} from '../utils/lanAccess';

// 视频元素清理函数
const releaseVideoElement = (video: HTMLVideoElement | null) => {
  if (!video) return;

  try {
    const activeSource = video.currentSrc || video.src;
    video.pause();
    video.removeAttribute('src');
    video.currentTime = 0;
    video.src = '';
    video.load();

    if (activeSource.startsWith('blob:')) {
      URL.revokeObjectURL(activeSource);
    }
  } catch {
    // 忽略清理失败
  }
};

// 接口定义
interface MediaPlayerProps {
  familyId: string;
  elderlyId: number;
  currentMood?: string;
  onClose?: () => void;
  onOpenWhiteboard?: () => void;
  logMessage?: string | null;
  orientationMode?: 'portrait' | 'landscape';
  onToggleOrientation?: () => void;
}

interface GridItem {
  id: number;
  title: string;
  url: string;
  thumbnailUrl?: string;
  mediaType: 'photo' | 'video' | 'pdf';
  tags: string[];
}

// 文件类型信息工具函数
const getFileTypeInfo = (type: 'photo' | 'video' | 'pdf') => {
  switch (type) {
    case 'pdf':
      return {
        color: 'bg-red-500',
        icon: FileText,
        label: 'PDF',
        displayType: 'PDF文档',
        bgGradient: 'from-red-900/30 to-gray-900',
      };
    case 'video':
      return {
        color: 'bg-blue-500',
        icon: Play,
        label: '视频',
        displayType: '视频',
        bgGradient: 'from-blue-900/20 to-gray-900',
      };
    case 'photo':
    default:
      return {
        color: 'bg-green-500',
        icon: undefined,
        label: '图片',
        displayType: '图片',
        bgGradient: 'from-green-900/20 to-gray-900',
      };
  }
};

// PDF 预览组件
const PdfPreview: React.FC<{ 
  title: string; 
  downloadUrl?: string;
  onDownload?: () => void;
}> = ({ title, downloadUrl, onDownload }) => (
  <div className="flex h-full w-full items-center justify-center">
    <div className="flex max-h-full max-w-full flex-col items-center justify-center p-8">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-red-500">
        <FileText size={48} className="text-white" />
      </div>
      <h3 className="mb-2 text-center text-2xl font-bold text-white">{title}</h3>
      <p className="mb-6 text-gray-300">PDF 文档</p>
      
      {downloadUrl && (
        <a
          href={downloadUrl}
          download={title}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-lg font-semibold text-red-600 transition-all hover:bg-gray-100 active:scale-95"
          onClick={(e) => {
            e.stopPropagation();
            onDownload?.();
          }}
        >
          <FileText size={20} />
          下载 PDF
        </a>
      )}
    </div>
  </div>
);

export const MediaPlayer: React.FC<MediaPlayerProps> = ({
  familyId,
  elderlyId,
  currentMood,
  onClose,
  onOpenWhiteboard,
  logMessage,
  orientationMode,
  onToggleOrientation,
}) => {
  const [recommendedMedia, setRecommendedMedia] = useState<mediaService.RecommendedMedia[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [playStartTime, setPlayStartTime] = useState<Date | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [showManagementQr, setShowManagementQr] = useState(false);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [downloadUrl, setDownloadUrl] = useState('');
  const [lanIp, setLanIp] = useState(getInitialLanIp);
  const [videoError, setVideoError] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  const currentMedia = recommendedMedia[currentIndex];
  const isLandscape = orientationMode === 'portrait';
  const orientationToggleLabel =
    orientationMode === 'landscape'
      ? '横屏'
      : orientationMode === 'portrait'
        ? '竖屏'
        : null;
  const contentPaddingClass = isLandscape ? 'p-4 pt-24 pb-32' : 'p-8 pt-32 pb-44';
  const bottomBarPaddingClass = isLandscape ? 'p-3' : 'p-4';
  const bottomOffset = isLandscape ? '8px' : '30px';

  // 构建网格媒体项
  const gridMedia: GridItem[] = recommendedMedia.map((item) => ({
    id: item.id,
    title: item.title,
    url: mediaService.getMediaUrl(item.file_path),
    thumbnailUrl: item.thumbnail_path
      ? mediaService.getThumbnailUrl(item.thumbnail_path)
      : undefined,
    mediaType: item.media_type,
    tags: item.tags || [],
  }));

  const tagFilteredGridMedia =
    selectedTags.length === 0
      ? gridMedia
      : gridMedia.filter((item) => item.tags.some((tag) => selectedTags.includes(tag)));

  // 实时时钟
  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  // LAN IP 管理
  useEffect(() => {
    let cancelled = false;

    void hydratePersistedLanIp().then((savedLanIp) => {
      if (!cancelled && savedLanIp) {
        setLanIp(savedLanIp);
      }
    });

    const unsubscribe = subscribeLanIpChange((nextLanIp) => {
      setLanIp(nextLanIp);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // 加载推荐媒体（修复排序问题）
  useEffect(() => {
    let cancelled = false;

    const loadRecommendedMedia = async () => {
      try {
        setLoading(true);
        const response = await mediaService.getRecommendedMedia(
          familyId,
          elderlyId,
          currentMood,
          undefined,
          selectedTags.length > 0 ? selectedTags : undefined,
        );

        if (cancelled) {
          return;
        }

        // 修复排序逻辑：按优先级和时间排序
        const sortedMedia = (response.media || []).sort((a, b) => {
          // 1. 按优先级降序
          if (b.priority !== a.priority) {
            return b.priority - a.priority;
          }
          // 2. 按播放次数升序（播放少的优先）
          if (a.play_count !== b.play_count) {
            return a.play_count - b.play_count;
          }
          // 3. 按最后播放时间（未播放的优先）
          if (!a.last_played_at && b.last_played_at) return -1;
          if (a.last_played_at && !b.last_played_at) return 1;
          // 4. 按ID升序
          return a.id - b.id;
        });

        setRecommendedMedia(sortedMedia);
        setAvailableTags(response.available_tags || []);
        setCurrentIndex(0);
        setVideoError(false);
      } catch (error) {
        console.error('[MediaPlayer] 加载推荐文件失败:', error);
        if (!cancelled) {
          setRecommendedMedia([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadRecommendedMedia();

    return () => {
      cancelled = true;
    };
  }, [currentMood, elderlyId, familyId, selectedTags]);

  // 记录播放开始
  useEffect(() => {
    if (!currentMedia) {
      return;
    }

    setPlayStartTime(new Date());
    setVideoError(false);

    void mediaService.recordMediaPlay(currentMedia.id, {
      elderly_id: elderlyId,
      duration_watched: 0,
      completed: 0,
      triggered_by: 'auto',
      mood_before: currentMood,
    }).catch((error) => {
      console.error('[MediaPlayer] 记录播放开始失败:', error);
    });
  }, [currentMedia?.id, currentMood, elderlyId]);

  // 组件卸载时清理视频
  useEffect(() => {
    return () => {
      releaseVideoElement(videoRef.current);
    };
  }, [currentMedia?.id]);

  // 构建下载URL
  useEffect(() => {
    if (!currentMedia) {
      setDownloadUrl('');
      return;
    }

    setDownloadUrl(
      buildMediaDownloadUrl({
        filePath: currentMedia.file_path,
        title: currentMedia.title,
        lanIp,
      }),
    );
  }, [currentMedia, lanIp]);

  // 图片自动播放逻辑
  useEffect(() => {
    if (!currentMedia || currentMedia.media_type !== 'photo' || isPaused) {
      return;
    }

    const timer = window.setTimeout(() => {
      void handleNext();
    }, 15000);

    return () => window.clearTimeout(timer);
  }, [currentMedia?.id, isPaused]);

  // PDF 文件自动跳过
  useEffect(() => {
    if (currentMedia?.media_type === 'pdf' && !isPaused) {
      const timer = window.setTimeout(() => {
        void handleNext();
      }, 10000);
      
      return () => window.clearTimeout(timer);
    }
}, [currentMedia?.id, isPaused]);

  // 记录播放
  const recordPlay = async (completed: boolean) => {
    if (!currentMedia || !playStartTime) {
      return;
    }

    const durationWatched = Math.max(
      0,
      Math.floor((Date.now() - playStartTime.getTime()) / 1000),
    );

    try {
      await mediaService.recordMediaPlay(currentMedia.id, {
        elderly_id: elderlyId,
        duration_watched: durationWatched,
        completed: completed ? 1 : 0,
        triggered_by: 'auto',
        mood_before: currentMood,
      });
    } catch (error) {
      console.error('[MediaPlayer] 记录播放失败:', error);
    }
  };

  // 处理下一个（简化：只保留顺序播放）
  const handleNext = async () => {
    if (recommendedMedia.length === 0) {
      return;
    }

    await recordPlay(true);

    // 固定使用顺序播放逻辑
    const nextIndex = (currentIndex + 1) % recommendedMedia.length;
    releaseVideoElement(videoRef.current);
    setCurrentIndex(nextIndex);
  };

  // 处理上一个
  const handlePrevious = async () => {
    if (recommendedMedia.length <= 1) {
      return;
    }

    await recordPlay(false);
    releaseVideoElement(videoRef.current);
    setCurrentIndex((currentIndex - 1 + recommendedMedia.length) % recommendedMedia.length);
  };

  // 处理关闭
  const handleClose = async () => {
    releaseVideoElement(videoRef.current);
    await recordPlay(false);
    onClose?.();
  };

  // 切换暂停/播放
  const togglePause = () => {
    setIsPaused((prev) => !prev);

    if (!videoRef.current) {
      return;
    }

    if (videoRef.current.paused) {
      void videoRef.current.play().catch((error) => {
        console.error('[MediaPlayer] 继续播放失败:', error);
      });
    } else {
      videoRef.current.pause();
    }
  };

  // 切换静音
  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (videoRef.current) {
        videoRef.current.muted = next;
      }
      return next;
    });
  };

  // 处理视频错误
  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    setVideoError(true);
    // 在控制台查看视频地址
    console.error('[MediaPlayer] 视频播放失败:', {
      src: video.src,
      error: video.error,
      networkState: video.networkState,
      readyState: video.readyState
    });

    // 如果视频无法播放，尝试切换到下一个
    if (!isPaused && recommendedMedia.length > 1) {
      console.log('[MediaPlayer] 视频播放失败，自动切换到下一个');
      // 在控制台查看视频地址
      console.log('视频URL:', mediaService.getMediaUrl(currentMedia.file_path));
      void handleNext();
    }
  };

  // 处理PDF下载
  const handlePdfDownload = async () => {
    if (currentMedia) {
      try {
        await mediaService.recordDownload(currentMedia.id, elderlyId, 'pdf');
      } catch (error) {
        console.error('[MediaPlayer] 记录下载失败:', error);
      }
    }
  };

  // 处理网格项点击
  const handleGridItemClick = (item: GridItem) => {
    const originalIndex = recommendedMedia.findIndex((media) => media.id === item.id);
    
    if (originalIndex === -1) {
      console.error('[MediaPlayer] 未找到对应的媒体项:', item.id);
      return;
    }

    releaseVideoElement(videoRef.current);
    setCurrentIndex(originalIndex);
    setShowGrid(false);
  };

  // 加载状态
  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <div className="text-xl text-white">正在加载...</div>
      </div>
    );
  }

  // 无内容状态
  if (!currentMedia) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <div className="text-center text-white">
          <p className="mb-4 text-xl">暂时没有最新的相关政策</p>
          <button
            onClick={() => void handleClose()}
            className="rounded-lg bg-white px-6 py-3 text-black transition-colors hover:bg-gray-200"
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  const currentFileTypeInfo = getFileTypeInfo(currentMedia.media_type);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* 顶部控制栏 */}
      <div className="absolute right-6 top-6 z-20">
        <div className="flex flex-col items-end gap-3">
          {onToggleOrientation && orientationToggleLabel && (
            <button
              onClick={onToggleOrientation}
              className="flex items-center gap-2 rounded-2xl bg-black/70 px-5 py-3 text-white shadow-2xl transition-all hover:bg-black/80 active:scale-95"
              aria-label="切换横竖屏"
              title={`切换到${orientationToggleLabel}`}
            >
              <RotateCw size={26} strokeWidth={2.5} />
              <span className="text-lg font-bold">{orientationToggleLabel}</span>
            </button>
          )}

          <div className="rounded-2xl bg-black/70 px-4 py-2">
            <p className="tabular-nums text-2xl font-bold text-white">
              {currentTime.toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </p>
            <p className="text-center text-sm text-white/80">
              {currentTime.toLocaleDateString('zh-CN', {
                month: 'long',
                day: 'numeric',
                weekday: 'short',
              })}
            </p>
          </div>
        </div>
      </div>

      {/* 标题区域 */}
      <div className="absolute left-0 right-0 top-6 z-10 flex flex-col items-center gap-2 px-6">
        <p className="rounded-2xl bg-black/80 px-6 py-3 text-2xl font-bold text-white">
          {currentMedia.title}
        </p>
        {recommendedMedia.length > 1 && (
          <p className="rounded-full bg-black/70 px-4 py-2 text-base text-white">
            {currentIndex + 1} / {recommendedMedia.length}
          </p>
        )}
        {logMessage && (
          <p className="max-w-3xl rounded-full bg-black/60 px-4 py-2 text-sm text-white/90">
            {logMessage}
          </p>
        )}
      </div>

      {/* 主内容区域 */}
      <div className={`flex flex-1 items-center justify-center ${contentPaddingClass}`}>
        {currentMedia.media_type === 'photo' ? (
          <img
            src={mediaService.getMediaUrl(currentMedia.file_path)}
            alt={currentMedia.title}
            className="max-h-full max-w-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/fallback-image.jpg';
            }}
          />
        ) : currentMedia.media_type === 'video' ? (
            <div className="relative w-full h-full">
              <video
                ref={videoRef}
                key={currentMedia.id}
                src={mediaService.getMediaUrl(currentMedia.file_path)}
                controls
                autoPlay={!isPaused}
                muted={isMuted}
                playsInline
                preload="auto"
                crossOrigin="anonymous"
                className="max-h-full max-w-full"
                // 新增：加载开始时强制纠正 SRC，防止被篡改
               onLoadStart={(e) => {
                  const video = e.currentTarget;
                  const correctSrc = mediaService.getMediaUrl(currentMedia.file_path);
                  
                  // 👇 更强判断：只要不是正确地址，一律强制修复
                  if (video.src !== correctSrc) {
                    console.warn('[MediaPlayer] SRC 被篡改，强制修复');
                    video.src = correctSrc;
                    video.load();
                  }
                }}
                onCanPlay={() => {
                  console.log('[MediaPlayer] 视频可以播放');
                  setVideoError(false);
                }}
                onEnded={() => {
                  if (!isPaused) {
                    void handleNext();
                  }
                }}
                onError={handleVideoError}
              />

              {videoError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <div className="text-center p-6">
                    <div className="text-red-500 mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.998-.833-2.732 0L4.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">视频无法播放</h3>
                    <p className="text-gray-300 mb-4">该视频文件可能格式不兼容或已损坏</p>
                    <button
                      onClick={() => void handleNext()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      跳过此视频
                    </button>
                  </div>
                </div>
              )}
            </div>
        ) : (
          <PdfPreview
            title={currentMedia.title}
            downloadUrl={downloadUrl}
            onDownload={handlePdfDownload}
          />
        )}
      </div>

      {/* 下载二维码 */}
     {downloadUrl && (
        <div
          className="absolute right-8 z-20"
          style={{ bottom: isLandscape ? '88px' : '134px' }}
        >
          <a
            href={downloadUrl}
            download={currentMedia.title}
            onClick={(e) => {
              e.stopPropagation();
              handlePdfDownload();
            }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl text-lg font-semibold shadow-xl transition-all active:scale-95"
          >
            <FileText size={22} />
            下载文件
          </a>
        </div>
      )}
      {/* 网格视图 */}
      {showGrid && (
        <div className="fixed inset-0 z-[60] bg-black/95 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">文件列表</h2>
            <button
              onClick={() => setShowGrid(false)}
              className="rounded-full bg-white/10 p-3 text-white transition-colors hover:bg-white/20"
              aria-label="关闭文件列表"
            >
              <X size={24} />
            </button>
          </div>
          <div className="grid max-h-[80vh] grid-cols-2 gap-3 overflow-y-auto md:grid-cols-4">
            {tagFilteredGridMedia.map((item) => {
              const fileTypeInfo = getFileTypeInfo(item.mediaType);
              
              return (
                <button
                  key={item.id}
                  onClick={() => handleGridItemClick(item)}
                  className={`relative aspect-square overflow-hidden rounded-2xl transition-all hover:scale-[1.02] ${
                    item.id === currentMedia.id ? 'ring-4 ring-cyan-400' : ''
                  }`}
                >
                  {item.mediaType === 'pdf' ? (
                    <div className={`h-full w-full flex flex-col items-center justify-center bg-gradient-to-br ${fileTypeInfo.bgGradient} p-4`}>
                      <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-lg ${fileTypeInfo.color}`}>
                        {fileTypeInfo.icon && React.createElement(fileTypeInfo.icon, { 
                          size: 24, 
                          className: "text-white" 
                        })}
                      </div>
                      <p className="text-xs font-medium text-white">{fileTypeInfo.displayType}</p>
                    </div>
                  ) : (
                    <img
                      src={item.mediaType === 'photo' ? item.url : item.thumbnailUrl || item.url}
                      alt={item.title}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/fallback-image.jpg';
                      }}
                    />
                  )}
                  
                  {item.mediaType === 'video' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <Play size={24} className="text-white drop-shadow-lg" />
                    </div>
                  )}
                  
                  {item.mediaType === 'pdf' && (
                    <div className="absolute right-2 top-2 rounded-full bg-red-500 px-2 py-1 text-xs font-bold text-white">
                      PDF
                    </div>
                  )}
                  
                  {item.id === currentMedia.id && (
                    <div className="absolute right-2 top-2 rounded-full bg-cyan-500 px-2 py-1 text-xs font-bold text-white">
                      当前
                    </div>
                  )}

                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-left">
                    <p className="line-clamp-2 text-sm font-medium text-white">{item.title}</p>
                    <div className="mt-1 flex">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium text-white ${fileTypeInfo.color}`}>
                        {fileTypeInfo.label}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 标签筛选弹窗 */}
      {showTagFilter && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-6">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-800">筛选标签</h3>
              <button
                onClick={() => setShowTagFilter(false)}
                className="rounded-full bg-gray-100 p-2 text-gray-600 transition-colors hover:bg-gray-200"
                aria-label="关闭标签筛选"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {availableTags.map((tag) => {
                const selected = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => {
                      setSelectedTags((prev) =>
                        prev.includes(tag)
                          ? prev.filter((item) => item !== tag)
                          : [...prev, tag],
                      );
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                      selected
                        ? 'bg-pink-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSelectedTags([])}
                className="flex-1 rounded-xl bg-gray-100 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-200"
              >
                清空
              </button>
              <button
                onClick={() => setShowTagFilter(false)}
                className="flex-1 rounded-xl bg-indigo-600 py-3 font-medium text-white transition-colors hover:bg-indigo-700"
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 底部控制栏（简化版） */}
      <div
        className={`absolute left-0 right-0 z-10 bg-black/80 ${bottomBarPaddingClass}`}
        style={{ bottom: bottomOffset }}
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-3">
          {recommendedMedia.length > 1 && (
            <button
              onClick={() => void handlePrevious()}
              className="rounded-2xl bg-slate-600 p-4 text-white shadow-xl transition-all hover:bg-slate-700 active:scale-95"
              aria-label="上一项"
            >
              <ChevronLeft size={28} strokeWidth={2.5} />
            </button>
          )}

          {recommendedMedia.length > 1 && (
            <button
              onClick={() => void handleNext()}
              className="rounded-2xl bg-slate-600 p-4 text-white shadow-xl transition-all hover:bg-slate-700 active:scale-95"
              aria-label="下一项"
            >
              <ChevronRight size={28} strokeWidth={2.5} />
            </button>
          )}

              {currentMedia.media_type === 'video' && (
                <button
                  onClick={togglePause}
                  className={`rounded-2xl p-4 text-white shadow-xl transition-all active:scale-95 ${
                    isPaused ? 'bg-green-600 hover:bg-green-700' : 'bg-yellow-500 hover:bg-yellow-600'
                  }`}
                  aria-label={isPaused ? '继续播放' : '暂停播放'}
                >
                  {isPaused ? <Play size={28} strokeWidth={2.5} /> : <Pause size={28} strokeWidth={2.5} />}
                </button>
              )}

         {currentMedia.media_type === 'video' && (
            <button
              onClick={toggleMute}
              className={`rounded-2xl p-4 text-white shadow-xl transition-all active:scale-95 ${
                isMuted ? 'bg-orange-500 hover:bg-orange-600' : 'bg-purple-600 hover:bg-purple-700'
              }`}
              aria-label={isMuted ? '开启声音' : '静音'}
            >
              {isMuted ? <VolumeX size={28} strokeWidth={2.5} /> : <Volume2 size={28} strokeWidth={2.5} />}
            </button>
          )}

          {availableTags.length > 0 && (
            <button
              onClick={() => setShowTagFilter(true)}
              className={`relative rounded-2xl p-4 text-white shadow-xl transition-all active:scale-95 ${
                selectedTags.length > 0
                  ? 'bg-pink-500 hover:bg-pink-600'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
              aria-label="标签筛选"
            >
              <Tag size={28} strokeWidth={2.5} />
              {selectedTags.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-pink-500">
                  {selectedTags.length}
                </span>
              )}
            </button>
          )}

          {recommendedMedia.length > 1 && (
            <button
              onClick={() => setShowGrid(true)}
              className="rounded-2xl bg-blue-600 p-4 text-white shadow-xl transition-all hover:bg-blue-700 active:scale-95"
              aria-label="查看全部文件"
            >
              <Grid3x3 size={28} strokeWidth={2.5} />
            </button>
          )}

          {/* <button
            onClick={() => setShowManagementQr(true)}
            className="rounded-2xl bg-cyan-600 p-4 text-white shadow-xl transition-all hover:bg-cyan-700 active:scale-95"
            aria-label="显示管理入口二维码"
          >
            <QrCode size={28} strokeWidth={2.5} />
          </button> */}

          <button
            onClick={() => void handleClose()}
            className="rounded-2xl bg-gray-700 p-4 text-white shadow-xl transition-all hover:bg-gray-800 active:scale-95"
            aria-label="关闭文件播放器"
          >
            <X size={28} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* 管理二维码弹窗 */}
      {showManagementQr && (
        <QRCodeModal onClose={() => setShowManagementQr(false)} />
      )}
    </div>
  );
};