#!/usr/bin/env bash

set -u

MODE=""
START_BACKEND=true
DRY_RUN=false

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

LOG_ROOT=""
RUN_DIR=""
PYTHON_EXE=""
BACKEND_ENV="$SCRIPT_DIR/officeecho_env"
BACKEND_PYTHON=""
BACKEND_PID=""
ADMIN_PID=""
VISITOR_PID=""
ELECTRON_PID=""
CLEANUP_DONE=false
CURRENT_OS="$(uname -s 2>/dev/null || echo unknown)"

if [ -t 1 ]; then
    RED="\033[0;31m"
    GREEN="\033[0;32m"
    YELLOW="\033[1;33m"
    BLUE="\033[0;34m"
    NC="\033[0m"
else
    RED=""
    GREEN=""
    YELLOW=""
    BLUE=""
    NC=""
fi

show_help() {
    echo
    echo "OfficeEcho 启动脚本 (Linux/macOS 版本)"
    echo
    echo "用法: $(basename "$0") [选项]"
    echo
    echo "选项:"
    echo "  --dev          开发模式: 启动 Vite 开发服务器"
    echo "  --prod         生产模式: 构建并启动 Electron"
    echo "  --no-backend   跳过后端启动"
    echo "  --dry-run      演练流程，不真正启动或构建服务"
    echo "  --help, -h     显示帮助信息"
    echo
    echo "示例:"
    echo "  $(basename "$0")"
    echo "  $(basename "$0") --dev"
    echo "  $(basename "$0") --prod"
    echo
}

select_mode() {
    while true; do
        echo "========================================"
        echo "       OfficeEcho 一键启动系统"
        echo "========================================"
        echo
        echo "请选择启动模式:"
        echo
        echo "  1) 开发模式 (dev)  - 启动 Vite 开发服务器，支持热重载"
        echo "  2) 生产模式 (prod) - 构建并启动 Electron 应用"
        echo "  3) 帮助信息"
        echo "  4) 退出"
        echo
        printf "请输入选项 [1-4]: "
        IFS= read -r choice || exit 1

        case "$choice" in
            1)
                MODE="dev"
                return 0
                ;;
            2)
                MODE="prod"
                return 0
                ;;
            3)
                show_help
                exit 0
                ;;
            4)
                echo "已退出。"
                exit 0
                ;;
            *)
                echo "无效选项，请输入 1-4。"
                echo
                ;;
        esac
    done
}

detect_python() {
    local candidate
    local version

    for candidate in python3.12 python3.11 python3.10 python3 python; do
        if ! command -v "$candidate" >/dev/null 2>&1; then
            continue
        fi

        if "$candidate" -c 'import sys; raise SystemExit(0 if (3, 10) <= sys.version_info[:2] <= (3, 12) else 1)' >/dev/null 2>&1; then
            PYTHON_EXE="$candidate"
            version="$("$candidate" -c 'import sys; print(".".join(map(str, sys.version_info[:3])))' 2>/dev/null)"
            echo "[信息] 使用 Python 启动器: $PYTHON_EXE"
            echo "[信息] Python 版本: $version"
            echo
            return 0
        fi
    done

    echo "${RED}[错误] 未找到受支持的 Python，请安装 Python 3.10、3.11 或 3.12。${NC}"
    return 1
}

resolve_backend_python() {
    if [ -x "$BACKEND_ENV/bin/python" ]; then
        BACKEND_PYTHON="$BACKEND_ENV/bin/python"
    elif [ -x "$BACKEND_ENV/Scripts/python.exe" ]; then
        BACKEND_PYTHON="$BACKEND_ENV/Scripts/python.exe"
    else
        BACKEND_PYTHON=""
    fi
}

