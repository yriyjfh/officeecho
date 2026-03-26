import React, { useState, useEffect } from 'react';
import * as scheduleService from '../services/scheduleService';

/**
 * 简化的调试版本 - 用于排查问题
 */
export const CarePlanDebug: React.FC = () => {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const familyId = 'family_001';

  useEffect(() => {
    loadSchedules();
  }, []);

  const loadSchedules = async () => {
    try {
      console.log('[DEBUG] 开始加载课表');
      setLoading(true);
      setError(null);

      const data = await scheduleService.getFamilySchedules(familyId);
      console.log('[DEBUG] 加载成功，数据:', data);

      setSchedules(data);
    } catch (err: any) {
      console.error('[DEBUG] 加载失败:', err);
      setError(err.message || '未知错误');
    } finally {
      setLoading(false);
      console.log('[DEBUG] 加载完成');
    }
  };

  console.log('[DEBUG] 渲染状态:', { loading, error, schedulesCount: schedules.length });

  if (loading) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>加载中...</h1>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h1>错误</h1>
        <p>{error}</p>
        <button onClick={loadSchedules}>重试</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>护理计划调试版</h1>
      <p>课表数量: {schedules.length}</p>

      <h2>原始数据:</h2>
      <pre style={{ background: '#f5f5f5', padding: '10px', overflow: 'auto' }}>
        {JSON.stringify(schedules, null, 2)}
      </pre>

      <h2>课表列表:</h2>
      <ul>
        {schedules.map((schedule, index) => (
          <li key={index}>
            <strong>{schedule.title}</strong> - {schedule.schedule_time}
            <br />
            类型: {schedule.schedule_type}, 激活: {schedule.is_active ? '是' : '否'}
          </li>
        ))}
      </ul>

      <button onClick={loadSchedules} style={{ marginTop: '20px', padding: '10px 20px' }}>
        刷新数据
      </button>
    </div>
  );
};

export default CarePlanDebug;
