import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface TrendChartProps {
  title: string;
  data: Array<{
    date: string;
    value: number;
    label?: string;
  }>;
  dataKey?: string;
  color?: string;
  height?: number;
}

/**
 * 趋势图表组件
 * 用于展示情绪、用药依从性等趋势
 */
export const TrendChart: React.FC<TrendChartProps> = ({
  title,
  data,
  dataKey = 'value',
  color = '#1890ff',
  height = 300,
}) => {
  return (
    <div className="card p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#666', fontSize: 12 }}
            tickLine={{ stroke: '#e0e0e0' }}
          />
          <YAxis
            tick={{ fill: '#666', fontSize: 12 }}
            tickLine={{ stroke: '#e0e0e0' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              padding: '8px 12px',
            }}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={3}
            dot={{ fill: color, r: 5 }}
            activeDot={{ r: 7 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
