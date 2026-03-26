import React, { useState } from 'react';
import { PlayCircle, FileText, X } from 'lucide-react';

interface MediaItem {
  id: string;
  url: string;
  thumbnailUrl?: string;
  type: 'photo' | 'video' | 'pdf';
  caption: string;
  tags?: string[];
  fileSize?: string;  // 可选：文件大小
  duration?: number;  // 可选：视频时长
  pageCount?: number; // 可选：PDF 页数
}

interface MediaLibraryGridProps {
  mediaList: MediaItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
}

export const MediaLibraryGrid: React.FC<MediaLibraryGridProps> = ({
  mediaList,
  currentIndex,
  onSelect,
  onClose,
}) => {
  const [selectedTag, setSelectedTag] = useState<string>('全部');

  const tagSet = new Set<string>();
  mediaList.forEach((item) => {
    item.tags?.forEach((tag) => tagSet.add(tag));
  });

  const allTags = ['全部', ...Array.from(tagSet).sort()];
  const filteredMedia =
    selectedTag === '全部'
      ? mediaList
      : mediaList.filter((item) => item.tags?.includes(selectedTag));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95">
      <div className="bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center justify-between p-4 pb-2">
          <h2 className="text-2xl font-bold text-white">文件列表</h2>
          <button
            onClick={onClose}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 transition-colors hover:bg-white/30"
            aria-label="关闭文件列表"
          >
            <X size={28} className="text-white" strokeWidth={2.5} />
          </button>
        </div>

        {allTags.length > 1 && (
          <div className="px-4 pb-4">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`whitespace-nowrap rounded-full px-5 py-2.5 text-base font-medium transition-all ${
                    selectedTag === tag
                      ? 'scale-105 bg-cyan-500 text-white shadow-lg'
                      : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {filteredMedia.length === 0 ? (
          <div className="py-12 text-center text-white">
            <p className="text-xl">当前筛选下没有可显示的文件</p>
          </div>
        ) : (
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3 md:grid-cols-4">
            {filteredMedia.map((item) => {
              const originalIndex = mediaList.findIndex((media) => media.id === item.id);
              
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(originalIndex)}
                  className={`relative aspect-square overflow-hidden rounded-2xl shadow-xl transition-all hover:scale-[1.02] active:scale-[0.99] ${
                    originalIndex === currentIndex ? 'ring-4 ring-cyan-400' : ''
                  }`}
                >
                  {/* PDF 文件显示 */}
                  {item.type === 'pdf' ? (
                    <div className="h-full w-full flex flex-col items-center justify-center bg-gradient-to-br from-red-900/30 to-gray-900 p-4">
                      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-lg bg-red-500">
                        <FileText size={32} className="text-white" />
                      </div>
                      <p className="text-sm font-medium text-white">PDF 文档</p>
                      {item.pageCount && (
                        <p className="mt-1 text-xs text-gray-300">{item.pageCount} 页</p>
                      )}
                      {item.fileSize && (
                        <p className="mt-0.5 text-xs text-gray-300">{item.fileSize}</p>
                      )}
                    </div>
                  ) : (
                    // 图片/视频显示
                    <>
                      <img
                        src={item.type === 'photo' ? item.url : item.thumbnailUrl || item.url}
                        alt={item.caption}
                        className="h-full w-full object-cover"
                      />
                      {item.type === 'video' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <PlayCircle size={42} className="text-white drop-shadow-lg" />
                        </div>
                      )}
                    </>
                  )}

                  {/* 文件类型标签 */}
                  {item.type === 'pdf' && (
                    <div className="absolute right-2 top-2 rounded-full bg-red-500 px-2 py-1 text-xs font-bold text-white">
                      PDF
                    </div>
                  )}

                  {originalIndex === currentIndex && (
                    <div className="absolute right-2 top-2 rounded-full bg-cyan-500 px-2 py-1 text-xs font-bold text-white">
                      当前
                    </div>
                  )}

                  {/* 底部信息栏 */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-3 text-left">
                    <p className="line-clamp-2 text-sm font-medium text-white">{item.caption}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium text-white ${
                        item.type === 'pdf' ? 'bg-red-500' :
                        item.type === 'video' ? 'bg-blue-500' : 
                        'bg-green-500'
                      }`}>
                        {item.type === 'pdf' ? 'PDF' : 
                         item.type === 'video' ? '视频' : '图片'}
                      </span>
                      
                      {/* 附加信息 */}
                      {item.type === 'video' && item.duration && (
                        <span className="text-xs text-gray-300">
                          {Math.floor(item.duration / 60)}:{String(item.duration % 60).padStart(2, '0')}
                        </span>
                      )}
                      
                      {item.type === 'pdf' && item.pageCount && (
                        <span className="text-xs text-gray-300">{item.pageCount}页</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-gradient-to-t from-black/60 to-transparent p-4">
        <p className="text-center text-base text-white">
          {selectedTag === '全部'
            ? `共 ${mediaList.length} 项文件`
            : `${selectedTag}：${filteredMedia.length} 项文件`}
        </p>
      </div>
    </div>
  );
};