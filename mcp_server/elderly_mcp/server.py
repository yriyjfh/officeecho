#!/usr/bin/env python3
"""
OfficeEcho 屏幕端 MCP Server (简化版)
直接通过服务端API对接，无需传递 family_id 和 elderly_id
适用于一对一辅导员-学生关系

每个工具都需要传入 server_ip 参数指定服务端地址
"""

import os
import sys
import json
import logging
import re
import requests
from typing import Any, Dict, List, Optional

try:
    from mcp.server import Server
    from mcp.types import Tool, TextContent
    import mcp.server.stdio
except ImportError:
    print("MCP库未安装，请运行: pip install mcp")
    sys.exit(1)

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("officeecho_mcp")

# 默认配置
DEFAULT_PORT = 8000
DEFAULT_GROUP_ID = os.getenv('OFFICEECHO_GROUP_ID', 'family_001')
DEFAULT_VISITOR_ID = int(os.getenv('OFFICEECHO_VISITOR_ID', '1'))


def build_api_url(server_ip: str, port: int = DEFAULT_PORT) -> str:
    """构建API基础URL"""
    return f"http://{server_ip}:{port}"


def validate_ip(server_ip: str) -> bool:
    """验证IP地址格式"""
    ip_pattern = r'^(\d{1,3}\.){3}\d{1,3}$'
    return bool(re.match(ip_pattern, server_ip))