ensure_backend_env() {
    resolve_backend_python

    if [ -n "$BACKEND_PYTHON" ]; then
        echo "[信息] 后端虚拟环境已存在。"
        return 0
    fi

    echo "[信息] 正在创建后端虚拟环境: $BACKEND_ENV"
    "$PYTHON_EXE" -m venv "$BACKEND_ENV"
    if [ $? -ne 0 ]; then
        echo "${RED}[错误] 创建后端虚拟环境失败。${NC}"
        return 1
    fi

    resolve_backend_python
    if [ -z "$BACKEND_PYTHON" ]; then
        echo "${RED}[错误] 未能定位后端虚拟环境中的 Python。${NC}"
        return 1
    fi

    echo "[信息] 正在安装后端依赖..."
    "$BACKEND_PYTHON" -m pip install -r "$PROJECT_DIR/server/requirements.txt"
    if [ $? -ne 0 ]; then
        echo "${RED}[错误] 安装后端依赖失败。${NC}"
        return 1
    fi

    if [ -f "$PROJECT_DIR/mcp_server/elderly_mcp/requirements.txt" ]; then
        echo "[信息] 正在安装 MCP 依赖..."
        "$BACKEND_PYTHON" -m pip install -r "$PROJECT_DIR/mcp_server/elderly_mcp/requirements.txt"
        if [ $? -ne 0 ]; then
            echo "${RED}[错误] 安装 MCP 依赖失败。${NC}"
            return 1
        fi
    fi

    echo "[信息] 后端环境已就绪。"
    echo
    return 0
}

kill_port() {
    local port="$1"
    local pids=""
    local pid

    if command -v lsof >/dev/null 2>&1; then
        pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ')"
    elif command -v fuser >/dev/null 2>&1; then
        pids="$(fuser "${port}/tcp" 2>/dev/null | tr '\n' ' ')"
    fi

    for pid in $pids; do
        kill -9 "$pid" >/dev/null 2>&1 || true
        echo "[信息] 已释放端口 $port (PID $pid)"
    done
}

cleanup_existing_processes() {
    echo "[信息] 正在清理旧的端口占用..."
    kill_port 3000
    kill_port 3001
    if [ "$START_BACKEND" = true ]; then
        kill_port 8000
    fi
    sleep 1
    echo
}

start_background_command() {
    local workdir="$1"
    local logfile="$2"
    shift 2

    if [ "$DRY_RUN" = true ]; then
        echo ""
        return 0
    fi

    (
        cd "$workdir" || exit 1
        exec "$@" >> "$logfile" 2>&1
    ) &

    echo "$!"
}

wait_for_process_stability() {
    local pid="$1"
    local name="$2"
    local seconds="${3:-5}"
    local elapsed=0

    while [ "$elapsed" -lt "$seconds" ]; do
        if ! kill -0 "$pid" >/dev/null 2>&1; then
            echo "${YELLOW}[淇℃伅] $name 鍚姩鍚庡緢蹇€€鍑轰簡锛岃妫€鏌?$RUN_DIR/electron.log${NC}"
            return 1
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    return 0
}

