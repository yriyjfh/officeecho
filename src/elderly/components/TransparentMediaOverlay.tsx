import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { getUploadUrl } from '../../config/api';

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
    // ignore cleanup failures
  }
};

interface TransparentMediaOverlayProps {
  mediaFilename: string;
  mediaType: 'photo' | 'video';
  avatarText?: string;
  duration?: number;
  onClose: () => void;
  onVideoEnded?: () => void;
}

export const TransparentMediaOverlay: React.FC<TransparentMediaOverlayProps> = ({
  mediaFilename,
  mediaType,
  avatarText,
  duration = 30,
  onClose,
  onVideoEnded,
}) => {
  const [autoCloseTimer, setAutoCloseTimer] = useState<number>(duration);
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [videoEnded, setVideoEnded] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isClosingRef = useRef(false);
  const handleCloseRef = useRef<() => void>(() => {});

  const mediaUrl = getUploadUrl(mediaFilename);

  useEffect(() => {
    setAutoCloseTimer(duration);
    setIsClosing(false);
    setVideoEnded(false);
    isClosingRef.current = false;
  }, [duration, mediaFilename, mediaType]);

  const handleClose = () => {
    if (isClosingRef.current) {
      return;
    }

    isClosingRef.current = true;
    releaseVideoElement(videoRef.current);
    setIsClosing(true);

    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }

    closeTimeoutRef.current = setTimeout(() => {
      onClose();
    }, 300);
  };

  handleCloseRef.current = handleClose;

  useEffect(() => {
    if (mediaType === 'video' && duration === 0) {
      return;
    }

    if (duration <= 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setAutoCloseTimer((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          handleCloseRef.current();
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [duration, mediaFilename, mediaType]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }

      isClosingRef.current = false;
      releaseVideoElement(videoRef.current);
    };
  }, [mediaFilename, mediaType]);

  const handleVideoEnded = () => {
    console.log('[TransparentMediaOverlay] 视频播放完成');
    setVideoEnded(true);
    onVideoEnded?.();
    handleCloseRef.current();
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="relative flex h-full w-full flex-col items-center justify-center p-4 pt-[calc(1rem+10vh)]">
        <div className="relative flex max-h-full max-w-full items-center justify-center">
          {mediaType === 'photo' ? (
            <img
              src={mediaUrl}
              alt="展示文件"
              className="max-h-[90vh] max-w-full rounded-2xl object-contain shadow-2xl"
              onError={(event) => {
                console.error('图片加载失败:', mediaUrl);
                (event.target as HTMLImageElement).src = '/placeholder-photo.jpg';
              }}
            />
          ) : (
            <video
              ref={videoRef}
              key={mediaUrl}
              src={mediaUrl}
              controls
              autoPlay
              preload="metadata"
              crossOrigin="anonymous"
              className="max-h-[90vh] max-w-full rounded-2xl object-contain shadow-2xl"
              onEnded={handleVideoEnded}
              onError={() => {
                console.error('视频播放失败:', mediaUrl);
                handleCloseRef.current();
              }}
            />
          )}

          <div className="absolute right-3 top-3 flex items-center gap-2">
            {mediaType === 'video' && duration === 0 ? (
              <div className="rounded-full bg-black/70 px-3 py-1.5 text-sm text-white">
                {videoEnded ? '播放完成' : '播放中...'}
              </div>
            ) : (
              <div className="rounded-full bg-black/70 px-3 py-1.5 text-sm text-white">
                {autoCloseTimer}s
              </div>
            )}

            <button
              onClick={handleClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white transition-all hover:scale-110 hover:bg-black/80 active:scale-95"
              aria-label="关闭"
            >
              <X size={20} />
            </button>
          </div>

          {avatarText && (
            <div className="absolute bottom-3 left-3 right-3">
              <div className="rounded-lg bg-black/80 px-4 py-2 text-center text-base text-white">
                {avatarText}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