class OfficeEchoMCPManager:
    """屏幕端MCP管理核心类 - 简化版，每个方法都需要传入server_ip"""

    def __init__(self):
        self.group_id = DEFAULT_GROUP_ID
        self.visitor_id = DEFAULT_VISITOR_ID
        logger.info(f"MCP Manager initialized: Group={self.group_id}, Visitor={self.visitor_id}")

    # ==================== 联系辅导员功能 ====================

    def contact_admin(self, server_ip: str, message: str, location: Optional[str] = None, port: int = DEFAULT_PORT) -> Dict[str, Any]:
        """联系辅导员"""
        try:
            if not validate_ip(server_ip):
                return {"success": False, "message": f"无效的IP地址格式: {server_ip}"}

            api_base_url = build_api_url(server_ip, port)
            payload = {
                "family_id": self.group_id,
                "alert_type": "contact_family",
                "level": "medium",
                "title": "学生想联系您",
                "message": message,
                "source": "elderly"
            }

            if location:
                payload["metadata"] = json.dumps({"location": location})

            url = f"{api_base_url}/api/family/alerts"
            response = requests.post(url, json=payload, timeout=10)

            if response.status_code in [200, 201]:
                logger.info(f"联系辅导员成功 (服务端: {server_ip})")
                return {
                    "success": True,
                    "message": "已发送联系请求给辅导员",
                    "server_ip": server_ip
                }
            else:
                return {"success": False, "message": f"服务端错误: {response.status_code}"}

        except Exception as e:
            logger.error(f"联系辅导员失败: {e}")
            return {"success": False, "message": str(e)}

    # ==================== 情绪记录功能 ====================

    def record_emotion(self, server_ip: str, mood_type: str, mood_score: int = 5,
                      note: Optional[str] = None, trigger_event: Optional[str] = None, port: int = DEFAULT_PORT) -> Dict[str, Any]:
        """记录情绪"""
        try:
            if not validate_ip(server_ip):
                return {"success": False, "message": f"无效的IP地址格式: {server_ip}"}

            valid_moods = ['happy', 'calm', 'sad', 'anxious', 'angry', 'tired']
            if mood_type not in valid_moods:
                return {"success": False, "message": f"无效的情绪类型: {mood_type}"}

            if not 1 <= mood_score <= 10:
                return {"success": False, "message": "情绪分数必须在1-10之间"}

            api_base_url = build_api_url(server_ip, port)
            payload = {
                "family_id": self.group_id,
                "mood_type": mood_type,
                "mood_score": mood_score,
                "note": note or "",
                "source": "manual",
                "trigger_event": trigger_event or ""
            }

            url = f"{api_base_url}/api/elderly/moods"
            response = requests.post(url, json=payload, timeout=10)

            if response.status_code in [200, 201]:
                logger.info(f"情绪记录成功: {mood_type} ({mood_score}/10) (服务端: {server_ip})")
                return {
                    "success": True,
                    "message": "情绪记录成功",
                    "mood_type_cn": self._mood_to_cn(mood_type),
                    "server_ip": server_ip
                }
            else:
                return {"success": False, "message": f"服务端错误: {response.status_code}"}

        except Exception as e:
            logger.error(f"记录情绪失败: {e}")
            return {"success": False, "message": str(e)}

    def get_current_emotion(self, server_ip: str, limit: int = 1, port: int = DEFAULT_PORT) -> Dict[str, Any]:
        """获取最近情绪记录"""
        try:
            if not validate_ip(server_ip):
                return {"success": False, "message": f"无效的IP地址格式: {server_ip}"}

            api_base_url = build_api_url(server_ip, port)
            url = f"{api_base_url}/api/elderly/moods"
            params = {"family_id": self.group_id, "limit": limit}
            response = requests.get(url, params=params, timeout=10)

            if response.status_code == 200:
                result = response.json()
                records = result.get('records', [])
                for r in records:
                    r['mood_type_cn'] = self._mood_to_cn(r.get('mood_type', ''))
                return {
                    "success": True,
                    "message": f"找到 {len(records)} 条记录",
                    "records": records,
                    "server_ip": server_ip
                }
            else:
                return {"success": False, "message": f"服务端错误: {response.status_code}"}

        except Exception as e:
            logger.error(f"获取情绪失败: {e}")
            return {"success": False, "message": str(e)}

    def _mood_to_cn(self, mood: str) -> str:
        """情绪翻译"""
        mapping = {'happy': '开心', 'calm': '平静', 'sad': '难过',
                  'anxious': '焦虑', 'angry': '生气', 'tired': '疲惫'}
        return mapping.get(mood, mood)

    # ==================== 文件展示功能 ====================

    def get_media_list(self, server_ip: str, tags: Optional[List[str]] = None,
                      media_type: Optional[str] = None, limit: int = 20, port: int = DEFAULT_PORT) -> Dict[str, Any]:
        """获取文件列表"""
        try:
            if not validate_ip(server_ip):
                return {"success": False, "message": f"无效的IP地址格式: {server_ip}"}

            api_base_url = build_api_url(server_ip, port)
            url = f"{api_base_url}/api/family/media"
            params = {"family_id": self.group_id}

            response = requests.get(url, params=params, timeout=10)

            if response.status_code == 200:
                result = response.json()
                media_list = result.get('media', [])

                # 文件类型过滤
                if media_type:
                    media_list = [m for m in media_list if m.get('media_type') == media_type]

                # 标签过滤
                if tags:
                    filtered = []
                    for m in media_list:
                        media_tags = m.get('tags', [])
                        if isinstance(media_tags, str):
                            media_tags = media_tags.split(',')
                        if any(tag.strip() in [t.strip() for t in media_tags] for tag in tags):
                            filtered.append(m)
                    media_list = filtered

                # 限制数量
                media_list = media_list[:limit]

                # 格式化描述
                descriptions = []
                for m in media_list:
                    desc = f"ID:{m['id']} - {m['title']}"
                    if m.get('description'):
                        desc += f" ({m['description']})"
                    if m.get('tags'):
                        tag_str = ','.join(m['tags']) if isinstance(m['tags'], list) else m['tags']
                        desc += f" [标签: {tag_str}]"
                    descriptions.append(desc)

                # 简化的文件列表
                simplified_media = [
                    {
                        "media_id": m['id'],
                        "id": m['id'],
                        "title": m['title'],
                        "media_type": m['media_type'],
                        "tags": m.get('tags', []),
                        "description": m.get('description', '')
                    }
                    for m in media_list
                ]

                return {
                    "success": True,
                    "message": f"找到 {len(media_list)} 个文件",
                    "media_list": simplified_media,
                    "descriptions": descriptions,
                    "server_ip": server_ip,
                    "note": "请使用media_list中的media_id字段调用display_media工具"
                }
            else:
                return {"success": False, "message": f"服务端错误: {response.status_code}"}

        except Exception as e:
            logger.error(f"获取文件失败: {e}")
            return {"success": False, "message": str(e)}

    def display_media(self, server_ip: str, media_id: int, port: int = DEFAULT_PORT) -> Dict[str, Any]:
        """播放文件"""
        try:
            if not validate_ip(server_ip):
                return {"success": False, "message": f"无效的IP地址格式: {server_ip}"}

            api_base_url = build_api_url(server_ip, port)

            # 先获取文件信息
            media_url = f"{api_base_url}/api/family/media/{media_id}"
            logger.info(f"正在获取文件信息: {media_url}")
            media_response = requests.get(media_url, timeout=10)

            if media_response.status_code == 404:
                return {
                    "success": False,
                    "message": f"文件ID {media_id} 不存在。请先使用 get_all_media 或 get_media_by_tags 工具查看可用的文件列表和ID"
                }
            elif media_response.status_code != 200:
                return {
                    "success": False,
                    "message": f"获取文件信息失败: HTTP {media_response.status_code}"
                }

            media_info = media_response.json()

            # 使用 show-media API 来展示文件给学生
            url = f"{api_base_url}/api/elderly/show-media"
            payload = {
                "media_title": media_info.get('title', f'Media-{media_id}'),
                "avatar_text": f"来看看{media_info.get('title', '这个')}吧",
                "duration": 60,
                "family_id": self.group_id
            }
            response = requests.post(url, json=payload, timeout=10)

            if response.status_code in [200, 201]:
                # 同时记录播放历史
                play_url = f"{api_base_url}/api/elderly/media/{media_id}/play"
                play_payload = {
                    "elderly_id": self.visitor_id,
                    "triggered_by": "manual",
                    "completed": 0
                }
                requests.post(play_url, json=play_payload, timeout=10)

                logger.info(f"播放文件成功: ID={media_id}, 标题={media_info.get('title')} (服务端: {server_ip})")
                return {
                    "success": True,
                    "message": f"正在屏幕端展示: {media_info.get('title')}",
                    "media_info": media_info,
                    "server_ip": server_ip
                }
            else:
                return {"success": False, "message": f"服务端错误: {response.status_code}"}

        except Exception as e:
            logger.error(f"播放文件失败: {e}")
            return {"success": False, "message": str(e)}

    def hide_media(self, server_ip: str, port: int = DEFAULT_PORT) -> Dict[str, Any]:
        """关闭屏幕端当前显示的文件"""
        try:
            if not validate_ip(server_ip):
                return {"success": False, "message": f"无效的IP地址格式: {server_ip}"}

            api_base_url = build_api_url(server_ip, port)
            url = f"{api_base_url}/api/elderly/hide-media"
            payload = {"family_id": self.group_id}

            logger.info("正在发送关闭文件请求")
            response = requests.post(url, json=payload, timeout=10)

            if response.status_code in [200, 201]:
                logger.info(f"关闭文件成功 (服务端: {server_ip})")
                return {
                    "success": True,
                    "message": "已关闭屏幕端的文件显示",
                    "server_ip": server_ip
                }
            else:
                return {
                    "success": False,
                    "message": f"服务端错误: HTTP {response.status_code}"
                }

        except Exception as e:
            logger.error(f"关闭文件失败: {e}")
            return {"success": False, "message": str(e)}

    # ==================== 学生信息功能 ====================

    def get_visitor_info(self, server_ip: str, port: int = DEFAULT_PORT) -> Dict[str, Any]:
        """获取学生个人信息（姓名、认知状态、听力、视力、兴趣爱好、避免话题）"""
        try:
            if not validate_ip(server_ip):
                return {"success": False, "message": f"无效的IP地址格式: {server_ip}"}

            api_base_url = build_api_url(server_ip, port)
            url = f"{api_base_url}/api/visitor/info"
            response = requests.get(url, timeout=10)

            if response.status_code == 200:
                result = response.json()
                visitor = result.get('visitor', {})
                logger.info(f"获取学生信息成功: {visitor.get('name')} (服务端: {server_ip})")
                return {
                    "success": True,
                    "message": "获取学生信息成功",
                    "visitor": {
                        "name": visitor.get('name', '未知'),
                        "cognitive_status": visitor.get('cognitive_status_label', '正常'),
                        "hearing": visitor.get('hearing_label', '正常'),
                        "vision": visitor.get('vision_label', '正常'),
                        "hobbies": visitor.get('hobbies_list', []),
                        "avoid_topics": visitor.get('avoid_topics_list', [])
                    },
                    "server_ip": server_ip
                }
            else:
                return {"success": False, "message": f"服务端错误: {response.status_code}"}

        except Exception as e:
            logger.error(f"获取学生信息失败: {e}")
            return {"success": False, "message": str(e)}

    # ==================== 课表查询功能 ====================

    def get_schedules(self, server_ip: str, schedule_type: Optional[str] = None,
                     status: str = 'pending', limit: int = 20, port: int = DEFAULT_PORT) -> Dict[str, Any]:
        """获取课表列表"""
        try:
            if not validate_ip(server_ip):
                return {"success": False, "message": f"无效的IP地址格式: {server_ip}"}

            api_base_url = build_api_url(server_ip, port)
            url = f"{api_base_url}/api/family/schedules"
            params = {"family_id": self.group_id}

            response = requests.get(url, params=params, timeout=10)

            if response.status_code == 200:
                result = response.json()
                schedules = result.get('schedules', [])

                # 过滤状态和类型
                filtered = []
                for s in schedules:
                    if status and s.get('status') != status:
                        continue
                    if schedule_type and s.get('schedule_type') != schedule_type:
                        continue
                    filtered.append(s)

                # 限制数量
                filtered = filtered[:limit]

                return {
                    "success": True,
                    "message": f"找到 {len(filtered)} 个课表",
                    "schedules": filtered,
                    "server_ip": server_ip
                }
            else:
                return {"success": False, "message": f"服务端错误: {response.status_code}"}

        except Exception as e:
            logger.error(f"获取课表失败: {e}")
            return {"success": False, "message": str(e)}

    def get_today_schedules(self, server_ip: str, port: int = DEFAULT_PORT) -> Dict[str, Any]:
        """获取今日计划"""
        try:
            if not validate_ip(server_ip):
                return {"success": False, "message": f"无效的IP地址格式: {server_ip}"}

            api_base_url = build_api_url(server_ip, port)
            url = f"{api_base_url}/api/elderly/schedules/today"
            params = {"family_id": self.group_id}
            response = requests.get(url, params=params, timeout=10)

            if response.status_code == 200:
                result = response.json()
                schedules = result.get('schedules', [])
                return {
                    "success": True,
                    "message": f"今日有 {len(schedules)} 个课表",
                    "schedules": schedules,
                    "server_ip": server_ip
                }
            else:
                return {"success": False, "message": f"服务端错误: {response.status_code}"}

        except Exception as e:
            logger.error(f"获取今日计划失败: {e}")
            return {"success": False, "message": str(e)}