wait_for_port() {
    local port="$1"
    local max_wait="$2"
    local elapsed=0

    while [ "$elapsed" -lt "$max_wait" ]; do
        if (echo >/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    echo "${RED}[错误] 等待端口 $port 就绪超时。${NC}"
    return 1
}

wait_for_exit_key() {
    echo
    printf "按任意键停止已启动的服务。"
    if [ -t 0 ]; then
        IFS= read -r -n 1 -s _
    else
        IFS= read -r _
    fi
    echo
}

stop_tracked_process() {
    local pid="$1"
    local name="$2"
    local attempts=0

    if [ -z "${pid:-}" ]; then
        return 0
    fi

    if ! kill -0 "$pid" >/dev/null 2>&1; then
        echo "[信息] $name (PID $pid) 已退出或无需停止。"
        return 0
    fi

    kill "$pid" >/dev/null 2>&1 || true
    while kill -0 "$pid" >/dev/null 2>&1 && [ "$attempts" -lt 10 ]; do
        sleep 0.2
        attempts=$((attempts + 1))
    done

    if kill -0 "$pid" >/dev/null 2>&1; then
        kill -9 "$pid" >/dev/null 2>&1 || true
        sleep 0.2
    fi

    if kill -0 "$pid" >/dev/null 2>&1; then
        echo "[信息] $name (PID $pid) 已退出或无需停止。"
    else
        echo "[信息] 已停止 $name (PID $pid)"
    fi
}

cleanup() {
    if [ "$CLEANUP_DONE" = true ]; then
        return
    fi
    CLEANUP_DONE=true

    echo
    echo "[信息] 正在停止已启动的服务..."
    stop_tracked_process "$ELECTRON_PID" "Electron"
    stop_tracked_process "$VISITOR_PID" "屏幕端"
    stop_tracked_process "$ADMIN_PID" "管理端"
    stop_tracked_process "$BACKEND_PID" "后端服务"

    if [ -n "$RUN_DIR" ]; then
        echo "[信息] 本次运行日志已保存到: $RUN_DIR"
    fi
}

find_electron_app() {
    local app=""
    local app_dir=""

    app="$(find "$PROJECT_DIR/dist-electron" -type f \( -name '*.AppImage' -o -name '*.exe' \) 2>/dev/null | head -n 1)"
    if [ -n "$app" ]; then
        echo "$app"
        return 0
    fi

    app="$(find "$PROJECT_DIR/dist-electron" -path '*unpacked*' -type f \( -name 'OfficeEcho' -o -name 'officeecho' \) 2>/dev/null | head -n 1)"
    if [ -n "$app" ]; then
        echo "$app"
        return 0
    fi

    app_dir="$(find "$PROJECT_DIR/dist-electron" -type d -name '*.app' 2>/dev/null | head -n 1)"
    if [ -n "$app_dir" ]; then
        app="$(find "$app_dir/Contents/MacOS" -type f 2>/dev/null | head -n 1)"
        if [ -n "$app" ]; then
            echo "$app"
            return 0
        fi
    fi

    return 1
}

electron_log_has_fuse_error() {
    [ -f "$RUN_DIR/electron.log" ] || return 1
    grep -Eiq 'libfuse\.so\.2|AppImages require FUSE' "$RUN_DIR/electron.log"
}

start_packaged_electron() {
    local app="$1"

    if [ "$CURRENT_OS" = "Linux" ] && [[ "$app" == *.AppImage ]]; then
        echo "${YELLOW}[淇℃伅] 妫€娴嬪埌 Linux AppImage锛屽皢浣跨敤 extract-and-run 妯″紡鍏煎鏃犳硶浣跨敤 FUSE 鐨勭幆澧冦€?${NC}"
        ELECTRON_PID="$(start_background_command "$PROJECT_DIR" "$RUN_DIR/electron.log" env APPIMAGE_EXTRACT_AND_RUN=1 "$app")"
    else
        ELECTRON_PID="$(start_background_command "$PROJECT_DIR" "$RUN_DIR/electron.log" "$app")"
    fi

    [ -n "$ELECTRON_PID" ]
}

launch_packaged_electron_or_fallback() {
    local app="$1"

    chmod +x "$app" >/dev/null 2>&1 || true
    start_packaged_electron "$app" || return 1

    if wait_for_process_stability "$ELECTRON_PID" "Electron" 5; then
        echo "[淇℃伅] 宸插惎鍔?Electron锛孭ID: $ELECTRON_PID"
        return 0
    fi

    if electron_log_has_fuse_error; then
        echo "${YELLOW}[淇℃伅] 妫€娴嬪埌 AppImage 缂哄皯 libfuse.so.2锛屽皾璇曞洖閫€鍒版湰鍦?Electron 杩愯妯″紡...${NC}"
    else
        echo "${YELLOW}[淇℃伅] 鎵撳寘鐗?Electron 鍚姩鍚庢湭鑳界ǔ瀹氳繍琛岋紝灏濊瘯鍥為€€鍒版湰鍦?Electron 杩愯妯″紡...${NC}"
    fi

    ELECTRON_PID=""
    start_local_electron_fallback || return 1
    wait_for_process_stability "$ELECTRON_PID" "鏈湴 Electron" 5
}

start_local_electron_fallback() {
    if [ ! -x "$PROJECT_DIR/node_modules/.bin/electron" ]; then
        echo "${RED}[错误] 未找到本地 Electron 运行时，请先执行 npm install。${NC}"
        return 1
    fi

    echo "[信息] 正在补充构建屏幕端资源..."
    npm run build:visitor >> "$RUN_DIR/build.log" 2>&1
    if [ $? -ne 0 ]; then
        echo "${RED}[错误] Visitor 构建失败，请检查 $RUN_DIR/build.log${NC}"
        return 1
    fi

    ELECTRON_PID="$(start_background_command "$PROJECT_DIR" "$RUN_DIR/electron.log" env OFFICEECHO_FORCE_LOCAL_FILE=1 "$PROJECT_DIR/node_modules/.bin/electron" .)"
    if [ -z "$ELECTRON_PID" ]; then
        echo "${RED}[错误] 启动本地 Electron 回退模式失败。${NC}"
        return 1
    fi

    echo "${YELLOW}[信息] 已回退到本地 Electron 运行模式，PID: $ELECTRON_PID${NC}"
    return 0
}

trap cleanup EXIT INT TERM

while [ $# -gt 0 ]; do
    case "$1" in
        --dev)
            MODE="dev"
            ;;
        --prod)
            MODE="prod"
            ;;
        --no-backend)
            START_BACKEND=false
            ;;
        --dry-run)
            DRY_RUN=true
            ;;
        --help|-h)
            show_help
            exit 0
            ;;
        *)
            echo "未知参数: $1"
            show_help
            exit 1
            ;;
    esac
    shift
