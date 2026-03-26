# OfficeEcho 屏幕端 MCP Server (简化版)

为屏幕端数字人提供课表管理、情绪记录、文件展示、辅导员联系等功能的 MCP 工具服务器。

**特点：一对一关系，无需传递 family_id 和 elderly_id！**

## 核心特性

- ✅ **简化设计**: 屏幕端与管理端一对一关系，自动管理用户ID
- ✅ **API集成**: 直接调用 OfficeEcho 服务端API，无需直接操作数据库
- ✅ **环境配置**: 通过环境变量配置 family_id，适配不同部署环境
- ✅ **10个工具**: 覆盖联系辅导员、情绪记录、文件播放、课表管理

## 快速开始

### 安装

```bash
cd elderly_mcp
pip install -r requirements.txt
```

### 配置

可选环境变量：
```bash
# 服务端API地址（默认: http://127.0.0.1:8000）
export OFFICEECHO_API_URL="http://127.0.0.1:8000"

# 组织ID（默认: family_001）
export OFFICEECHO_FAMILY_ID="family_001"

# 学生用户ID（默认: 1）
export OFFICEECHO_ELDERLY_ID="1"
```

### 运行

```bash
python server.py
```

### Claude Desktop 配置

编辑 `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "officeecho-elderly": {
      "command": "python",
      "args": ["d:/Projects/OfficeEcho/elderly_mcp/server.py"],
      "env": {
        "OFFICEECHO_API_URL": "http://127.0.0.1:8000",
        "OFFICEECHO_FAMILY_ID": "family_001",
        "OFFICEECHO_ELDERLY_ID": "1"
      }
    }
  }
}
```

## 工具列表

### 1. 联系辅导员 (2个工具)

#### contact_family
普通联系辅导员

```json
{
  "message": "想念你们了，周末能来看我吗？"
}
```

#### contact_family_emergency
紧急联系辅导员

```json
{
  "message": "我摔倒了，需要帮助",
  "location": "客厅" // 可选
}
```

### 2. 情绪管理 (2个工具)

#### record_emotion
记录情绪

```json
{
  "mood_type": "happy",      // happy/calm/sad/anxious/angry/tired
  "mood_score": 8,           // 1-10，可选，默认5
  "note": "今天心情不错",     // 可选
  "trigger_event": "看了辅导员分享的照片"  // 可选
}
```

#### get_current_emotion
获取最近情绪记录

```json
{
  "limit": 1  // 可选，默认1
}
```

### 3. 文件展示 (3个工具)

#### get_all_media
获取所有文件列表

```json
{
  "media_type": "photo",  // photo/video，可选
  "limit": 20            // 可选，默认20
}
```

#### get_media_by_tags
按标签查询文件

```json
{
  "tags": ["孙女小米", "生日"]
}
```

#### display_media
播放文件

```json
{
  "media_id": 1
}
```

### 4. 课表管理 (3个工具)

#### get_schedules
获取课表列表

```json
{
  "schedule_type": "medication",  // medication/exercise/meal/checkup/other，可选
  "status": "pending",           // pending/completed/skipped/missed，可选
  "limit": 20                    // 可选，默认20
}
```

#### get_current_toast_schedule
获取当前弹窗的课表

```json
{}  // 无需参数
```

#### mark_toast_schedule
标记弹窗课表

```json
{
  "alert_id": 123,
  "action": "complete",      // ignore/complete/delay
  "delay_minutes": 15        // action=delay时需要
}
```

## 使用示例

### 示例1: 记录开心情绪

```
工具: record_emotion
参数: {
  "mood_type": "happy",
  "mood_score": 8,
  "note": "今天天气很好"
}
```

### 示例2: 紧急呼叫辅导员

```
工具: contact_family_emergency
参数: {
  "message": "我感觉身体不舒服",
  "location": "会议室"
}
```

### 示例3: 播放孙女的照片

