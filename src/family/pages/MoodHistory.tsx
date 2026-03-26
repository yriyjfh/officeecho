import React, { useState, useEffect } from 'react';
import {
  Calendar,
  TrendingUp,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import * as moodService from '../services/moodService';

/**
 * 情绪记录历史页面
 * 展示学生的情绪记录和统计数据
 */
export const MoodHistory: React.FC = () => {
  const [records, setRecords] = useState<moodService.MoodRecord[]>([]);
  const [stats, setStats] = useState<moodService.MoodStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDays, setSelectedDays] = useState(7);
  const [showDaysDropdown, setShowDaysDropdown] = useState(false);
  const familyId = 'family_001';

  // 加载数据
  const loadData = async () => {
    setLoading(true);
    try {
      const [recordsData, statsData] = await Promise.all([
        moodService.getFamilyMoods(familyId, { limit: 50 }),
        moodService.getMoodStats(familyId, { days: selectedDays }),
      ]);
      setRecords(recordsData.records);
      setStats(statsData);
    } catch (error) {
      console.error('加载情绪数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDays]);

  const daysOptions = [
    { value: 7, label: '最近7天' },
    { value: 14, label: '最近14天' },
    { value: 30, label: '最近30天' },
  ];

  return (
    <div className="p-4 space-y-4">
      {/* 页面标题和刷新 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">情绪记录</h2>
        <div className="flex items-center gap-2">
          {/* 时间范围选择 */}
          <div className="relative">
            <button
              onClick={() => setShowDaysDropdown(!showDaysDropdown)}
              className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 rounded-lg text-sm"
            >
              <Calendar size={14} />
              {daysOptions.find(o => o.value === selectedDays)?.label}
              <ChevronDown size={14} />
            </button>
            {showDaysDropdown && (
              <div className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg z-10">
                {daysOptions.map(option => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setSelectedDays(option.value);
                      setShowDaysDropdown(false);
                    }}
                    className={`block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                      selectedDays === option.value ? 'bg-primary-50 text-primary-600' : ''
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={loadData}
            className="p-1.5 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <RefreshCw className="animate-spin text-gray-400" size={24} />
        </div>
      ) : (
        <>
          {/* 统计卡片 */}
          {stats && (
            <div className="grid grid-cols-2 gap-3">
              {/* 整体统计 */}
              <div className="bg-white rounded-xl p-4 border">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={16} className="text-primary-500" />
                  <span className="text-sm font-medium text-gray-600">平均情绪</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-2xl font-bold"
                    style={{ color: moodService.getMoodScoreColor(stats.overall.avg_score) }}
                  >
                    {stats.overall.avg_score}
                  </span>
                  <span className="text-sm text-gray-500">/ 10</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {moodService.formatMoodScore(stats.overall.avg_score)}
                </p>
              </div>

              {/* 今日记录 */}
              <div className="bg-white rounded-xl p-4 border">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar size={16} className="text-blue-500" />
                  <span className="text-sm font-medium text-gray-600">今日记录</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-gray-900">
                    {stats.today_count}
                  </span>
                  <span className="text-sm text-gray-500">次</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  共 {stats.overall.total_records} 条记录
                </p>
              </div>
            </div>
          )}

          {/* 情绪类型分布 */}
          {stats && stats.mood_type_stats.length > 0 && (
            <div className="bg-white rounded-xl p-4 border">
              <h3 className="text-sm font-medium text-gray-600 mb-3">情绪分布</h3>
              <div className="space-y-2">
                {stats.mood_type_stats.map(stat => (
                  <div key={stat.mood_type} className="flex items-center gap-3">
                    <span className="text-lg">
                      {moodService.moodEmojiMap[stat.mood_type]}
                    </span>
                    <span className="text-sm text-gray-700 w-12">
                      {moodService.moodLabelMap[stat.mood_type]}
                    </span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(stat.count / stats.overall.total_records) * 100}%`,
                          backgroundColor: moodService.moodColorMap[stat.mood_type],
                        }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-8 text-right">
                      {stat.count}次
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 历史记录列表 */}
          <div className="bg-white rounded-xl border">
            <div className="p-4 border-b">
              <h3 className="text-sm font-medium text-gray-600">历史记录</h3>
            </div>
            {records.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p>暂无情绪记录</p>
              </div>
            ) : (
              <div className="divide-y max-h-96 overflow-y-auto">
                {records.map(record => (
                  <div key={record.id} className="p-4 flex items-center gap-3">
                    <span className="text-2xl">
                      {moodService.moodEmojiMap[record.mood_type]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {moodService.moodLabelMap[record.mood_type]}
                        </span>
                        <span
                          className="px-1.5 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: `${moodService.getMoodScoreColor(record.mood_score)}20`,
                            color: moodService.getMoodScoreColor(record.mood_score),
                          }}
                        >
                          {record.mood_score}分
                        </span>
                      </div>
                      {record.note && (
                        <p className="text-sm text-gray-500 truncate mt-0.5">
                          {record.note}
                        </p>
                      )}
                      {record.trigger_event && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          触发: {record.trigger_event}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">
                        {record.recorded_at && moodService.formatRecordTime(record.recorded_at)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {record.source === 'manual' ? '手动' : record.source === 'ai_detect' ? 'AI' : '语音'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
