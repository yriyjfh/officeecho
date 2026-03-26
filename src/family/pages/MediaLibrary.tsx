import React, { useState, useEffect } from 'react';
import { Upload, Image as ImageIcon, Video, X } from 'lucide-react';
import * as mediaService from '../services/mediaService';

/**
 * 管理端文件库界面
 * 上传、打标、配置触发策略
 */
export const MediaLibrary: React.FC = () => {
  const [selectedMedia, setSelectedMedia] = useState<mediaService.Media | null>(null);
  const [showUploader, setShowUploader] = useState(false);
  const [mediaItems, setMediaItems] = useState<mediaService.Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  // 编辑表单状态
  const [editTitle, setEditTitle] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [editTimeWindows, setEditTimeWindows] = useState<string[]>([]);
  const [editCooldown, setEditCooldown] = useState(60);

  const familyId = 'family_001'; // 实际使用时从用户上下文获取

  // 加载文件列表
  useEffect(() => {
    loadMedia();
  }, []);

  // 当选中文件时，初始化编辑表单
  useEffect(() => {
    if (selectedMedia) {
      setEditTitle(selectedMedia.title);
      setEditTags(selectedMedia.tags || []);
      setEditTimeWindows(selectedMedia.time_windows || []);
      setEditCooldown(selectedMedia.cooldown || 60);
    }
  }, [selectedMedia]);

  const loadMedia = async () => {
    try {
      setLoading(true);
      const data = await mediaService.getFamilyMedia(familyId);
      setMediaItems(data);
    } catch (error) {
      console.error('加载文件列表失败:', error);
      showToast('加载文件列表失败', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 处理文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadFile(file);

      // 创建预览URL
      const previewUrl = URL.createObjectURL(file);
      setUploadPreviewUrl(previewUrl);

      // 自动填充标题（使用文件名，去掉扩展名）
      if (!uploadTitle) {
        const fileName = file.name.replace(/\.[^/.]+$/, '');
        setUploadTitle(fileName);
      }
    }
  };

  // 清理预览URL以避免内存泄漏
  useEffect(() => {
    return () => {
      if (uploadPreviewUrl) {
        URL.revokeObjectURL(uploadPreviewUrl);
      }
    };
  }, [uploadPreviewUrl]);

  // 处理上传
  const handleUpload = async () => {
    if (!uploadFile || !uploadTitle.trim()) {
      showToast('请选择文件并填写标题', 'warning');
      return;
    }

    try {
      setUploading(true);
      await mediaService.uploadMedia({
        file: uploadFile,
        family_id: familyId,
        title: uploadTitle,
        description: uploadDescription,
      });

      showToast('上传成功', 'success');
      setShowUploader(false);
      setUploadFile(null);
      setUploadPreviewUrl(null);
      setUploadTitle('');
      setUploadDescription('');

      // 重新加载文件列表
      await loadMedia();
    } catch (error) {
      console.error('上传失败:', error);
      showToast(error instanceof Error ? error.message : '上传失败', 'error');
    } finally {
      setUploading(false);
    }
  };

  // 保存文件策略
  const handleSavePolicy = async () => {
    if (!selectedMedia) return;

    try {
      await mediaService.updateMedia(selectedMedia.id, {
        title: editTitle,
        tags: editTags,
        time_windows: editTimeWindows,
        moods: [],
        occasions: [],
        cooldown: editCooldown,
        priority: selectedMedia.priority || 5,
      });

      showToast('保存成功', 'success');
      setSelectedMedia(null);
      await loadMedia();
    } catch (error) {
      console.error('保存失败:', error);
      showToast(error instanceof Error ? error.message : '保存失败', 'error');
    }
  };

  // 添加标签
  const handleAddTag = () => {
    if (newTag.trim() && !editTags.includes(newTag.trim())) {
      setEditTags([...editTags, newTag.trim()]);
      setNewTag('');
    }
  };

  // 删除标签
  const handleRemoveTag = (tagToRemove: string) => {
    setEditTags(editTags.filter(tag => tag !== tagToRemove));
  };

  // 切换时段
  const handleToggleTimeWindow = (timeWindow: string) => {
    if (editTimeWindows.includes(timeWindow)) {
      setEditTimeWindows(editTimeWindows.filter(tw => tw !== timeWindow));
    } else {
      setEditTimeWindows([...editTimeWindows, timeWindow]);
    }
  };

  // 删除文件
  const handleDeleteMedia = async (mediaId: number) => {
    if (!confirm('确定要删除这个文件吗？')) return;

    try {
      await mediaService.deleteMedia(mediaId);
      showToast('删除成功', 'success');
      setSelectedMedia(null);
      await loadMedia();
    } catch (error) {
      console.error('删除失败:', error);
      showToast(error instanceof Error ? error.message : '删除失败', 'error');
    }
  };

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* 顶部导航 */}
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-900">文件库</h1>
              <button
                onClick={() => setShowUploader(true)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
              >
                <Upload size={18} />
                上传文件
              </button>
            </div>
          </div>
        </div>

        {/* 主要内容区 */}
        <div className="max-w-7xl mx-auto px-6 py-8">
        {/* 步骤提示 */}
        <div className="mb-8">
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            {['上传', '添加标签', '发布'].map((step, index) => (
              <div key={index} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-primary-600 text-white flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                  <span className="text-sm mt-2 text-gray-700">{step}</span>
                </div>
                {index < 2 && (
                  <div className="w-32 h-1 bg-primary-200 mx-4" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 加载状态 */}
        {loading && (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">加载中...</p>
          </div>
        )}

        {/* 文件网格 */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mediaItems.map((item) => (
              <div
                key={item.id}
                className="card p-0 overflow-hidden cursor-pointer hover:shadow-xl transition-shadow"
                onClick={() => setSelectedMedia(item)}
              >
                {/* 缩略图 */}
                <div className="bg-gray-200 aspect-video flex items-center justify-center relative overflow-hidden">
                  {item.media_type === 'photo' ? (
                    <>
                      <img
                        src={mediaService.getMediaUrl(item.file_path)}
                        alt={item.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // 加载失败时显示占位图标
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                      {/* 加载失败时的占位图标 */}
                      <div className="hidden absolute inset-0 flex items-center justify-center bg-gray-200">
                        <ImageIcon size={48} className="text-gray-400" />
                      </div>
                    </>
                      ) : item.media_type === 'pdf' ? (
                        // ✅ 新增：PDF 专用封面
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
                          <div className="w-16 h-16 flex items-center justify-center bg-blue-100 text-blue-600 rounded-lg mb-2">
                            <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M9 4.75a.75.75 0 011.5 0v8.586l1.97-1.97a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 111.06-1.06l1.97 1.97V4.75z" />
                              <path fillRule="evenodd" d="M4 1.75C4 .784 4.784 0 5.75 0h12.5c.966 0 1.75.784 1.75 1.75v20.5A1.75 1.75 0 0118.25 24H5.75A1.75 1.75 0 014 22.25V1.75zm1.75.25a.25.25 0 00-.25.25v20.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V1.75a.25.25 0 00-.25-.25H5.75z" />
                            </svg>
                          </div>
                          <span className="text-sm font-medium text-blue-700">PDF 文档</span>
                        </div>
                      ) : (
                        // 视频显示缩略图或图标
                        item.thumbnail_path ? (
                          <>
                            <img
                              src={mediaService.getThumbnailUrl(item.thumbnail_path)}
                              alt={item.title}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                            <div className="hidden absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-100 to-blue-100">
                              <Video size={64} className="text-purple-500" />
                            </div>
                            {/* 播放图标叠加 */}
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-12 h-12 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
                                <div className="w-0 h-0 border-t-8 border-t-transparent border-l-12 border-l-white border-b-8 border-b-transparent ml-1"></div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-100 to-blue-100">
                            <Video size={64} className="text-purple-500" />
                          </div>
                        )
                      )}

                      <div className="absolute top-2 right-2 px-2 py-1 bg-black bg-opacity-60 text-white text-xs rounded">
                        {item.media_type === 'photo' ? '照片' : 
                        item.media_type === 'video' ? '视频' : 
                        item.media_type === 'pdf' ? 'PDF' : '文件'}
                      </div>

                      {/* 播放次数 */}
                      {item.play_count > 0 && (
                        <div className="absolute bottom-2 left-2 px-2 py-1 bg-black bg-opacity-60 text-white text-xs rounded">
                          观看 {item.play_count} 次
                        </div>
                      )}
                    </div>

                {/* 信息区 */}
                <div className="p-4">
                  <h3 className="font-medium text-gray-900 mb-2">{item.title}</h3>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {item.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">
                    上传于 {new Date(item.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}

            {/* 上传占位卡 */}
            <div
              onClick={() => setShowUploader(true)}
              className="card p-0 overflow-hidden cursor-pointer hover:shadow-xl transition-shadow border-2 border-dashed border-gray-300 hover:border-primary-400"
            >
              <div className="aspect-video flex flex-col items-center justify-center text-gray-400 hover:text-primary-600 transition-colors">
                <Upload size={48} />
                <span className="mt-2 text-sm font-medium">点击上传</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 文件详情侧边栏 */}
      {selectedMedia && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-end animate-fade-in">
          <div className="bg-white w-full max-w-2xl h-full overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">文件详情与策略</h2>
              <button
                onClick={() => setSelectedMedia(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* 基本信息 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  标题
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* 内容标签 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  内容标签
                </label>
                {/* 预设标签快捷选择 */}
                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-2">快捷添加：</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                        '招生政策', '学籍管理', '奖助评选', '升学指导',
                        '校园风貌', '学子风采', '文化活动', '服务指南',
                        '教学资源', '实践案例', '荣誉成果', '环境一览'
                    ].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => {
                          if (!editTags.includes(preset)) {
                            setEditTags([...editTags, preset]);
                          }
                        }}
                        disabled={editTags.includes(preset)}
                        className={`px-2 py-1 text-xs rounded-full border transition-colors ${
                          editTags.includes(preset)
                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                            : 'bg-white text-blue-600 border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                </div>
                {/* 已选标签 */}
                <div className="flex flex-wrap gap-2 mb-2">
                  {editTags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm flex items-center gap-1"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-blue-900"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                {/* 自定义标签输入 */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="添加自定义标签..."
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTag();
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    添加
                  </button>
                </div>
              </div>

              {/* 触发策略 */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">发布时间</h3>

                {/* 时段选择 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    播放时段
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: '上午 (09:00-12:00)', value: '09:00-12:00' },
                      { label: '午间 (12:00-14:00)', value: '12:00-14:00' },
                      { label: '下午 (14:00-18:00)', value: '14:00-18:00' },
                      { label: '全天 (09:00-18:00)', value: '09:00-18:00' },
                    ].map((time, index) => (
                      <label
                        key={index}
                        className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                          editTimeWindows.includes(time.value)
                            ? 'bg-blue-50 border-blue-300'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={editTimeWindows.includes(time.value)}
                          onChange={() => handleToggleTimeWindow(time.value)}
                        />
                        <span className="text-sm">{time.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 播放间隔 */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    重复播放间隔
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    value={editCooldown}
                    onChange={(e) => setEditCooldown(Number(e.target.value))}
                  >
                    <option value="5">5 分钟</option>
                    <option value="15">15 分钟</option>
                    <option value="30">30 分钟</option>
                    <option value="60">1 小时</option>
                    <option value="1440">每天最多1次</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    同一学生在此时间内不会重复看到此内容
                  </p>
                </div>
              </div>

              {/* 保存和删除按钮 */}
              <div className="flex gap-3">
                <button
                  onClick={() => handleDeleteMedia(selectedMedia.id)}
                  className="px-6 py-3 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium"
                >
                  删除文件
                </button>
                <button
                  onClick={handleSavePolicy}
                  className="flex-1 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                >
                  保存设置
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 上传对话框 */}
      {showUploader && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">上传文件</h2>
              <button
                onClick={() => {
                  setShowUploader(false);
                  setUploadFile(null);
                  setUploadPreviewUrl(null);
                  setUploadTitle('');
                  setUploadDescription('');
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={24} />
              </button>
            </div>

            {/* 文件选择和预览 */}
            <div className="mb-4">
              <label className="border-2 border-dashed border-gray-300 rounded-xl overflow-hidden hover:border-primary-400 transition-colors cursor-pointer block">
                <input
                  type="file"
                  accept="image/*,video/*,application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {uploadFile && uploadPreviewUrl ? (
                  <div>
                    {/* 预览区域 */}
                    <div className="bg-gray-100 aspect-video flex items-center justify-center relative overflow-hidden">
                        {uploadFile.type.startsWith('image/') ? (
                          <img
                            src={uploadPreviewUrl}
                            alt="预览"
                            className="w-full h-full object-contain"
                          />
                        ) : uploadFile.type.startsWith('video/') ? (
                          <video
                            src={uploadPreviewUrl}
                            className="w-full h-full object-contain"
                            controls
                          />
                        ):(
                          <iframe
                            src={uploadPreviewUrl}
                            className="w-full h-full border-0"
                            title="PDF Preview"
                          />
                        )}
                      </div>
                    {/* 文件信息 */}
                    <div className="p-4 bg-white">
                      <p className="text-primary-600 font-medium mb-1">{uploadFile.name}</p>
                      <p className="text-sm text-gray-500">
                        {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-12 text-center">
                    <Upload size={48} className="mx-auto text-gray-400 mb-4" />
                    <p className="text-gray-700 font-medium mb-1">
                      点击选择文件
                    </p>
                    <p className="text-sm text-gray-500">
                      支持 JPG、PNG、MP4、PDF、格式，单个文件不超过 100MB
                    </p>
                  </div>
                )}
              </label>
            </div>

            {/* 标题输入 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                标题 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="例如：学校宣传片、新政策介绍"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* 描述输入 */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                备注
              </label>
              <textarea
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder="添加一些备注信息..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowUploader(false);
                  setUploadFile(null);
                  setUploadPreviewUrl(null);
                  setUploadTitle('');
                  setUploadDescription('');
                }}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                disabled={uploading}
              >
                取消
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading || !uploadFile || !uploadTitle.trim()}
                className="flex-1 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? '上传中...' : '开始上传'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast 提示 */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 animate-fade-in">
          <div
            className={`px-6 py-3 rounded-lg shadow-lg text-white ${
              toast.type === 'success'
                ? 'bg-green-600'
                : toast.type === 'error'
                ? 'bg-red-600'
                : 'bg-yellow-600'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
      </div>
    </>
  );
};
