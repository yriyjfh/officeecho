# OfficeEcho 屏幕端 MCP Server 使用指南

## 重要提示

在使用任何工具前，请务必注意以下几点：

### 1. 获取正确的用户ID

**第一步：调用 `get_user_info` 工具**

```
调用工具: get_user_info
参数: 无
```

该工具会返回系统中所有可用的 `elderly_id` 和 `family_id`，例如：

```json
{
  "success": true,
  "elderly_users": [
    {"id": 1, "name": "学生A", "family_id": "family_001", "user_type": "elderly"}
  ],
  "available_family_ids": ["family_001"],
  "recommendation": {
    "elderly_id": 1,
    "family_id": "family_001"
  }
}
```

从 `recommendation` 中获取推荐的 `elderly_id` 和 `family_id`。

### 2. 使用正确的参数

**所有需要 family_id 和 elderly_id 的工具，必须使用从 get_user_info 获取的值！**

常见错误：
- ❌ `family_id: "default"` - 错误！数据库中可能不存在
- ❌ `elderly_id: 0` - 错误！用户ID从1开始
- ✅ `family_id: "family_001"` - 正确！从 get_user_info 获取
- ✅ `elderly_id: 1` - 正确！从 get_user_info 获取

## 工作流程示例

### 示例1: 记录情绪

```
步骤1: 获取用户信息
工具: get_user_info
结果: elderly_id=1, family_id="family_001"

步骤2: 记录情绪
工具: record_emotion
参数: {
  "family_id": "family_001",
  "elderly_id": 1,
  "mood_type": "happy",
  "mood_score": 8,
  "note": "今天心情不错"
}
```

### 示例2: 联系辅导员

```
步骤1: 获取用户信息
工具: get_user_info
结果: elderly_id=1, family_id="family_001"

步骤2: 联系辅导员
工具: contact_family
参数: {
  "family_id": "family_001",
  "elderly_id": 1,
  "message": "需要帮助，请联系我"
}
```

### 示例3: 查看并标记课表

```
步骤1: 获取用户信息
工具: get_user_info
结果: elderly_id=1

步骤2: 查看当前弹窗课表
工具: get_current_toast_schedule
参数: {
  "elderly_id": 1
}
结果: alert_id=123

步骤3: 标记课表为完成
工具: mark_toast_schedule
参数: {
  "alert_id": 123,
  "action": "complete"
}
```

## 数据流向说明

### 情绪记录
- 所有情绪都会记录到 `mood_records` 表
- 负面情绪（sad/anxious/angry 或分数≤3）会额外发送告警到管理端
- 辅导员可通过以下API查看：
  - `/api/elderly/moods?family_id=family_001` - 查看所有情绪记录
  - `/api/family/alerts?family_id=family_001&alert_type=emotion` - 查看情绪告警

### 联系辅导员
- 会在 `family_alerts` 表中创建记录
- 管理端实时收到告警通知
- 紧急联系显示为高优先级（红色）
- 普通联系显示为中优先级（橙色）

### 文件展示
- 播放记录会写入 `media_play_history` 表
- 会创建 `media_display` 类型的事件用于通知屏幕端界面
- 辅导员可查看播放统计和学生的观看偏好

### 课表管理
- 课表状态变更会同步到 `schedules` 表
- 忽略/完成/延迟操作会更新 `family_alerts` 表
- 管理端可实时看到学生的课表执行情况

## 故障排查

### 问题1: 情绪记录成功但管理端看不到

**原因**: 使用了错误的 `family_id` 或 `elderly_id`

**解决**:
1. 调用 `get_user_info` 确认正确的ID
2. 重新记录情绪，使用正确的ID
3. 管理端查询时也要使用相同的 `family_id`

### 问题2: 联系辅导员没有收到告警

**原因**: 可能使用了不存在的用户ID

**解决**:
1. 确保数据库中有对应的 `family_id` 和 `elderly_id`
2. 检查管理端的查询参数是否正确
3. 查看 `family_alerts` 表确认记录是否已创建

### 问题3: 课表弹窗获取不到

**原因**: 没有待处理的课表提醒

**解决**:
1. 检查是否有 `status=pending` 且 `alert_type=medication` 的记录
2. 确认课表的 `elderly_id` 与查询的ID一致
3. 使用 `get_schedules` 查看所有课表

## 推荐实践

1. **始终先调用 get_user_info**
   - 每次会话开始时调用一次
   - 将返回的ID保存下来供后续使用

2. **验证操作结果**
   - 检查返回的 `success` 字段
   - 如果失败，查看 `message` 了解原因

3. **使用合理的情绪分数**
   - 1-3: 非常负面
   - 4-6: 中性
   - 7-10: 积极正面

4. **延迟课表时选择合适的时间**
   - 最小1分钟，最大1440分钟（24小时）
   - 建议延迟时间：15分钟、30分钟、1小时

## 数据库表结构参考

相关表：
- `users`: 用户信息
- `mood_records`: 情绪记录
- `family_alerts`: 辅导员告警/通知
- `schedules`: 课表表
- `media`: 文件文件
- `media_play_history`: 播放历史

详见 [server/app.py](../server/app.py) 的数据库初始化部分。