```
步骤1: 查询文件
工具: get_media_by_tags
参数: {"tags": ["孙女"]}
结果: [{"id": 5, "title": "小米生日", ...}]

步骤2: 播放
工具: display_media
参数: {"media_id": 5}
```

## 架构说明

```
┌─────────────┐
│  Claude AI  │
└──────┬──────┘
       │ MCP Protocol
       ↓
┌──────────────────┐
│ elderly_mcp      │  (本项目)
│ - server.py      │
└────────┬─────────┘
         │ HTTP API
         ↓
┌──────────────────┐
│ OfficeEcho Server│
│ - app.py         │
│ - officeecho.db  │
└──────────────────┘
         ↓
┌──────────────────┐
│  管理端 App      │
└──────────────────┘
```

### 数据流向

- **情绪记录**: MCP → API (`/api/elderly/moods`) → 数据库 → 管理端查询
- **联系辅导员**: MCP → API (`/api/family/alerts`) → 数据库 → 管理端实时告警
- **文件播放**: MCP → API (`/api/media/display`) → 记录播放历史 → 管理端统计
- **课表管理**: MCP ← API (`/api/elderly/schedules`) ← 数据库 ← 管理端创建

## 与服务端API对接

本MCP服务器依赖 OfficeEcho 服务端提供的以下API:

| API端点 | 方法 | 用途 | 状态 |
|---------|------|------|------|
| `/api/family/alerts` | POST | 发送告警给辅导员 | ✅ 已实现 |
| `/api/family/alerts` | GET | 获取告警列表 | ✅ 已实现 |
| `/api/family/alerts/{id}` | PUT | 更新告警状态 | ✅ 已实现 |
| `/api/elderly/moods` | POST | 创建情绪记录 | ✅ 已实现 |
| `/api/elderly/moods` | GET | 获取情绪记录 | ✅ 已实现 |
| `/api/family/media` | GET | 获取文件列表 | ✅ 已实现 |
| `/api/elderly/media/{id}/play` | POST | 播放文件 | ✅ 已实现 |
| `/api/family/schedules` | GET | 获取课表列表 | ✅ 已实现 |

**注意**: 服务端运行在 **8000端口**（不是5000）

## 故障排查

### 问题1: 连接服务端失败

检查：
1. 服务端是否运行在 `http://127.0.0.1:8000`
2. 环境变量 `KINECHO_API_URL` 是否正确
3. 网络连接是否正常

启动服务端：
```bash
cd server
python app.py
```

### 问题2: 情绪记录成功但管理端看不到

原因: family_id 不匹配

解决:
1. 检查环境变量 `OFFICEECHO_FAMILY_ID` 的值
2. 确保管理端查询时使用相同的 family_id
3. 查看服务端日志确认记录是否写入

### 问题3: API返回错误

查看日志中的详细错误信息：
- 检查服务端API是否已实现
- 检查请求参数格式是否正确
- 查看服务端数据库表结构是否匹配

## 开发说明

### 修改 family_id

有两种方式：

1. **环境变量**（推荐）:
   ```bash
   export OFFICEECHO_FAMILY_ID="my_family"
   ```

2. **代码修改**:
   编辑 `server.py` 第29行:
   ```python
   DEFAULT_FAMILY_ID = 'my_family'
   ```

### 添加新工具

1. 在 `ElderlyMCPManager` 类中添加方法
2. 在 `handle_list_tools()` 中注册工具定义
3. 在 `handle_call_tool()` 中添加工具调用处理

### 日志级别

修改第24行调整日志级别:
```python
logging.basicConfig(level=logging.DEBUG)  # INFO → DEBUG
```

## 相关文档

- [OfficeEcho 服务端 API](../server/app.py)
- [数据库结构](../server/app.py#L84-L314)
- [MCP Protocol](https://modelcontextprotocol.io)

## 许可证

与 OfficeEcho 主项目保持一致
