import React, { useState } from 'react';
import { Plus, Edit2, Trash2, X, Clock, AlertCircle } from 'lucide-react';

interface Medication {
  id: string;
  name: string;
  dosage: string;
  route: string;
  times: string[];
  withFood: boolean;
  gracePeriod: number;
  active: boolean;
}

/**
 * 管理端用药计划界面
 * 管理学生的用药提醒
 */
export const MedicationPlan: React.FC = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);

  // 模拟数据
  const medications: Medication[] = [
    {
      id: '1',
      name: '氯沙坦',
      dosage: '50mg',
      route: '口服',
      times: ['08:00', '20:00'],
      withFood: true,
      gracePeriod: 30,
      active: true,
    },
    {
      id: '2',
      name: '二甲双胍',
      dosage: '500mg',
      route: '口服',
      times: ['08:00', '12:00', '18:00'],
      withFood: true,
      gracePeriod: 30,
      active: true,
    },
    {
      id: '3',
      name: '阿司匹林',
      dosage: '100mg',
      route: '口服',
      times: ['21:00'],
      withFood: false,
      gracePeriod: 60,
      active: true,
    },
  ];

  const handleEdit = (med: Medication) => {
    setEditingMed(med);
    setShowForm(true);
  };

  const handleDelete = (medId: string) => {
    if (confirm('确定要删除这个用药计划吗？')) {
      console.log('Delete medication:', medId);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">用药计划</h1>
            <button
              onClick={() => {
                setEditingMed(null);
                setShowForm(true);
              }}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
            >
              <Plus size={18} />
              添加药品
            </button>
          </div>
        </div>
      </div>

      {/* 主要内容区 */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* 用药列表 */}
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                  药品名称
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                  剂量/用法
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                  服用时间
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                  要求
                </th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                  状态
                </th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-gray-900">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {medications.map((med) => (
                <tr key={med.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{med.name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-700">
                      {med.dosage} · {med.route}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      {med.times.map((time, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-blue-50 text-blue-700 text-sm rounded flex items-center gap-1"
                        >
                          <Clock size={14} />
                          {time}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      {med.withFood && (
                        <div className="text-sm text-gray-600">随餐服用</div>
                      )}
                      <div className="text-sm text-gray-500">
                        宽限 {med.gracePeriod} 分钟
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        med.active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {med.active ? '启用中' : '已暂停'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(med)}
                        className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded-lg transition-colors"
                        aria-label="编辑"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(med.id)}
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded-lg transition-colors"
                        aria-label="删除"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 提示信息 */}
        <div className="mt-6 bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg">
          <div className="flex items-start">
            <AlertCircle className="text-blue-600 mt-0.5 mr-3 flex-shrink-0" size={20} />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">用药安全提示</p>
              <ul className="list-disc list-inside space-y-1 text-blue-700">
                <li>请确保用药时间不冲突</li>
                <li>超过宽限期未确认服药将自动发送通知给您</li>
                <li>如需调整用药时间请及时更新提醒设置</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 编辑/添加表单抽屉 */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-end animate-fade-in">
          <div className="bg-white w-full max-w-2xl h-full overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {editingMed ? '编辑用药' : '添加用药'}
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* 药品名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  药品名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="例如：氯沙坦"
                  defaultValue={editingMed?.name}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* 剂量 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  剂量 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="例如：50mg"
                  defaultValue={editingMed?.dosage}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* 给药途径 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  给药途径
                </label>
                <select
                  defaultValue={editingMed?.route}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option>口服</option>
                  <option>外用</option>
                  <option>注射</option>
                </select>
              </div>

              {/* 服用时间 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  每日服用时间 <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  {(editingMed?.times || ['08:00']).map((time, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="time"
                        defaultValue={time}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                      <button className="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                        <X size={20} />
                      </button>
                    </div>
                  ))}
                  <button className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                    <Plus size={16} />
                    添加时间点
                  </button>
                </div>
              </div>

              {/* 随餐服用 */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={editingMed?.withFood}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">需要随餐服用</span>
                </label>
              </div>

              {/* 宽限期 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  宽限期（分钟）
                </label>
                <select
                  defaultValue={editingMed?.gracePeriod}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="15">15 分钟</option>
                  <option value="30">30 分钟</option>
                  <option value="60">60 分钟</option>
                  <option value="120">120 分钟</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  超过宽限期未确认服药将发送通知
                </p>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3 pt-6 border-t">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button className="flex-1 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium">
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
