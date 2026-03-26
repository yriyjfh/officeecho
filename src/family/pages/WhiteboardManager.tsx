import React, { useEffect, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import * as whiteboardService from '../services/whiteboardService';

export const WhiteboardManager: React.FC = () => {
  const familyId = 'family_001';
  const [whiteboards, setWhiteboards] = useState<whiteboardService.WhiteboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWhiteboards = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await whiteboardService.listWhiteboards(familyId);
      setWhiteboards(list);
    } catch (err) {
      console.error('[WhiteboardManager] 获取白板失败:', err);
      setError(err instanceof Error ? err.message : '获取失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWhiteboards();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除该白板吗？')) return;
    try {
      await whiteboardService.deleteWhiteboard(id);
      await loadWhiteboards();
    } catch (err) {
      console.error('[WhiteboardManager] 删除失败:', err);
      alert('删除失败，请稍后重试');
    }
  };

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-800">白板管理</h2>
        <button
          onClick={loadWhiteboards}
          className="px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-sm text-gray-700"
        >
          刷新
        </button>
      </div>

      {loading && <div className="text-sm text-gray-500">加载中...</div>}
      {error && <div className="text-sm text-red-500">{error}</div>}

      {!loading && whiteboards.length === 0 && (
        <div className="text-sm text-gray-400">暂无白板记录</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {whiteboards.map((board) => {
          const url = board.file_path ? whiteboardService.getWhiteboardUrl(board.file_path) : '';
          const fileName = board.file_path?.split('/').pop() || `whiteboard_${board.id}.png`;
          return (
            <div key={board.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <div className="bg-gray-100 h-40 flex items-center justify-center">
                {url ? (
                  <img src={url} alt={`白板 ${board.id}`} className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-gray-400">未保存</span>
                )}
              </div>
              <div className="p-3 flex items-center justify-between">
                <div className="text-xs text-gray-600">
                  <div>#{board.id}</div>
                  <div>{board.created_at ? board.created_at.slice(0, 16).replace('T', ' ') : ''}</div>
                </div>
                <div className="flex items-center gap-2">
                  {url && (
                    <a
                      href={url}
                      download={fileName}
                      className="p-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600"
                      title="下载"
                    >
                      <Download size={18} />
                    </a>
                  )}
                  <button
                    onClick={() => handleDelete(board.id)}
                    className="p-2 rounded-lg bg-red-50 hover:bg-red-100 text-red-600"
                    title="删除"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