done

if [ -z "$MODE" ]; then
    select_mode
fi

echo "========================================"
echo "       OfficeEcho 一键启动系统"
echo "========================================"
echo
if [ "$MODE" = "dev" ]; then
    echo "[启动模式] 开发模式"
else
    echo "[启动模式] 生产模式"
fi
echo

LOG_ROOT="$HOME/OfficeEcho/logs"
mkdir -p "$LOG_ROOT"
RUN_DIR="$LOG_ROOT/run_$(date +%Y%m%d_%H%M%S)_$RANDOM"
mkdir -p "$RUN_DIR"
if [ ! -d "$RUN_DIR" ]; then
    echo "${RED}[错误] 无法创建本次运行目录: $RUN_DIR${NC}"
    exit 1
fi
echo "[信息] 日志根目录: $LOG_ROOT"
echo "[信息] 本次运行目录: $RUN_DIR"
echo

if [ ! -d "$PROJECT_DIR" ]; then
    echo "${RED}[错误] 找不到项目目录: $PROJECT_DIR${NC}"
    exit 1
fi

cd "$PROJECT_DIR" || exit 1

if ! command -v npm >/dev/null 2>&1; then
    echo "${RED}[错误] 未找到 npm，请先安装 Node.js。${NC}"
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "[信息] 正在安装前端依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "${RED}[错误] npm install 失败。${NC}"
        exit 1
    fi
fi

if [ ! -x "node_modules/.bin/vite" ]; then
    echo "[信息] 正在补充开发依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "${RED}[错误] npm install 失败。${NC}"
        exit 1
    fi
fi

detect_python || exit 1

if [ "$START_BACKEND" = true ]; then
    ensure_backend_env || exit 1
fi

cleanup_existing_processes

if [ "$START_BACKEND" = true ]; then
    echo "[1/4] 正在启动后端服务 (端口 8000)..."
    if [ "$DRY_RUN" = true ]; then
        echo "[调试] dry-run: 跳过后端启动"
    else
        BACKEND_PID="$(start_background_command "$PROJECT_DIR/server" "$RUN_DIR/backend.log" "$BACKEND_PYTHON" app.py)"
        if [ -z "$BACKEND_PID" ]; then
            echo "${RED}[错误] 启动后端服务失败。${NC}"
            exit 1
        fi
        echo "[信息] 已请求启动后端服务，启动器 PID: $BACKEND_PID"
        sleep 2
    fi
else
    echo "[1/4] 跳过后端启动 (--no-backend)"
fi

echo "[2/4] 正在启动管理端 (端口 3001)..."
if [ "$DRY_RUN" = true ]; then
    echo "[调试] dry-run: 跳过管理端启动"
