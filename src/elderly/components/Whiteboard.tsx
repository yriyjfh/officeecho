import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, PenSquare, Eraser, Palette, Save, Plus, RotateCw, Trash2 } from 'lucide-react';
import * as whiteboardService from '../services/whiteboardService';

interface WhiteboardProps {
  familyId: string;
  onClose: () => void;
  orientationMode?: 'portrait' | 'landscape';
  onToggleOrientation?: () => void;
}

const PEN_SIZE = 6;
const ERASER_SIZE = 22;
const COLORS = ['#111827', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
const AUTOSAVE_INTERVAL_MS = 60000;
const DESIGN_WIDTH = 1080;
const DESIGN_HEIGHT = 1920;

export const Whiteboard: React.FC<WhiteboardProps> = ({
  familyId,
  onClose,
  orientationMode,
  onToggleOrientation,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const scaleRef = useRef(1);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const isDirtyRef = useRef(false);
  const isSavingRef = useRef(false);
  const isMountedRef = useRef(true);
  const isClosingRef = useRef(false);
  const savingPromiseRef = useRef<Promise<boolean> | null>(null);

  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [whiteboards, setWhiteboards] = useState<whiteboardService.WhiteboardItem[]>([]);
  const [currentBoard, setCurrentBoard] = useState<whiteboardService.WhiteboardItem | null>(null);
  const [saveAsNew, setSaveAsNew] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const orientationToggleLabel =
    orientationMode === 'portrait' ? '横屏' : orientationMode === 'landscape' ? '竖屏' : null;
  const isLandscape = orientationMode === 'landscape';
  const panelClass = isLandscape ? 'w-full h-full max-w-none' : 'w-full h-full max-w-6xl';
  const wrapperPaddingClass = isLandscape ? 'p-0' : 'p-6';
  const panelFrameClass = isLandscape ? 'rounded-none shadow-none' : 'rounded-3xl shadow-2xl';

  const stageWidth = isLandscape ? DESIGN_HEIGHT : DESIGN_WIDTH;
  const stageHeight = isLandscape ? DESIGN_WIDTH : DESIGN_HEIGHT;
  const stageScale = Math.min(
    viewportSize.width / stageWidth,
    viewportSize.height / stageHeight
  );
  const stageStyle: React.CSSProperties = {
    width: stageWidth,
    height: stageHeight,
    transform: `translate(-50%, -50%) scale(${Number.isFinite(stageScale) ? stageScale : 1})`,
    transformOrigin: 'center'
  };

  const currentBoardRef = useRef<whiteboardService.WhiteboardItem | null>(null);
  const saveAsNewRef = useRef(saveAsNew);
  const orientationRef = useRef<string | undefined>(orientationMode);

  useEffect(() => {
    currentBoardRef.current = currentBoard;
  }, [currentBoard]);

  useEffect(() => {
    saveAsNewRef.current = saveAsNew;
  }, [saveAsNew]);

  const hasCanvasContent = () => {
    if (isDirtyRef.current) return true;
    return !!currentBoardRef.current?.file_path;
  };

  const setupCanvas = (restoreSnapshot: boolean = true) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let snapshot: string | null = null;
    if (restoreSnapshot) {
      try {
        snapshot = canvas.toDataURL('image/png');
      } catch {
        snapshot = null;
      }
    }

    const ratio = window.devicePixelRatio || 1;
    scaleRef.current = ratio;
    const width = container.clientWidth;
    const height = container.clientHeight;

    canvas.width = Math.max(1, Math.floor(width * ratio));
    canvas.height = Math.max(1, Math.floor(height * ratio));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctxRef.current = ctx;

    if (snapshot) {
      drawImageToCanvas(snapshot);
    } else {
      clearCanvas();
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#ffffff';
    const ratio = scaleRef.current || 1;
    const width = canvas.width / ratio;
    const height = canvas.height / ratio;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  };

  const drawImageToCanvas = (dataUrl: string) => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffffff';
      const ratio = scaleRef.current || 1;
      const canvasWidth = canvas.width / ratio;
      const canvasHeight = canvas.height / ratio;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      const scale = Math.min(canvasWidth / img.width, canvasHeight / img.height);
      const drawWidth = img.width * scale;
      const drawHeight = img.height * scale;
      const offsetX = (canvasWidth - drawWidth) / 2;
      const offsetY = (canvasHeight - drawHeight) / 2;

      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
      ctx.restore();
    };
    img.src = dataUrl;
  };

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.clientWidth / rect.width;
    const scaleY = canvas.clientHeight / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const beginStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!(event.buttons & 1)) return;
    const ctx = ctxRef.current;
    if (!ctx) return;

    isDrawingRef.current = true;
    isDirtyRef.current = true;
    const point = getPoint(event);
    lastPointRef.current = point;

    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const continueStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const ctx = ctxRef.current;
    if (!ctx) return;

    const point = getPoint(event);
    const last = lastPointRef.current;
    if (!last) return;

    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = tool === 'eraser' ? 'rgba(0,0,0,1)' : color;
    ctx.lineWidth = tool === 'eraser' ? ERASER_SIZE : PEN_SIZE;

    isDirtyRef.current = true;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  };

  const endStroke = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
  };

  const loadBoards = async () => {
    setIsLoading(true);
    try {
      const list = await whiteboardService.listWhiteboards(familyId);
      setWhiteboards(list);
    } catch (error) {
      console.error('[Whiteboard] 获取白板失败:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewBoard = () => {
    setCurrentBoard(null);
    setSaveAsNew(false);
    isDirtyRef.current = false;
    clearCanvas();
    setStatus('已新建白板');
  };

  const handleClearBoard = () => {
    clearCanvas();
    isDirtyRef.current = true;
    setStatus('已清空画布');
  };

  const handleOpenBoard = (board: whiteboardService.WhiteboardItem) => {
    setCurrentBoard(board);
    setSaveAsNew(false);
    isDirtyRef.current = false;
    if (board.file_path) {
      const url = whiteboardService.getWhiteboardUrl(board.file_path);
      drawImageToCanvas(url);
    } else {
      clearCanvas();
    }
    setStatus(`已打开历史白板 #${board.id}`);
  };

  const handleDeleteBoard = async (board: whiteboardService.WhiteboardItem) => {
    try {
      await whiteboardService.deleteWhiteboard(board.id);
      setWhiteboards((prev) => prev.filter((item) => item.id !== board.id));

      if (currentBoardRef.current?.id === board.id) {
        setCurrentBoard(null);
        setSaveAsNew(false);
        isDirtyRef.current = false;
        clearCanvas();
      }

      setStatus(`已删除白板 #${board.id}`);
    } catch (error) {
      console.error('[Whiteboard] 删除失败:', error);
      setStatus('删除失败，请重试');
    }
  };

  const saveBoard = async (reason: 'manual' | 'autosave' | 'exit') => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    if (reason !== 'manual' && !isDirtyRef.current) return false;
    if (isSavingRef.current) {
      return savingPromiseRef.current ?? false;
    }

    isSavingRef.current = true;
    const savingPromise = (async () => {
      if (isMountedRef.current) {
        setIsSaving(true);
        if (reason === 'manual') {
          setStatus(null);
        }
      }

      try {
        const dataUrl = canvas.toDataURL('image/png');
        const hasExisting = !!currentBoardRef.current?.id;
        const shouldCreate = !hasExisting;
        let created: whiteboardService.WhiteboardItem | null = null;

        if (shouldCreate) {
          created = await whiteboardService.createWhiteboard(familyId, dataUrl, '白板');
          if (isMountedRef.current) {
            setCurrentBoard(created);
            setSaveAsNew(false);
          }
        } else if (currentBoardRef.current?.id) {
          await whiteboardService.updateWhiteboard(currentBoardRef.current.id, dataUrl, currentBoardRef.current.title || undefined);
        }

        isDirtyRef.current = false;

        if (isMountedRef.current) {
          if (reason === 'manual') {
            if (!hasExisting) {
              setStatus('白板已保存');
            } else {
              setStatus('白板已更新');
            }
          }
          if (reason === 'autosave') {
            setStatus('已自动保存');
          }
        }

        if (isMountedRef.current && (reason === 'manual' || created)) {
          await loadBoards();
        }

        return true;
      } catch (error) {
        console.error('[Whiteboard] 保存失败:', error);
        if (isMountedRef.current) {
          setStatus('保存失败，请重试');
        }
        return false;
      } finally {
        isSavingRef.current = false;
        savingPromiseRef.current = null;
        if (isMountedRef.current) {
          setIsSaving(false);
        }
      }
    })();

    savingPromiseRef.current = savingPromise;
    return savingPromise;
  };

  const handleSave = async () => {
    await saveBoard('manual');
  };

  const handleClose = async () => {
    isClosingRef.current = true;
    await saveBoard('exit');
    onClose();
  };

  useEffect(() => {
    setupCanvas(false);
    loadBoards();

    const handleResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
      setupCanvas(true);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    handleResize();
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  useEffect(() => {
    if (!orientationMode) return;
    const prevOrientation = orientationRef.current;
    if (!prevOrientation) {
      orientationRef.current = orientationMode;
      return;
    }
    if (prevOrientation === orientationMode) return;
    orientationRef.current = orientationMode;

    const handleOrientationSwitch = async () => {
      const hasContent = hasCanvasContent();
      if (hasContent) {
        await saveBoard('manual');
      }

      // 重置为新画布
      isDrawingRef.current = false;
      lastPointRef.current = null;
      isDirtyRef.current = false;
      setCurrentBoard(null);
      setSaveAsNew(false);
      if (hasContent) {
        setStatus('已切换为新白板');
      } else {
        setStatus(null);
      }

      // 重新根据当前方向初始化画布尺寸
      requestAnimationFrame(() => {
        setupCanvas(false);
      });
    };

    void handleOrientationSwitch();
  }, [orientationMode]);

  useEffect(() => {
    // 默认新建白板
    handleNewBoard();
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    const timer = window.setInterval(() => {
      void saveBoard('autosave');
    }, AUTOSAVE_INTERVAL_MS);

    return () => {
      isMountedRef.current = false;
      window.clearInterval(timer);
      if (!isClosingRef.current) {
        void saveBoard('exit');
      }
    };
  }, []);

  const content = (
    <div className="fixed inset-0 z-[70] bg-black/70">
      <div className="absolute left-1/2 top-1/2 elderly-mode" style={stageStyle}>
        <div className={`relative w-full h-full flex items-center justify-center ${wrapperPaddingClass}`}>
          <div className={`${panelClass} ${panelFrameClass} bg-white overflow-hidden flex flex-col`}>
        {/* 顶部栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <PenSquare size={26} className="text-blue-600" />
            <div>
              <h2 className="text-lg font-bold">白板</h2>
              <p className="text-xs text-gray-500">按住鼠标左键进行书写</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status && <span className="text-sm text-gray-600 mr-2">{status}</span>}
            {onToggleOrientation && orientationToggleLabel && (
              <button
                onClick={onToggleOrientation}
                className="px-4 py-2 rounded-xl bg-black/80 hover:bg-black/90 text-white text-sm font-semibold flex items-center gap-2"
                aria-label="切换横竖屏"
                title={`切换为${orientationToggleLabel}`}
              >
                <RotateCw size={16} />
                {orientationToggleLabel}
              </button>
            )}
            <button
              onClick={handleNewBoard}
              className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold flex items-center gap-2"
            >
              <Plus size={16} />
              新建白板
            </button>
            <button
              onClick={handleClearBoard}
              className="px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold flex items-center gap-2"
            >
              <Trash2 size={16} />
              清除
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
            >
              <Save size={16} />
              {isSaving ? '保存中...' : saveAsNew ? '另存为新白板' : '保存'}
            </button>
            <button
              onClick={handleClose}
              className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
              aria-label="关闭"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* 历史白板 */}
          <div className="w-56 border-r bg-gray-50 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">历史白板</span>
              {isLoading && <span className="text-xs text-gray-400">加载中...</span>}
            </div>
            {whiteboards.length === 0 && !isLoading && (
              <div className="text-xs text-gray-400">暂无历史白板</div>
            )}
            <div className="flex flex-col gap-3">
              {whiteboards.map((board) => (
                <div key={board.id} className="relative group">
                  <button
                    onClick={() => handleOpenBoard(board)}
                    className={`w-full rounded-xl border p-2 text-left bg-white hover:border-blue-300 transition-colors ${
                      currentBoard?.id === board.id ? 'border-blue-500' : 'border-gray-200'
                    }`}
                  >
                    {board.file_path ? (
                      <img
                        src={whiteboardService.getWhiteboardUrl(board.file_path)}
                        alt={`白板 ${board.id}`}
                        className="w-full h-24 object-contain bg-white rounded-lg border"
                      />
                    ) : (
                      <div className="w-full h-24 flex items-center justify-center bg-white border rounded-lg text-xs text-gray-400">
                        未保存
                      </div>
                    )}
                    <div className="mt-2 text-xs text-gray-600">
                      #{board.id} {board.created_at ? board.created_at.slice(0, 16).replace('T', ' ') : ''}
                    </div>
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDeleteBoard(board);
                    }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500 text-white shadow-sm opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-all flex items-center justify-center"
                    aria-label={`删除白板 ${board.id}`}
                    title="删除"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 白板画布 */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* 工具栏 */}
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setTool('pen')}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                    tool === 'pen' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  <PenSquare size={16} />
                  画笔
                </button>
                <button
                  onClick={() => setTool('eraser')}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 ${
                    tool === 'eraser' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  <Eraser size={16} />
                  橡皮擦
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Palette size={16} className="text-gray-500" />
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setTool('pen');
                      setColor(c);
                    }}
                    className={`w-6 h-6 rounded-full border ${color === c ? 'border-gray-900' : 'border-gray-300'}`}
                    style={{ backgroundColor: c }}
                    aria-label={`颜色 ${c}`}
                  />
                ))}
              </div>
            </div>

            <div ref={containerRef} className="flex-1 bg-white relative">
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full cursor-crosshair"
                onPointerDown={beginStroke}
                onPointerMove={continueStroke}
                onPointerUp={endStroke}
                onPointerLeave={endStroke}
                style={{ touchAction: 'none' }}
              />
            </div>
          </div>
        </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