# 全局管理器实例
manager = OfficeEchoMCPManager()

# 创建MCP服务器
server = Server("officeecho-screen")

# 定义通用的 server_ip 参数 schema
SERVER_IP_PARAM = {
    "server_ip": {
        "type": "string",
        "description": "OfficeEcho服务端IP地址，如 192.168.1.100（必填）"
    },
    "port": {
        "type": "integer",
        "description": "服务端端口号，默认8000",
        "default": 8000
    }
}


@server.list_tools()
async def handle_list_tools() -> List[Tool]:
    """工具列表 - 每个工具都需要 server_ip 参数"""
    return [
        # 学生信息
        Tool(
            name="get_visitor_info",
            description="获取当前学生的个人信息，包括姓名、认知状态、听力、视力、兴趣爱好、避免话题",
            inputSchema={
                "type": "object",
                "properties": {
                    **SERVER_IP_PARAM
                },
                "required": ["server_ip"]
            }
        ),

        # 联系辅导员
        Tool(
            name="contact_admin",
            description="联系辅导员，向辅导员发送消息",
            inputSchema={
                "type": "object",
                "properties": {
                    **SERVER_IP_PARAM,
                    "message": {"type": "string", "description": "想对辅导员说的话"},
                    "location": {"type": "string", "description": "当前位置，如'前台'、'会议室'（可选）"}
                },
                "required": ["server_ip", "message"]
            }
        ),

        # 情绪记录
        Tool(
            name="record_emotion",
            description="记录学生当前情绪/心情",
            inputSchema={
                "type": "object",
                "properties": {
                    **SERVER_IP_PARAM,
                    "mood_type": {
                        "type": "string",
                        "enum": ["happy", "calm", "sad", "anxious", "angry", "tired"],
                        "description": "情绪类型：happy(开心)、calm(平静)、sad(难过)、anxious(焦虑)、angry(生气)、tired(疲惫)"
                    },
                    "mood_score": {
                        "type": "integer",
                        "description": "情绪分数1-10，数字越大越积极",
                        "minimum": 1,
                        "maximum": 10,
                        "default": 5
                    },
                    "note": {"type": "string", "description": "备注说明（可选）"},
                    "trigger_event": {"type": "string", "description": "触发事件，如'参加会议'、'等待评奖评优'（可选）"}
                },
                "required": ["server_ip", "mood_type"]
            }
        ),
        Tool(
            name="get_current_emotion",
            description="获取学生最近的情绪记录",
            inputSchema={
                "type": "object",
                "properties": {
                    **SERVER_IP_PARAM,
                    "limit": {
                        "type": "integer",
                        "description": "返回记录数量",
                        "default": 1,
                        "minimum": 1,
                        "maximum": 10
                    }
                },
                "required": ["server_ip"]
            }
        ),

        # 文件展示
        Tool(
            name="get_all_media",
            description="获取所有可展示的文件列表（照片、视频等）",
            inputSchema={
                "type": "object",
                "properties": {
                    **SERVER_IP_PARAM,
                    "media_type": {
                        "type": "string",
                        "enum": ["photo", "video","pdf"],
                        "description": "文件类型：photo(照片)、video(视频)、pdf(文件)（可选）"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "返回数量",
                        "default": 20,
                        "minimum": 1,
                        "maximum": 100
                    }
                },
                "required": ["server_ip"]
            }
        ),
        Tool(
            name="get_media_by_tags",
            description="根据标签获取文件",
            inputSchema={
                "type": "object",
                "properties": {
                    **SERVER_IP_PARAM,
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "标签列表，如['公司介绍', '产品展示', '活动照片']"
                    }
                },
                "required": ["server_ip", "tags"]
            }
        ),
        Tool(
            name="display_media",
            description="在屏幕端播放/展示指定文件给学生观看",
            inputSchema={
                "type": "object",
                "properties": {
                    **SERVER_IP_PARAM,
                    "media_id": {"type": "integer", "description": "文件ID（从get_all_media或get_media_by_tags获取）"}
                },
                "required": ["server_ip", "media_id"]
            }
        ),
        Tool(
            name="hide_media",
            description="关闭屏幕端当前显示的文件窗口",
            inputSchema={
                "type": "object",
                "properties": {
                    **SERVER_IP_PARAM
                },
                "required": ["server_ip"]
            }
        ),

        # 课表查询
        Tool(
            name="get_schedules",
            description="获取办公课表列表",
            inputSchema={
                "type": "object",
                "properties": {
                    **SERVER_IP_PARAM,
                    "schedule_type": {
                        "type": "string",
                        "enum": ["math","politics","history","physics","chemistry","art","sports","meeting", "off_work", "reception", "break", "other"], 
                        "description": "课表类型：'math(数学)、politics(政治)、history(历史)、physics(物理)、chemistry(化学)、art(美术)、sports(体育)、meeting(开会)、off_work(查寝)、reception(评奖评优)、break(休息)、other(其他)"
                    },
                    "status": {
                        "type": "string",
                        "enum": ["pending", "completed", "skipped", "missed"],
                        "description": "课表状态：pending(待执行)、completed(已完成)、skipped(已跳过)、missed(已错过)",
                        "default": "pending"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "返回数量",
                        "default": 20
                    }
                },
                "required": ["server_ip"]
            }
        ),
        Tool(
            name="get_today_schedules",
            description="获取今日的所有课表安排",
            inputSchema={
                "type": "object",
                "properties": {
                    **SERVER_IP_PARAM
                },
                "required": ["server_ip"]
            }
        )
    ]