else
    ADMIN_PID="$(start_background_command "$PROJECT_DIR" "$RUN_DIR/admin.log" node_modules/.bin/vite --config vite.config.family.ts)"
    if [ -z "$ADMIN_PID" ]; then
        echo "${RED}[错误] 启动管理端失败。${NC}"
        exit 1
    fi
    echo "[信息] 已请求启动管理端，启动器 PID: $ADMIN_PID"
    sleep 2
fi

if [ "$MODE" = "dev" ]; then
    echo "[3/4] 正在启动屏幕端 (开发模式, 端口 3000)..."
    if [ "$DRY_RUN" = true ]; then
        echo "[调试] dry-run: 跳过屏幕端启动"
    else
        VISITOR_PID="$(start_background_command "$PROJECT_DIR" "$RUN_DIR/visitor.log" node_modules/.bin/vite --config vite.config.elderly.ts)"
        if [ -z "$VISITOR_PID" ]; then
            echo "${RED}[错误] 启动屏幕端失败。${NC}"
            exit 1
        fi
        echo "[信息] 已请求启动屏幕端，启动器 PID: $VISITOR_PID"
    fi

    echo "[4/4] 正在等待前端服务稳定..."
    if [ "$DRY_RUN" != true ]; then
        wait_for_port 3001 30 || exit 1
        wait_for_port 3000 30 || exit 1
    fi

    echo "========================================"
    echo "已按开发模式请求启动服务。"
    echo "屏幕端: http://localhost:3000/visitor.html"
    echo "管理端: http://localhost:3001/admin.html"
    echo "开发模式不启动 Electron，请直接使用浏览器访问上述地址。"
    echo "========================================"

    wait_for_exit_key
    exit 0
fi

echo "[3/4] 正在构建并启动 Electron..."
if [ "$DRY_RUN" = true ]; then
    echo "[调试] dry-run: 跳过 Electron 构建与启动"
else
    CSC_IDENTITY_AUTO_DISCOVERY=false \
    WIN_CSC_LINK= \
    WIN_CSC_KEY_PASSWORD= \
    npm run build:electron > "$RUN_DIR/build.log" 2>&1
    if [ $? -ne 0 ]; then
        echo "${YELLOW}[信息] Electron 打包失败，尝试回退到本地 Electron 运行模式...${NC}"
        start_local_electron_fallback && wait_for_process_stability "$ELECTRON_PID" "鏈湴 Electron" 5 || {
            echo "${RED}[错误] Electron 构建失败，请检查 $RUN_DIR/build.log${NC}"
            exit 1
        }
    else
        ELECTRON_APP="$(find_electron_app || true)"
        if [ -n "$ELECTRON_APP" ]; then
            chmod +x "$ELECTRON_APP" >/dev/null 2>&1 || true
            launch_packaged_electron_or_fallback "$ELECTRON_APP" || ELECTRON_PID=""
            if [ -z "$ELECTRON_PID" ]; then
                echo "${YELLOW}[信息] 已找到打包产物，但直接启动失败，尝试回退到本地 Electron 运行模式...${NC}"
                start_local_electron_fallback && wait_for_process_stability "$ELECTRON_PID" "鏈湴 Electron" 5 || {
                    echo "${RED}[错误] 启动 Electron 失败。${NC}"
                    exit 1
                }
            else
                echo "[信息] 已启动 Electron，PID: $ELECTRON_PID"
            fi
        else
            echo "${YELLOW}[信息] 未找到可执行打包产物，尝试回退到本地 Electron 运行模式...${NC}"
            start_local_electron_fallback && wait_for_process_stability "$ELECTRON_PID" "鏈湴 Electron" 5 || {
                echo "${RED}[错误] 未在 dist-electron 中找到 Electron 可执行文件。${NC}"
                exit 1
            }
        fi
    fi
fi

echo "[4/4] 已请求启动服务。"
if [ "$DRY_RUN" != true ]; then
    sleep 2
fi

echo "========================================"
echo "已按生产模式请求启动服务。"
echo "管理端: http://localhost:3001/admin.html"
echo "========================================"

wait_for_exit_key
exit 0
