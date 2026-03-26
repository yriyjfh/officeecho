import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { Dashboard } from './pages/Dashboard';
import { MediaLibrary } from './pages/MediaLibrary';
import { WhiteboardManager } from './pages/WhiteboardManager';
import { CarePlan } from './pages/CarePlan';
import { AlertsAndCare } from './pages/AlertsAndCare';
import { InteractionHistory } from './pages/InteractionHistory';
import { FamilyMessages } from './pages/FamilyMessages';
import { MoodHistory } from './pages/MoodHistory';
import { ElderProfile } from './components/ElderProfile';
import { EmergencyAlert } from './components/EmergencyAlert';
import * as messageService from './services/messageService';
import * as visitorService from './services/visitorService';
import {
  LayoutDashboard,
  MessageSquare,
  Briefcase,
  Phone,
  MessageCircle,
  Image,
  PenSquare,
  // Smile,
} from 'lucide-react';
import '../index.css';

type Page = 'dashboard' | 'messages' | 'care' | 'alerts' | 'interaction' | 'media' | 'mood' | 'whiteboard';

/**
 * 管理端应用
 * 优化为手机浏览器使用 - 底部标签栏导航
 */
function FamilyApp() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [showElderProfile, setShowElderProfile] = useState(false);
  const [unhandledCount, setUnhandledCount] = useState(0);
  const [emergencyAlert, setEmergencyAlert] = useState<{
    id: number;
    message: string;
    timestamp: string;
  } | null>(null);
  const [shownEmergencyIds, setShownEmergencyIds] = useState<Set<number>>(new Set());
  const familyId = 'family_001'; // 实际使用时从用户上下文获取

  // 学生信息数据
  const [elderInfo, setElderInfo] = useState({
    name: '学生',
    age: 0,
    cognitive_status: 'normal' as 'normal' | 'mild' | 'moderate' | 'severe',
    hearing_vision: {
      hearing: 'ok' as 'ok' | 'mild_loss' | 'moderate_loss' | 'severe_loss',
      vision: 'ok' as 'ok' | 'mild_loss' | 'moderate_loss' | 'severe_loss',
    },
    preferences: {
      music: [] as string[],
      avoid_topics: [] as string[],
    },
  });

  // 加载学生信息
  const loadVisitorInfo = async () => {
    try {
      const visitor = await visitorService.getVisitorInfo();
      const converted = visitorService.convertFromApiFormat(visitor);
      setElderInfo(converted);
    } catch (error) {
      console.error('加载学生信息失败:', error);
    }
  };

  // 加载未处理通知数量
  const loadUnhandledCount = async () => {
    try {
      const stats = await messageService.getAlertStats(familyId);
      setUnhandledCount(stats.status_stats?.unhandled || 0);
    } catch (error) {
      console.error('加载未处理通知数量失败:', error);
    }
  };

  // 检查是否有新的紧急求助通知
  const checkEmergencyAlerts = async () => {
    try {
      const { alerts } = await messageService.getFamilyAlerts(familyId, {
        alert_type: 'urgent_help',
        handled: false,
        limit: 1,
      });

      if (alerts.length > 0) {
        const latestAlert = alerts[0];
        // 只显示未展示过的紧急通知
        if (!shownEmergencyIds.has(latestAlert.id)) {
          setEmergencyAlert({
            id: latestAlert.id,
            message: latestAlert.message,
            timestamp: new Date(latestAlert.created_at).toLocaleString('zh-CN', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            }),
          });
          // 记录已显示的通知ID
          setShownEmergencyIds(prev => new Set(prev).add(latestAlert.id));
        }
      }
    } catch (error) {
      console.error('检查紧急通知失败:', error);
    }
  };

  // 初始化加载
  useEffect(() => {
    loadVisitorInfo();
    loadUnhandledCount();
    checkEmergencyAlerts();
    // 每5秒检查一次通知
    const interval = setInterval(() => {
      loadUnhandledCount();
      checkEmergencyAlerts();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // 保存学生信息
  const handleSaveElderInfo = async (updatedInfo: any) => {
    try {
      // 转换为后端 API 格式并保存
      const apiData = visitorService.convertToApiFormat(updatedInfo);
      await visitorService.updateVisitorInfo(apiData);
      // 更新本地状态
      setElderInfo(updatedInfo);
      console.log('学生信息已保存到数据库');
    } catch (error) {
      console.error('保存学生信息失败:', error);
      alert('保存失败，请重试');
    }
  };

  const navigation = [
    { id: 'dashboard' as const, label: '概览', shortLabel: '概览', icon: LayoutDashboard },
    { id: 'messages' as const, label: '辅导员通知', shortLabel: '通知', icon: MessageSquare },
    { id: 'media' as const, label: '文件库', shortLabel: '文件', icon: Image },
    
    // { id: 'whiteboard' as const, label: '白板', shortLabel: '白板', icon: PenSquare },
    { id: 'care' as const, label: '日常计划', shortLabel: '计划', icon: Briefcase },
    { id: 'alerts' as const, label: '联系', shortLabel: '联系', icon: Phone },
    { id: 'interaction' as const, label: '交互记录', shortLabel: '交互', icon: MessageCircle },
  ];

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={setCurrentPage} />;
      case 'messages':
        return <FamilyMessages />;
      case 'media':
        return <MediaLibrary />;
      // case 'whiteboard':
      //   return <WhiteboardManager />;
      case 'mood':
        return <MoodHistory />;
      case 'care':
        return <CarePlan />;
      case 'alerts':
        return <AlertsAndCare />;
      case 'interaction':
        return <InteractionHistory />;
      default:
        return <Dashboard onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* 顶部标题栏 - 手机优化 */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between flex-shrink-0 safe-area-top">
        <div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg font-bold text-primary-600">辅导员</h1>
            <span className="text-xs text-gray-500 font-medium">数字人</span>
          </div>
          <p className="text-xs text-gray-400 italic mt-0.5">
            让每个同学都能得到答案
          </p>
        </div>
        <button
          onClick={() => setShowElderProfile(true)}
          className="px-3 py-1.5 bg-primary-50 hover:bg-primary-100 rounded-full transition-colors flex items-center gap-2"
        >
          <span className="text-primary-700 text-sm font-bold">
            {elderInfo.name}
          </span>
        </button>
      </div>

      {/* 主要内容区 - 可滚动 */}
      <div className="flex-1 overflow-y-auto pb-safe">{renderPage()}</div>

      {/* 底部标签栏导航 - 手机原生风格 */}
      <nav className="bg-white border-t flex items-center justify-around flex-shrink-0 safe-area-bottom">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          const showBadge = item.id === 'alerts' && unhandledCount > 0;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`
                flex-1 flex flex-col items-center justify-center py-2 px-1 transition-colors
                ${isActive ? 'text-primary-600' : 'text-gray-500'}
              `}
            >
              <div className="relative">
                <Icon
                  size={24}
                  strokeWidth={isActive ? 2.5 : 2}
                  className="mb-1"
                />
                {showBadge && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                )}
              </div>
              <span className={`text-xs ${isActive ? 'font-semibold' : 'font-normal'}`}>
                {item.shortLabel}
              </span>
            </button>
          );
        })}
      </nav>

      {/* 学生信息弹窗 */}
      {showElderProfile && (
        <ElderProfile
          elderInfo={elderInfo}
          onClose={() => setShowElderProfile(false)}
          onSave={handleSaveElderInfo}
        />
      )}

      {/* 紧急通知弹窗 */}
      {emergencyAlert && (
        <EmergencyAlert
          message={emergencyAlert.message}
          timestamp={emergencyAlert.timestamp}
          onHandle={async () => {
            // 标记为已处理
            await messageService.handleAlert(emergencyAlert.id);
            // 关闭弹窗
            setEmergencyAlert(null);
            // 跳转到通知页面
            setCurrentPage('alerts');
            // 刷新未处理数量
            loadUnhandledCount();
          }}
        />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FamilyApp />
  </React.StrictMode>
);