@server.call_tool()
async def handle_call_tool(name: str, arguments: Dict[str, Any]) -> List[TextContent]:
    """处理工具调用 - 每个工具都需要传入 server_ip"""

    # 获取公共参数
    server_ip = arguments.get("server_ip")
    port = arguments.get("port", DEFAULT_PORT)

    # 验证 server_ip 是否存在
    if not server_ip:
        return [TextContent(type="text", text=json.dumps({
            "success": False,
            "message": "缺少必填参数: server_ip（服务端IP地址）"
        }, ensure_ascii=False, indent=2))]

    # 学生信息
    if name == "get_visitor_info":
        result = manager.get_visitor_info(server_ip, port)
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    # 联系辅导员
    elif name == "contact_admin":
        result = manager.contact_admin(
            server_ip,
            arguments["message"],
            location=arguments.get("location"),
            port=port
        )
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    # 情绪记录
    elif name == "record_emotion":
        result = manager.record_emotion(
            server_ip,
            arguments["mood_type"],
            arguments.get("mood_score", 5),
            arguments.get("note"),
            arguments.get("trigger_event"),
            port=port
        )
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    elif name == "get_current_emotion":
        result = manager.get_current_emotion(server_ip, arguments.get("limit", 1), port)
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    # 文件展示
    elif name == "get_all_media":
        result = manager.get_media_list(
            server_ip,
            media_type=arguments.get("media_type"),
            limit=arguments.get("limit", 20),
            port=port
        )
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    elif name == "get_media_by_tags":
        result = manager.get_media_list(server_ip, tags=arguments["tags"], port=port)
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    elif name == "display_media":
        result = manager.display_media(server_ip, arguments["media_id"], port)
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    elif name == "hide_media":
        result = manager.hide_media(server_ip, port)
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    # 课表查询
    elif name == "get_schedules":
        result = manager.get_schedules(
            server_ip,
            arguments.get("schedule_type"),
            arguments.get("status", "pending"),
            arguments.get("limit", 20),
            port=port
        )
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    elif name == "get_today_schedules":
        result = manager.get_today_schedules(server_ip, port)
        return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]

    else:
        return [TextContent(type="text", text=f"未知工具: {name}")]


async def main():
    """主函数"""
    logger.info("OfficeEcho 屏幕端 MCP Server 启动中...")
    logger.info("注意：每个工具调用都需要传入 server_ip 参数")

    try:
        async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
            logger.info("MCP连接已建立")
            init_opts = server.create_initialization_options()
            await server.run(read_stream, write_stream, init_opts)
    except KeyboardInterrupt:
        logger.info("收到中断信号")
    except Exception as e:
        logger.error(f"MCP服务器错误: {e}")
        import traceback
        logger.error(traceback.format_exc())
    finally:
        logger.info("MCP服务器已关闭")


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
