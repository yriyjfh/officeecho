import React, { useState, useEffect } from 'react';
import {
  MessageCircle,
  Image as ImageIcon,
} from 'lucide-react';
import { MetricCard } from '../components/MetricCard';
import { VideoPlayer } from '../components/VideoPlayer';
import * as mediaService from '../services/mediaService';
import { getApiBaseUrl } from '../../config/api';

/**
 * 管理端 Dashboard - 今天概览
 * 手机浏览器优化 - 单列布局，紧凑显示
 * 一页看完今天所有重要信息
 */

interface DashboardProps {
  onNavigate?: (page: 'interaction' | 'messages' | 'care' | 'alerts' | 'media' | 'mood') => void;
}

interface ChatMessage {
  username: string;
  is_adopted: number;
  type: 'fay' | 'member';
  way: string;
  content: string;
  createtime: number;
  timetext: string;
}

const familyId = 'family_001';

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [, setIsVideoFullscreen] = useState(false);
  const [todayInteractionCount, setTodayInteractionCount] = useState(0);
  const [recentPlays, setRecentPlays] = useState<mediaService.RecentPlay[]>([]);

  // 加载今日交互次数（通过 app.py 转发获取 Fay 聊天记录）
  const loadTodayInteractionCount = async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/fay/chat-history`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: 'User', limit: 300 }),
      });

      if (response.ok) {
        const data = await response.json();
        const messages: ChatMessage[] = data.list || [];

        // 获取今天的开始时间戳（00:00:00）
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = Math.floor(today.getTime() / 1000);

        // 统计今天学生说的话（type === 'member'）
        const todayMemberMessages = messages.filter(
          msg => msg.type === 'member' && msg.createtime >= todayTimestamp
        );

        setTodayInteractionCount(todayMemberMessages.length);
      }
    } catch (error) {
      console.error('获取今日交互次数失败:', error);
      // 失败时保持为0，不影响页面显示
    }
  };

  // 加载最近播放
  const loadRecentPlays = async () => {
    try {
      const plays = await mediaService.getRecentPlays(familyId, 2);
      setRecentPlays(plays);
    } catch (error) {
      console.error('加载最近播放失败:', error);
    }
  };

  useEffect(() => {
    loadTodayInteractionCount();
    loadRecentPlays();
    // 每30秒刷新一次
    const interval = setInterval(() => {
      loadTodayInteractionCount();
      loadRecentPlays();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // 格式化播放时间
  const formatPlayTime = (playedAt: string) => {
    const playTime = new Date(playedAt);
    const now = new Date();
    const diffMs = now.getTime() - playTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;

    return playTime.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  };


  return (
    <div className="min-h-screen bg-gray-50">
      {/* 主要内容区 - 手机优化 */}
      <div className="px-4 py-4">
        {/* 实时监控视频 */}
        <div className="card p-0 mb-4 overflow-hidden">
          <VideoPlayer
            familyId={familyId}
            onFullscreenChange={setIsVideoFullscreen}
          />
        </div>


        {/* 关键指标卡片 - 手机单列布局 */}
        <div className="grid grid-cols-1 gap-3 mb-4">
          <MetricCard
            title="今日交互"
            value={`${todayInteractionCount}次`}
            subtitle="学生与数字人对话"
            icon={MessageCircle}
            color="blue"
            onClick={() => onNavigate?.('interaction')}
          />
        </div>

        {/* 最近播放 - 手机优化 */}
        <div className="card p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-bold text-gray-900">最近播放</h3>
            <button
              onClick={() => onNavigate?.('media')}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              全部
            </button>
          </div>
          {recentPlays.length > 0 ? (
            <div className="space-y-3">
              {recentPlays.map((media) => (
                <div
                  key={media.id}
                  className="flex gap-3 p-3 rounded-lg border border-gray-200 active:bg-primary-50 transition-colors"
                >
                  <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {media.thumbnail_path ? (
                      <img
                        src={mediaService.getThumbnailUrl(media.thumbnail_path)}
                        alt={media.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <ImageIcon size={24} className="text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 mb-1 truncate">
                      {media.title}
                    </h4>
                    <p className="text-xs text-gray-500 mb-2">{formatPlayTime(media.played_at)}</p>
                    {/* <div className="flex items-center gap-3 text-xs">
                      <span className="text-green-600">👍 {media.likes}</span>
                      <span className="text-red-600">👎 {media.dislikes}</span>
                    </div> */}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">还没有播放记录</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
