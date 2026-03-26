import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  retryCount: number;
}

/**
 * 数字人组件错误边界
 * 捕获子组件的错误，防止整个应用白屏
 */
export class AvatarErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AvatarErrorBoundary] 捕获到错误:', error);
    console.error('[AvatarErrorBoundary] 错误信息:', errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    console.log('[AvatarErrorBoundary] 用户点击重试');
    this.setState(prevState => ({
      hasError: false,
      error: null,
      retryCount: prevState.retryCount + 1
    }));
  };

  handleRefresh = () => {
    console.log('[AvatarErrorBoundary] 刷新页面');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-50 via-cyan-50 to-blue-100 z-10">
          <div className="text-center px-8">
            <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center text-6xl">
              ⚠️
            </div>
            <p className="text-xl text-red-600 font-medium mb-2">数字人组件异常</p>
            <p className="text-base text-gray-600 mb-4">
              {this.state.error?.message || '未知错误'}
            </p>
            <div className="flex gap-4 justify-center">
              {this.state.retryCount < 3 && (
                <button
                  onClick={this.handleRetry}
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  重试 ({3 - this.state.retryCount} 次机会)
                </button>
              )}
              <button
                onClick={this.handleRefresh}
                className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                刷新页面
              </button>
            </div>
            {this.state.retryCount >= 3 && (
              <p className="text-sm text-gray-500 mt-4">
                多次重试失败，建议刷新页面
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
