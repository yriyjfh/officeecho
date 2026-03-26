import React, { useState } from 'react';
import {
  X,
  User,
  Calendar,
  Brain,
  Eye,
  Ear,
  Music,
  AlertCircle,
  Heart,
  Edit3,
  Save,
  Plus,
  // Trash2,
} from 'lucide-react';

/**
 * 学生个人信息弹窗（带编辑功能）
 */

interface ElderInfo {
  name: string;
  age: number;
  cognitive_status: 'normal' | 'mild' | 'moderate' | 'severe';
  hearing_vision: {
    hearing: 'ok' | 'mild_loss' | 'moderate_loss' | 'severe_loss';
    vision: 'ok' | 'mild_loss' | 'moderate_loss' | 'severe_loss';
  };
  preferences: {
    music: string[];
    avoid_topics: string[];
  };
}

interface ElderProfileProps {
  elderInfo: ElderInfo;
  onClose: () => void;
  onSave?: (updatedInfo: ElderInfo) => void;
}

export const ElderProfile: React.FC<ElderProfileProps> = ({
  elderInfo,
  onClose,
  onSave,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedInfo, setEditedInfo] = useState<ElderInfo>(elderInfo);
  const [newInterest, setNewInterest] = useState('');
  const [newAvoidTopic, setNewAvoidTopic] = useState('');

  const getCognitiveStatusLabel = (status: string) => {
    switch (status) {
      case 'normal':
        return '正常';
      case 'mild':
        return '轻度认知障碍';
      case 'moderate':
        return '中度认知障碍';
      case 'severe':
        return '重度认知障碍';
      default:
        return status;
    }
  };

  const getCognitiveStatusColor = (status: string) => {
    switch (status) {
      case 'normal':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'mild':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'moderate':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'severe':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getHealthStatusLabel = (status: string) => {
    switch (status) {
      case 'ok':
        return '正常';
      case 'mild_loss':
        return '轻度下降';
      case 'moderate_loss':
        return '中度下降';
      case 'severe_loss':
        return '重度下降';
      default:
        return status;
    }
  };

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'ok':
        return 'text-green-600';
      case 'mild_loss':
        return 'text-yellow-600';
      case 'moderate_loss':
        return 'text-orange-600';
      case 'severe_loss':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const handleSave = () => {
    if (onSave) {
      onSave(editedInfo);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedInfo(elderInfo);
    setIsEditing(false);
  };

  const addInterest = () => {
    if (newInterest.trim()) {
      setEditedInfo({
        ...editedInfo,
        preferences: {
          ...editedInfo.preferences,
          music: [...editedInfo.preferences.music, newInterest.trim()],
        },
      });
      setNewInterest('');
    }
  };

  const removeInterest = (index: number) => {
    setEditedInfo({
      ...editedInfo,
      preferences: {
        ...editedInfo.preferences,
        music: editedInfo.preferences.music.filter((_, i) => i !== index),
      },
    });
  };

  const addAvoidTopic = () => {
    if (newAvoidTopic.trim()) {
      setEditedInfo({
        ...editedInfo,
        preferences: {
          ...editedInfo.preferences,
          avoid_topics: [...editedInfo.preferences.avoid_topics, newAvoidTopic.trim()],
        },
      });
      setNewAvoidTopic('');
    }
  };

  const removeAvoidTopic = (index: number) => {
    setEditedInfo({
      ...editedInfo,
      preferences: {
        ...editedInfo.preferences,
        avoid_topics: editedInfo.preferences.avoid_topics.filter((_, i) => i !== index),
      },
    });
  };

  const currentInfo = isEditing ? editedInfo : elderInfo;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="bg-gradient-to-br from-primary-500 to-primary-600 p-6 flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center flex-shrink-0">
              <User size={32} className="text-primary-600" />
            </div>
            <div className="text-white flex-1 min-w-0">
              {isEditing ? (
                <input
                  type="text"
                  value={editedInfo.name}
                  onChange={(e) =>
                    setEditedInfo({ ...editedInfo, name: e.target.value })
                  }
                  className="text-2xl font-bold bg-white/20 rounded-lg px-3 py-1 w-full text-white placeholder-white/70"
                  placeholder="姓名"
                />
              ) : (
                <h2 className="text-2xl font-bold">{currentInfo.name}</h2>
              )}
              <div className="flex items-center gap-1 mt-1">
                <Calendar size={16} className="flex-shrink-0" />
                {isEditing ? (
                  <input
                    type="number"
                    value={editedInfo.age}
                    onChange={(e) =>
                      setEditedInfo({ ...editedInfo, age: parseInt(e.target.value) || 0 })
                    }
                    className="bg-white/20 rounded px-2 py-0.5 w-16 text-primary-100"
                  />
                ) : (
                  <span className="text-primary-100">{currentInfo.age} 岁</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-full p-2 transition-colors flex-shrink-0"
          >
            <X size={24} />
          </button>
        </div>

        {/* 内容区 - 可滚动 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 认知状态 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Brain size={20} className="text-primary-600" />
              <h3 className="text-base font-bold text-gray-900">认知状态</h3>
            </div>
            {isEditing ? (
              <div className="grid grid-cols-2 gap-2">
                {(['normal', 'mild', 'moderate', 'severe'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() =>
                      setEditedInfo({ ...editedInfo, cognitive_status: status })
                    }
                    className={`px-4 py-2 rounded-full text-sm font-medium border-2 transition-colors ${
                      editedInfo.cognitive_status === status
                        ? getCognitiveStatusColor(status)
                        : 'bg-gray-50 text-gray-600 border-gray-200'
                    }`}
                  >
                    {getCognitiveStatusLabel(status)}
                  </button>
                ))}
              </div>
            ) : (
              <div
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${getCognitiveStatusColor(
                  currentInfo.cognitive_status
                )}`}
              >
                <span className="font-medium">
                  {getCognitiveStatusLabel(currentInfo.cognitive_status)}
                </span>
              </div>
            )}
          </div>

          {/* 听力与视力 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Heart size={20} className="text-primary-600" />
              <h3 className="text-base font-bold text-gray-900">健康状况</h3>
            </div>
            <div className="space-y-3">
              {/* 听力 */}
              <div className="p-3 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Ear size={18} className="text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">听力</span>
                </div>
                {isEditing ? (
                  <select
                    value={editedInfo.hearing_vision.hearing}
                    onChange={(e) =>
                      setEditedInfo({
                        ...editedInfo,
                        hearing_vision: {
                          ...editedInfo.hearing_vision,
                          hearing: e.target.value as any,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="ok">正常</option>
                    <option value="mild_loss">轻度下降</option>
                    <option value="moderate_loss">中度下降</option>
                    <option value="severe_loss">重度下降</option>
                  </select>
                ) : (
                  <span
                    className={`text-sm font-medium ${getHealthStatusColor(
                      currentInfo.hearing_vision.hearing
                    )}`}
                  >
                    {getHealthStatusLabel(currentInfo.hearing_vision.hearing)}
                  </span>
                )}
              </div>

              {/* 视力 */}
              <div className="p-3 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Eye size={18} className="text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">视力</span>
                </div>
                {isEditing ? (
                  <select
                    value={editedInfo.hearing_vision.vision}
                    onChange={(e) =>
                      setEditedInfo({
                        ...editedInfo,
                        hearing_vision: {
                          ...editedInfo.hearing_vision,
                          vision: e.target.value as any,
                        },
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="ok">正常</option>
                    <option value="mild_loss">轻度下降</option>
                    <option value="moderate_loss">中度下降</option>
                    <option value="severe_loss">重度下降</option>
                  </select>
                ) : (
                  <span
                    className={`text-sm font-medium ${getHealthStatusColor(
                      currentInfo.hearing_vision.vision
                    )}`}
                  >
                    {getHealthStatusLabel(currentInfo.hearing_vision.vision)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 兴趣偏好 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Music size={20} className="text-primary-600" />
              <h3 className="text-base font-bold text-gray-900">兴趣偏好</h3>
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {currentInfo.preferences.music.map((item, index) => (
                <span
                  key={index}
                  className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-sm font-medium flex items-center gap-1"
                >
                  {item}
                  {isEditing && (
                    <button
                      onClick={() => removeInterest(index)}
                      className="ml-1 hover:bg-blue-100 rounded-full p-0.5"
                    >
                      <X size={14} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {isEditing && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newInterest}
                  onChange={(e) => setNewInterest(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addInterest()}
                  placeholder="添加兴趣（如：唱歌、下棋）"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <button
                  onClick={addInterest}
                  className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            )}
          </div>

          {/* 避免话题 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={20} className="text-primary-600" />
              <h3 className="text-base font-bold text-gray-900">避免话题</h3>
            </div>
            {currentInfo.preferences.avoid_topics.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {currentInfo.preferences.avoid_topics.map((item, index) => (
                  <span
                    key={index}
                    className="px-3 py-1.5 bg-red-50 text-red-700 rounded-full text-sm font-medium flex items-center gap-1"
                  >
                    {item}
                    {isEditing && (
                      <button
                        onClick={() => removeAvoidTopic(index)}
                        className="ml-1 hover:bg-red-100 rounded-full p-0.5"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            {isEditing && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newAvoidTopic}
                  onChange={(e) => setNewAvoidTopic(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addAvoidTopic()}
                  placeholder="添加避免话题"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <button
                  onClick={addAvoidTopic}
                  className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="p-4 border-t">
          {isEditing ? (
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="flex-1 py-3 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Save size={20} />
                保存
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setIsEditing(true)}
                className="flex-1 py-3 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Edit3 size={20} />
                编辑
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-xl transition-colors"
              >
                关闭
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
