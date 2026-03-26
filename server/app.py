"""
OfficeEcho 服务端 - Flask应用主入口
支持管理端和屏幕端的课表同步管理
"""
import os
import re
from pathlib import Path

# 加载 .env 文件（从项目根目录）
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent / '.env'
    if env_path.exists():
        load_dotenv(env_path)
        print(f'[Config] 已加载环境变量: {env_path}')
except ImportError:
    print('[Config] python-dotenv 未安装，使用系统环境变量')

from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from datetime import datetime, timedelta, timezone
import sqlite3
import json
import base64
import time
import requests
import threading
import numpy as np
import websocket
import psutil
from werkzeug.utils import secure_filename
from typing import Optional, Dict, Any, Set
from dataclasses import dataclass
from enum import Enum

# OpenCV import (video streaming support)
try:
    import cv2
    OPENCV_AVAILABLE = True
except ImportError:
    OPENCV_AVAILABLE = False
    print("Warning: opencv-python not installed; video streaming disabled")

app = Flask(__name__)
CORS(app)  # 允许跨域请求
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# 北京时区 (UTC+8)
BEIJING_TZ = timezone(timedelta(hours=8))

def get_beijing_time():
    """获取当前北京时间"""
    return datetime.now(BEIJING_TZ)

def utc_to_beijing(utc_str):
    """将UTC时间字符串转换为北京时间字符"""
    if not utc_str:
        return None
    try:
        # 解析UTC时间（SQLite的CURRENT_TIMESTAMP格式
        utc_dt = datetime.strptime(utc_str, '%Y-%m-%d %H:%M:%S')
        # 添加UTC时区信息
        utc_dt = utc_dt.replace(tzinfo=timezone.utc)
        # 转换为北京时
        beijing_dt = utc_dt.astimezone(BEIJING_TZ)
        # 返回不带时区信息的字符串
        return beijing_dt.strftime('%Y-%m-%d %H:%M:%S')
    except:
        return utc_str

# Database config
DB_PATH = os.path.join(os.path.dirname(__file__), 'officeecho.db')

# 文件上传配置
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'mp4', 'mov', 'avi', 'pdf'}
MAX_FILE_SIZE = 300 * 1024 * 1024  # 300MB

# 确保上传目录存在 
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(os.path.join(UPLOAD_FOLDER, 'thumbnails'), exist_ok=True)
os.makedirs(os.path.join(UPLOAD_FOLDER, 'whiteboards'), exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

# 屏幕端运行时配置
RUNTIME_CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'runtime_config.json')
LAN_IP_PATTERN = re.compile(r'^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$')

def load_runtime_config():
    """读取本地运行时配置。"""
    if not os.path.exists(RUNTIME_CONFIG_PATH):
        return {}

    try:
        with open(RUNTIME_CONFIG_PATH, 'r', encoding='utf-8') as config_file:
            return json.load(config_file)
    except Exception as error:
        print(f'[RuntimeConfig] 读取配置失败: {error}')
        return {}

def save_runtime_config(config_data):
    """保存本地运行时配置。"""
    try:
        with open(RUNTIME_CONFIG_PATH, 'w', encoding='utf-8') as config_file:
            json.dump(config_data, config_file, ensure_ascii=False, indent=2)
        return True
    except Exception as error:
        print(f'[RuntimeConfig] 保存配置失败: {error}')
        return False

def is_valid_lan_ip(ip):
    """校验是否为合法的局域网 IP。"""
    if not ip:
        return False

    match = LAN_IP_PATTERN.match(ip.strip())
    if not match:
        return False

    parts = [int(part) for part in match.groups()]
    if any(part < 0 or part > 255 for part in parts):
        return False

    return (
        (parts[0] == 192 and parts[1] == 168) or
        parts[0] == 10 or
        (parts[0] == 172 and 16 <= parts[1] <= 31)
    )

def get_saved_lan_ip():
    """获取已保存的局域网 IP。"""
    config_data = load_runtime_config()
    lan_ip = str(config_data.get('lan_ip', '')).strip()
    return lan_ip if is_valid_lan_ip(lan_ip) else ''

def update_saved_lan_ip(lan_ip):
    """更新已保存的局域网 IP。"""
    config_data = load_runtime_config()
    config_data['lan_ip'] = lan_ip
    return save_runtime_config(config_data)

def allowed_file(filename):
    """检查文件扩展名是否允许"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def generate_video_thumbnail(video_path, filename):
    """使用ffmpeg生成视频缩略"""
    import subprocess
    import shutil

    if shutil.which('ffmpeg') is None:
        print('生成视频缩略图失败: 未找到 ffmpeg，请安装并加入 PATH')
        return None

    thumbnail_filename = filename.rsplit('.', 1)[0] + '_thumb.jpg'
    thumbnail_path = os.path.join(UPLOAD_FOLDER, 'thumbnails', thumbnail_filename)

    try:
        # 使用ffmpeg截取秒的帧作为缩略图
        cmd = [
            'ffmpeg', '-i', video_path,
            '-ss', '00:00:01',
            '-vframes', '1',
            '-vf', 'scale=320:-1',
            '-y', thumbnail_path
        ]
        subprocess.run(cmd, capture_output=True, check=True, timeout=30)
        return thumbnail_path
    except Exception as e:
        print(f'生成视频缩略图失败: {e}')
        return None

def get_video_codec(video_path):
    """获取视频编码格式"""
    import subprocess
    import shutil
    if shutil.which('ffprobe') is None:
        print('获取视频编码失败: 未找到 ffprobe，请安装并加入 PATH')
        return None
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=codec_name',
            '-of', 'csv=p=0',
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return result.stdout.strip().lower()
    except Exception as e:
        print(f'获取视频编码失败: {e}')
        return None

def transcode_video_to_h264(video_path):
    """
    将视频转码为 H.264 格式（Chromium/Electron 兼容    如果视频已经H.264，则跳过转码
    返回: (是否转码成功, 错误信息)
    """
    import subprocess
    import shutil

    if shutil.which('ffmpeg') is None:
        return False, '未找到 ffmpeg，请安装并加入 PATH'

    # 检查当前编
    codec = get_video_codec(video_path)
    print(f'[转码] 视频编码: {codec}')

    # 如果已经H.264 或其他兼容格式，跳过转码
    compatible_codecs = {'h264', 'avc', 'avc1', 'vp8', 'vp9', 'av1'}
    if codec in compatible_codecs:
        print(f'[Transcode] codec compatible ({codec}), skip')
        return True, None

    # 需要转码的格式（如 HEVC/H.265
    print(f'[转码] 开始将 {codec} 转码为 H.264...')

    # 生成临时文件路径
    temp_path = video_path + '.h264_temp.mp4'

    try:
        # 使用系统 ffmpeg（带 libx264）转码为 H.264
        # -c:v libx264: 使用 H.264 编码        # -crf 23: 质量参数8-28，越小质量越高，23 是默认值）
        # -preset fast: 编码速度（faster = 速度快但质量稍低        # -c:a aac: 音频使用 AAC 编码
        # -movflags +faststart: 优化网络播放
        cmd = [
            'ffmpeg', '-i', video_path,
            '-c:v', 'libx264',
            '-crf', '23',
            '-preset', 'fast',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-movflags', '+faststart',
            '-y', temp_path
        ]

        print(f'[转码] 执行命令: {" ".join(cmd)}')
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)  # 10分钟超时

        if result.returncode != 0:
            print(f'[转码] ffmpeg 错误: {result.stderr}')
            # 清理临时文件
            if os.path.exists(temp_path):
                os.remove(temp_path)
            return False, f'转码失败: {result.stderr[:200]}'

        # 替换原文
        os.remove(video_path)
        os.rename(temp_path, video_path)

        print('[Transcode] done, replaced original file')
        return True, None

    except subprocess.TimeoutExpired:
        print('[Transcode] timeout (over 10 minutes)')
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return False, 'Transcode timeout; file too large'
    except Exception as e:
        print(f'[转码] 转码异常: {e}')
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return False, str(e)

def generate_photo_thumbnail(photo_path, filename):
    """生成图片缩略"""
    from PIL import Image

    thumbnail_filename = filename.rsplit('.', 1)[0] + '_thumb.jpg'
    thumbnail_path = os.path.join(UPLOAD_FOLDER, 'thumbnails', thumbnail_filename)

    try:
        with Image.open(photo_path) as img:
            # 转换为RGB（处理PNG等格式）
            if img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')
            # 生成缩略图，保持比例
            img.thumbnail((320, 320))
            img.save(thumbnail_path, 'JPEG', quality=85)
        return thumbnail_path
    except Exception as e:
        print(f'生成图片缩略图失败: {e}')
        return None

def get_db():
    """获取数据库连"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # 返回字典格式
    return conn

def init_db():
    """初始化数据库"""
    conn = get_db()
    cursor = conn.cursor()

    # 用户表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_type TEXT NOT NULL,  -- 'family'(辅导员) 或 'elderly'(学生)
            name TEXT NOT NULL,
            phone TEXT,
            family_id TEXT,  -- 组ID，关联辅导员和学生
            cognitive_status TEXT,  -- 认知状态：normal(正常)、mild(轻度障碍)、moderate(中度障碍)
            hearing TEXT,  -- 听力状况：normal(正常)、mild(轻度下降)、moderate(中度下降)、severe(重度下降)
            vision TEXT,  -- 视力状况：normal(正常)、mild(轻度下降)、moderate(中度下降)、severe(重度下降)
            hobbies TEXT,  -- 兴趣爱好，逗号分隔
            avoid_topics TEXT,  -- 避免话题，逗号分隔
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 检查并添加新字段（兼容旧数据库）
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN cognitive_status TEXT")
    except:
        pass
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN hearing TEXT")
    except:
        pass
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN vision TEXT")
    except:
        pass
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN hobbies TEXT")
    except:
        pass
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN avoid_topics TEXT")
    except:
        pass

    # 课表提醒表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            family_id TEXT NOT NULL,  -- 组ID
            title TEXT NOT NULL,  -- 课表标题
            description TEXT,  -- 详细描述
            schedule_type TEXT,  -- 类型：math(数学)、politics(政治)、history(历史)、physics(物理)、chemistry(化学)、art(美术)、sports(体育)、meeting(开会)、off_work(查寝)、reception(评奖评优)、break(休息)、other(其他)
            schedule_time TIMESTAMP NOT NULL,  -- 课表时间
            repeat_type TEXT DEFAULT 'once',  -- 重复类型：once(仅一次), daily(每天), weekly(每周指定日)
            repeat_days TEXT,  -- 重复的星期几，逗号分隔格式："1,2,3,4,5"
            status TEXT DEFAULT 'pending',  -- 状态：pending(待执行), completed(已完成), skipped(已放弃), missed(已错过)
            completed_at TIMESTAMP,  -- 完成时间
            auto_remind INTEGER DEFAULT 1,  -- 数字人自动播报：1=启用，0=禁用
            is_active INTEGER DEFAULT 1,  -- 是否启用
            created_by INTEGER,  -- 创建者用户ID
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )
    ''')

    # 提醒记录表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            schedule_id INTEGER NOT NULL,
            elderly_id INTEGER NOT NULL,  -- 学生用户ID
            remind_time TIMESTAMP NOT NULL,  -- 提醒时间
            status TEXT DEFAULT 'pending',  -- pending, completed, missed, dismissed
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (schedule_id) REFERENCES schedules(id),
            FOREIGN KEY (elderly_id) REFERENCES users(id)
        )
    ''')

    # 文件文件表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS media (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            family_id TEXT NOT NULL,  -- 组ID
            media_type TEXT NOT NULL, -- 'photo' / 'video' / 'pdf'
            title TEXT NOT NULL,  -- 文件标题
            description TEXT,  -- 描述
            file_path TEXT NOT NULL,  -- 文件存储路径
            file_size INTEGER,  -- 文件大小（字节）
            duration INTEGER,  -- 视频时长（秒），仅视频有值
            thumbnail_path TEXT,  -- 缩略图路径
            uploaded_by INTEGER,  -- 上传者用户ID
            is_active INTEGER DEFAULT 1,  -- 是否启用
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uploaded_by) REFERENCES users(id)
        )
    ''')

    # 文件标签表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS media_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            tag TEXT NOT NULL,  -- 标签内容，如 '会议室', '活动', '公告' 等
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
        )
    ''')

    # 文件触发策略表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS media_policies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            time_windows TEXT,  -- 播放时段，JSON格式：["09:00-12:00", "14:00-18:00"]
            moods TEXT,  -- 适合心境，JSON格式：["happy", "calm"]
            occasions TEXT,  -- 特殊场合，JSON格式：["meeting", "reception","math","politics","history","physics","chemistry","art","sports"]
            cooldown INTEGER DEFAULT 60,  -- 冷却时间（分钟），避免重复播放
            priority INTEGER DEFAULT 5,  -- 优先级 1-10，数字越大优先级越高
            last_played_at TIMESTAMP,  -- 上次播放时间
            play_count INTEGER DEFAULT 0,  -- 播放次数
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
        )
    ''')

    # 文件播放历史表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS media_play_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            elderly_id INTEGER NOT NULL,  -- 学生用户ID
            played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- 播放时间
            duration_watched INTEGER,  -- 观看时长（秒）
            completed INTEGER DEFAULT 0,  -- 是否看完：1=是，0=否
            triggered_by TEXT,  -- 触发方式：'auto'=自动, 'manual'=手动, 'mood'=情绪触发等
            mood_before TEXT,  -- 播放前情绪状态
            mood_after TEXT,  -- 播放后情绪状态
            FOREIGN KEY (media_id) REFERENCES media(id),
            FOREIGN KEY (elderly_id) REFERENCES users(id)
        )
    ''')

    # 文件反馈表（点赞/点踩）
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS media_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_id INTEGER NOT NULL,
            elderly_id INTEGER NOT NULL,  -- 学生用户ID
            feedback_type TEXT NOT NULL,  -- 'like' 或 'dislike'
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (media_id) REFERENCES media(id),
            FOREIGN KEY (elderly_id) REFERENCES users(id),
            UNIQUE(media_id, elderly_id)  -- 每个学生对每个文件只能有一个反馈
        )
    ''')

    # 辅导员通知表
    # 白板记录表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS whiteboards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            family_id TEXT NOT NULL,
            title TEXT,
            file_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS family_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            family_id TEXT NOT NULL,  -- 组ID
            content TEXT NOT NULL,  -- 通知内容
            sender_name TEXT NOT NULL,  -- 发送者姓名
            sender_relation TEXT NOT NULL,  -- 发送者角色/称呼
            scheduled_time TIMESTAMP NOT NULL,  -- 预约播报时间
            played INTEGER DEFAULT 0,  -- 是否已播放：0=未播放，1=已播放
            played_at TIMESTAMP,  -- 实际播报时间
            liked INTEGER DEFAULT 0,  -- 学生是否点赞：0=未点赞，1=已点赞
            is_active INTEGER DEFAULT 1,  -- 是否有效
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 管理端消息/告警表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS family_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            family_id TEXT NOT NULL,  -- 组ID
            elderly_id INTEGER,  -- 学生用户ID（可选，用于关联具体学生）
            alert_type TEXT NOT NULL,  -- 消息类型：sos_emergency, contact_family, emotion, inactive, emergency 等
            level TEXT NOT NULL,  -- 级别：low, medium, high
            title TEXT,  -- 消息标题（简短概要）
            message TEXT NOT NULL,  -- 消息详细内容
            metadata TEXT,  -- 额外元数据，JSON格式，如 {"location": "大厅", "device": "屏幕"}
            source TEXT DEFAULT 'elderly',  -- 消息来源：elderly(屏幕端), system(系统自动), family(管理端)
            handled INTEGER DEFAULT 0,  -- 是否已处理：0=未处理，1=已处理
            handled_at TIMESTAMP,  -- 处理时间
            handled_by INTEGER,  -- 处理人用户ID
            reply_message TEXT,  -- 辅导员回复内容
            read INTEGER DEFAULT 0,  -- 是否已读：0=未读，1=已读
            read_at TIMESTAMP,  -- 阅读时间
            is_active INTEGER DEFAULT 1,  -- 是否有效
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (elderly_id) REFERENCES users(id),
            FOREIGN KEY (handled_by) REFERENCES users(id)
        )
    ''')

    # 情绪记录表
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS mood_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            family_id TEXT NOT NULL,  -- 组ID
            elderly_id INTEGER,  -- 学生用户ID
            mood_type TEXT NOT NULL,  -- 情绪类型：happy(开心), calm(平静), sad(难过), anxious(焦虑), angry(生气), tired(疲惫)
            mood_score INTEGER DEFAULT 5,  -- 情绪分数 1-10，数字越大越积极
            note TEXT,  -- 备注说明
            source TEXT DEFAULT 'manual',  -- 来源：manual(手动记录), ai_detect(AI检测), voice(语音分析)
            trigger_event TEXT,  -- 触发事件，如 '参加会议', '休息完成'
            location TEXT,  -- 记录地点
            weather TEXT,  -- 天气情况
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- 记录时间
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (elderly_id) REFERENCES users(id)
        )
    ''')

    # 情绪记录索引
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_mood_records_family_id
        ON mood_records(family_id)
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_mood_records_elderly_id
        ON mood_records(elderly_id)
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_mood_records_recorded_at
        ON mood_records(recorded_at DESC)
    ''')

    # 创建索引以提高查询性能
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_family_alerts_family_id
        ON family_alerts(family_id)
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_family_alerts_created_at
        ON family_alerts(created_at DESC)
    ''')

    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_family_alerts_handled
        ON family_alerts(handled, created_at DESC)
    ''')

    conn.commit()
    conn.close()

# ==================== 管理端 API ====================

@app.route('/api/family/schedules', methods=['GET'])
def get_family_schedules():
    """获取所有课表提"""
    family_id = request.args.get('family_id')
    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT s.*, u.name as creator_name
        FROM schedules s
        LEFT JOIN users u ON s.created_by = u.id
        WHERE s.family_id = ? AND s.is_active = 1
        ORDER BY s.schedule_time DESC
    ''', (family_id,))

    schedules = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({'schedules': schedules})

@app.route('/api/family/schedules', methods=['POST'])
def create_schedule():
    """创建新课表提"""
    data = request.json

    required_fields = ['family_id', 'title', 'schedule_time']
    if not all(field in data for field in required_fields):
        return jsonify({'error': '缺少必需字段'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO schedules (
            family_id, title, description, schedule_type,
            schedule_time, repeat_type, repeat_days, auto_remind, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data['family_id'],
        data['title'],
        data.get('description', ''),
        data.get('schedule_type', 'other'),
        data['schedule_time'],
        data.get('repeat_type', 'once'),
        data.get('repeat_days', ''),
        data.get('auto_remind', 1),
        data.get('created_by')
    ))

    schedule_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({'success': True, 'schedule_id': schedule_id}), 201

@app.route('/api/family/schedules/<int:schedule_id>', methods=['PUT'])
def update_schedule(schedule_id):
    """更新课表提醒"""
    data = request.json

    conn = get_db()
    cursor = conn.cursor()

    # 构建更新语句
    update_fields = []
    params = []

    for field in ['title', 'description', 'schedule_type', 'schedule_time', 'repeat_type', 'repeat_days', 'auto_remind', 'status']:
        if field in data:
            update_fields.append(f"{field} = ?")
            params.append(data[field])

    if not update_fields:
        return jsonify({'error': '没有要更新的字段'}), 400

    update_fields.append("updated_at = CURRENT_TIMESTAMP")
    params.append(schedule_id)

    cursor.execute(f'''
        UPDATE schedules
        SET {', '.join(update_fields)}
        WHERE id = ?
    ''', params)

    conn.commit()
    conn.close()

    return jsonify({'success': True})

@app.route('/api/family/schedules/<int:schedule_id>', methods=['DELETE'])
def delete_schedule(schedule_id):
    """删除课表提醒（软删除"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE schedules
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (schedule_id,))

    conn.commit()
    conn.close()

    return jsonify({'success': True})

# ==================== 管理端消告警 API ====================

@app.route('/api/family/alerts', methods=['GET'])
def get_family_alerts():
    """获取家庭所有消告警"""
    family_id = request.args.get('family_id')
    status = request.args.get('status')  # all, unhandled, handled
    handled = request.args.get('handled')  # true/false 布尔
    read = request.args.get('read')  # true/false 布尔
    alert_type = request.args.get('alert_type')  # 消息类型
    elderly_id = request.args.get('elderly_id', type=int)  # 学生ID
    level = request.args.get('level')  # low, medium, high
    limit = request.args.get('limit', 100, type=int)
    offset = request.args.get('offset', 0, type=int)

    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # 构建查询条件
    conditions = ['a.family_id = ?', 'a.is_active = 1']
    params = [family_id]

    # 排除文件展示事件（这些只用于屏幕端轮询，不应出现在管理端通知列表
    conditions.append("a.alert_type != 'media_display'")

    # 支持status参数（兼容旧版）
    if status == 'unhandled':
        conditions.append('a.handled = 0')
    elif status == 'handled':
        conditions.append('a.handled = 1')

    # 支持handled参数（布尔值）
    if handled is not None:
        if handled.lower() == 'true':
            conditions.append('a.handled = 1')
        elif handled.lower() == 'false':
            conditions.append('a.handled = 0')

    # 支持read参数（布尔值）
    if read is not None:
        if read.lower() == 'true':
            conditions.append('a.read = 1')
        elif read.lower() == 'false':
            conditions.append('a.read = 0')

    # 支持alert_type参数
    if alert_type:
        conditions.append('a.alert_type = ?')
        params.append(alert_type)

    # 支持elderly_id参数
    if elderly_id:
        conditions.append('a.elderly_id = ?')
        params.append(elderly_id)

    if level:
        conditions.append('a.level = ?')
        params.append(level)

    where_clause = ' AND '.join(conditions)

    # 查询总数
    cursor.execute(f'''
        SELECT COUNT(*) as total FROM family_alerts a
        WHERE {where_clause}
    ''', params)

    total = cursor.fetchone()['total']

    # 查询数据（包含学生信息）
    cursor.execute(f'''
        SELECT
            a.*,
            u.name as elderly_name,
            h.name as handler_name
        FROM family_alerts a
        LEFT JOIN users u ON a.elderly_id = u.id
        LEFT JOIN users h ON a.handled_by = h.id
        WHERE {where_clause}
        ORDER BY a.created_at DESC
        LIMIT ? OFFSET ?
    ''', params + [limit, offset])

    alerts = []
    for row in cursor.fetchall():
        alert = dict(row)
        # 转换布尔
        alert['handled'] = bool(alert['handled'])
        alert['read'] = bool(alert['read'])
        # 解析元数据JSON
        if alert['metadata']:
            try:
                alert['metadata'] = json.loads(alert['metadata'])
            except:
                alert['metadata'] = {}
        alerts.append(alert)

    conn.close()

    return jsonify({
        'alerts': alerts,
        'total': total,
        'limit': limit,
        'offset': offset
    })

@app.route('/api/family/alerts', methods=['POST'])
def create_alert():
    """创建新消告警（由屏幕端或系统触发"""
    data = request.json

    required_fields = ['family_id', 'alert_type', 'level', 'message']
    if not all(field in data for field in required_fields):
        return jsonify({'error': '缺少必需字段'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # 处理元数
    metadata = data.get('metadata', {})
    metadata_json = json.dumps(metadata) if metadata else None

    cursor.execute('''
        INSERT INTO family_alerts (
            family_id, elderly_id, alert_type, level, title, message,
            metadata, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data['family_id'],
        data.get('elderly_id'),
        data['alert_type'],
        data['level'],
        data.get('title'),
        data['message'],
        metadata_json,
        data.get('source', 'elderly')
    ))

    alert_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({'success': True, 'alert_id': alert_id}), 201

@app.route('/api/family/alerts/<int:alert_id>/handle', methods=['POST'])
def handle_alert(alert_id):
    """标记消息/告警为已处理"""
    data = request.json or {}

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE family_alerts
        SET handled = 1,
            handled_at = CURRENT_TIMESTAMP,
            handled_by = ?,
            reply_message = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (
        data.get('handled_by'),
        data.get('reply_message'),
        alert_id
    ))

    conn.commit()
    conn.close()

    return jsonify({'success': True})

@app.route('/api/family/alerts/<int:alert_id>/read', methods=['POST'])
def mark_alert_read(alert_id):
    """标记消息为已"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE family_alerts
        SET read = 1,
            read_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (alert_id,))

    conn.commit()
    conn.close()

    return jsonify({'success': True})

@app.route('/api/family/alerts/<int:alert_id>/reply', methods=['POST'])
def reply_alert(alert_id):
    """辅导员回复消"""
    data = request.json

    if not data or 'reply_message' not in data:
        return jsonify({'error': '缺少reply_message字段'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE family_alerts
        SET reply_message = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (data['reply_message'], alert_id))

    conn.commit()
    conn.close()

    return jsonify({'success': True})

@app.route('/api/family/alerts/<int:alert_id>', methods=['DELETE'])
def delete_alert(alert_id):
    """删除消息/告警（软删除"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE family_alerts
        SET is_active = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (alert_id,))

    conn.commit()
    conn.close()

    return jsonify({'success': True})

@app.route('/api/family/alerts/stats', methods=['GET'])
def get_alerts_stats():
    """获取消息统计数据"""
    family_id = request.args.get('family_id')

    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # 统计各级别消息数量（排除文件展示事件
    cursor.execute('''
        SELECT
            level,
            COUNT(*) as count
        FROM family_alerts
        WHERE family_id = ? AND is_active = 1 AND alert_type != 'media_display'
        GROUP BY level
    ''', (family_id,))

    level_stats = {row['level']: row['count'] for row in cursor.fetchall()}

    # 统计各类型消息数量（排除文件展示事件
    cursor.execute('''
        SELECT
            alert_type,
            COUNT(*) as count
        FROM family_alerts
        WHERE family_id = ? AND is_active = 1 AND alert_type != 'media_display'
        GROUP BY alert_type
    ''', (family_id,))

    type_stats = {row['alert_type']: row['count'] for row in cursor.fetchall()}

    # 统计已处未处理（排除文件展示事件
    cursor.execute('''
        SELECT
            COUNT(CASE WHEN handled = 0 THEN 1 END) as unhandled,
            COUNT(CASE WHEN handled = 1 THEN 1 END) as handled,
            COUNT(CASE WHEN read = 0 THEN 1 END) as unread
        FROM family_alerts
        WHERE family_id = ? AND is_active = 1 AND alert_type != 'media_display'
    ''', (family_id,))

    status_stats = dict(cursor.fetchone())

    # 今日新增消息数（排除文件展示事件
    cursor.execute('''
        SELECT COUNT(*) as today_count
        FROM family_alerts
        WHERE family_id = ? AND is_active = 1 AND alert_type != 'media_display'
        AND DATE(created_at) = DATE('now')
    ''', (family_id,))

    today_count = cursor.fetchone()['today_count']

    conn.close()

    return jsonify({
        'level_stats': level_stats,
        'type_stats': type_stats,
        'status_stats': status_stats,
        'today_count': today_count
    })

# ==================== 辅导员通知 API ====================

@app.route('/api/family/messages', methods=['GET'])
def get_family_messages():
    """获取所有通知"""
    family_id = request.args.get('family_id')
    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT * FROM family_messages
        WHERE family_id = ? AND is_active = 1
        ORDER BY created_at DESC
    ''', (family_id,))

    messages = []
    for row in cursor.fetchall():
        msg = dict(row)
        # 转换布尔
        msg['played'] = bool(msg['played'])
        msg['liked'] = bool(msg['liked'])
        # 转换UTC时间为北京时
        msg['created_at'] = utc_to_beijing(msg['created_at'])
        msg['updated_at'] = utc_to_beijing(msg['updated_at'])
        if msg.get('played_at'):
            msg['played_at'] = utc_to_beijing(msg['played_at'])
        messages.append(msg)

    conn.close()

    return jsonify({'messages': messages})

@app.route('/api/family/messages', methods=['POST'])
def create_message():
    """创建新通知"""
    data = request.json

    required_fields = ['family_id', 'content', 'sender_name', 'sender_relation', 'scheduled_time']
    if not all(field in data for field in required_fields):
        return jsonify({'error': '缺少必需字段'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO family_messages (
            family_id, content, sender_name, sender_relation, scheduled_time
        ) VALUES (?, ?, ?, ?, ?)
    ''', (
        data['family_id'],
        data['content'],
        data['sender_name'],
        data['sender_relation'],
        data['scheduled_time']
    ))

    message_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({'success': True, 'message_id': message_id}), 201

@app.route('/api/family/messages/<int:message_id>', methods=['DELETE'])
def delete_message(message_id):
    """删除通知（软删除"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE family_messages
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (message_id,))

    conn.commit()
    conn.close()

    return jsonify({'success': True})

# ==================== 屏幕端通知 API ====================

@app.route('/api/elderly/messages', methods=['GET'])
def get_elderly_messages():
    """获取屏幕端的通知列表（按预约时间排序"""
    family_id = request.args.get('family_id')
    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT * FROM family_messages
        WHERE family_id = ? AND is_active = 1
        ORDER BY scheduled_time ASC
    ''', (family_id,))

    messages = []
    for row in cursor.fetchall():
        msg = dict(row)
        msg['played'] = bool(msg['played'])
        msg['liked'] = bool(msg['liked'])
        # 转换UTC时间为北京时
        msg['created_at'] = utc_to_beijing(msg['created_at'])
        msg['updated_at'] = utc_to_beijing(msg['updated_at'])
        if msg.get('played_at'):
            msg['played_at'] = utc_to_beijing(msg['played_at'])
        messages.append(msg)

    conn.close()

    return jsonify({'messages': messages})

@app.route('/api/elderly/messages/pending', methods=['GET'])
def get_pending_messages():
    """获取待播放的通知（预约时间已到但未播放的）"""
    family_id = request.args.get('family_id')
    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # 获取当前北京时间
    beijing_now = get_beijing_time()
    current_time_str = beijing_now.strftime('%Y-%m-%d %H:%M:%S')
    print(f"[DEBUG] 当前北京时间: {current_time_str}")
    
    # 将ISO格式的时间转换为标准格式进行比较
    cursor.execute('''
        SELECT * FROM family_messages
        WHERE family_id = ?
          AND is_active = 1
          AND played = 0
        ORDER BY scheduled_time ASC
    ''', (family_id,))

    messages = []
    for row in cursor.fetchall():
        msg = dict(row)
        
        # 处理时间格式：将 ISO 格式转换为标准格式
        scheduled_time = msg['scheduled_time']
        if 'T' in scheduled_time:
            # ISO格式: 2026-03-20T14:40 -> 标准格式: 2026-03-20 14:40:00
            scheduled_time = scheduled_time.replace('T', ' ') + ':00'
        
        print(f"[DEBUG] 通知 ID: {msg['id']}, 原始时间: {msg['scheduled_time']}, 转换后: {scheduled_time}")
        
        # 进行比较
        if scheduled_time <= current_time_str:
            print(f"[DEBUG] 应该播放通知 ID: {msg['id']}")
            msg['played'] = bool(msg['played'])
            msg['liked'] = bool(msg['liked'])
            msg['created_at'] = utc_to_beijing(msg['created_at'])
            msg['updated_at'] = utc_to_beijing(msg['updated_at'])
            if msg.get('played_at'):
                msg['played_at'] = utc_to_beijing(msg['played_at'])
            messages.append(msg)
        else:
            print(f"[DEBUG] 还未到时间通知 ID: {msg['id']}")

    conn.close()

    print(f"[DEBUG] 找到 {len(messages)} 条待播放通知")
    return jsonify({'messages': messages})

@app.route('/api/elderly/messages/<int:message_id>/play', methods=['POST'])
def play_message(message_id):
    """标记通知为已播放"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE family_messages
        SET played = 1,
            played_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (message_id,))

    conn.commit()
    conn.close()

    return jsonify({'success': True})

@app.route('/api/elderly/messages/<int:message_id>/like', methods=['POST'])
def like_message(message_id):
    """学生点赞通知"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE family_messages
        SET liked = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (message_id,))

    conn.commit()
    conn.close()

    return jsonify({'success': True})

@app.route('/api/elderly/messages/<int:message_id>/unlike', methods=['POST'])
def unlike_message(message_id):
    """学生取消点赞"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE family_messages
        SET liked = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (message_id,))

    conn.commit()
    conn.close()

    return jsonify({'success': True})

# ==================== 屏幕端消告警 API ====================

@app.route('/api/elderly/alerts', methods=['POST'])
def create_elderly_alert():
    """屏幕端创建消息（如SOS、联系辅导员"""
    data = request.json

    required_fields = ['family_id', 'alert_type', 'level', 'message']
    if not all(field in data for field in required_fields):
        return jsonify({'error': '缺少必需字段'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # 处理元数
    metadata = data.get('metadata', {})
    metadata_json = json.dumps(metadata) if metadata else None

    cursor.execute('''
        INSERT INTO family_alerts (
            family_id, elderly_id, alert_type, level, title, message,
            metadata, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'elderly')
    ''', (
        data['family_id'],
        data.get('elderly_id'),
        data['alert_type'],
        data['level'],
        data.get('title'),
        data['message'],
        metadata_json
    ))

    alert_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({'success': True, 'alert_id': alert_id}), 201

@app.route('/api/elderly/alerts/replies', methods=['GET'])
def get_elderly_alert_replies():
    """获取辅导员对学生消息的回"""
    family_id = request.args.get('family_id')
    elderly_id = request.args.get('elderly_id')

    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    conn = get_db()
    cursor = conn.cursor()

    conditions = ['family_id = ?', 'is_active = 1', 'reply_message IS NOT NULL']
    params = [family_id]

    if elderly_id:
        conditions.append('elderly_id = ?')
        params.append(elderly_id)

    where_clause = ' AND '.join(conditions)

    cursor.execute(f'''
        SELECT
            id, alert_type, level, message, reply_message,
            handled_at, created_at
        FROM family_alerts
        WHERE {where_clause}
        ORDER BY handled_at DESC
        LIMIT 10
    ''', params)

    replies = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({'replies': replies})

# ==================== 情绪记录 API ====================

@app.route('/api/elderly/moods', methods=['POST'])
def create_mood_record():
    """屏幕端创建情绪记"""
    data = request.json

    required_fields = ['family_id', 'mood_type']
    if not all(field in data for field in required_fields):
        return jsonify({'error': '缺少必需字段'}), 400

    # 验证情绪类型
    valid_moods = ['happy', 'calm', 'sad', 'anxious', 'angry', 'tired']
    if data['mood_type'] not in valid_moods:
        return jsonify({'error': 'invalid mood type'}), 400

    # 验证情绪分数范围
    mood_score = data.get('mood_score', 5)
    if not (1 <= mood_score <= 10):
        return jsonify({'error': '情绪分数必须在1-10之间'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO mood_records (
            family_id, elderly_id, mood_type, mood_score, note,
            source, trigger_event, location, weather, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        data['family_id'],
        data.get('elderly_id'),
        data['mood_type'],
        mood_score,
        data.get('note', ''),
        data.get('source', 'manual'),
        data.get('trigger_event', ''),
        data.get('location', ''),
        data.get('weather', ''),
        data.get('recorded_at', datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    ))

    record_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({'success': True, 'record_id': record_id}), 201

@app.route('/api/elderly/moods', methods=['GET'])
def get_elderly_moods():
    """获取学生的情绪记录列"""
    family_id = request.args.get('family_id')
    elderly_id = request.args.get('elderly_id')
    limit = request.args.get('limit', 50, type=int)
    offset = request.args.get('offset', 0, type=int)

    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    conn = get_db()
    cursor = conn.cursor()

    conditions = ['family_id = ?']
    params = [family_id]

    if elderly_id:
        conditions.append('elderly_id = ?')
        params.append(elderly_id)

    where_clause = ' AND '.join(conditions)

    # 查询总数
    cursor.execute(f'''
        SELECT COUNT(*) as total FROM mood_records
        WHERE {where_clause}
    ''', params)

    total = cursor.fetchone()['total']

    # 查询数据
    cursor.execute(f'''
        SELECT * FROM mood_records
        WHERE {where_clause}
        ORDER BY recorded_at DESC
        LIMIT ? OFFSET ?
    ''', params + [limit, offset])

    records = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({
        'records': records,
        'total': total,
        'limit': limit,
        'offset': offset
    })

@app.route('/api/elderly/moods/today', methods=['GET'])
def get_today_moods():
    """获取学生今日的情绪记"""
    family_id = request.args.get('family_id')
    elderly_id = request.args.get('elderly_id')

    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # 获取今天的日期（北京时间
    today = get_beijing_time().strftime('%Y-%m-%d')

    conditions = ['family_id = ?', "DATE(recorded_at, '+08:00') = DATE(?)"]
    params = [family_id, today]

    if elderly_id:
        conditions.append('elderly_id = ?')
        params.append(elderly_id)

    where_clause = ' AND '.join(conditions)

    cursor.execute(f'''
        SELECT * FROM mood_records
        WHERE {where_clause}
        ORDER BY recorded_at DESC
    ''', params)

    records = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({'records': records})

@app.route('/api/elderly/moods/latest', methods=['GET'])
def get_latest_mood():
    """获取学生最新的情绪记录"""
    family_id = request.args.get('family_id')
    elderly_id = request.args.get('elderly_id')

    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    conn = get_db()
    cursor = conn.cursor()

    conditions = ['family_id = ?']
    params = [family_id]

    if elderly_id:
        conditions.append('elderly_id = ?')
        params.append(elderly_id)

    where_clause = ' AND '.join(conditions)

    cursor.execute(f'''
        SELECT * FROM mood_records
        WHERE {where_clause}
        ORDER BY recorded_at DESC
        LIMIT 1
    ''', params)

    row = cursor.fetchone()
    conn.close()

    if row:
        return jsonify({'record': dict(row)})
    else:
        return jsonify({'record': None})

# ==================== 管理端情绪记API ====================

@app.route('/api/family/moods', methods=['GET'])
def get_family_moods():
    """管理端获取学生的情绪记录"""
    family_id = request.args.get('family_id')
    elderly_id = request.args.get('elderly_id')
    mood_type = request.args.get('mood_type')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    limit = request.args.get('limit', 100, type=int)
    offset = request.args.get('offset', 0, type=int)

    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    conn = get_db()
    cursor = conn.cursor()

    conditions = ['m.family_id = ?']
    params = [family_id]

    if elderly_id:
        conditions.append('m.elderly_id = ?')
        params.append(elderly_id)

    if mood_type:
        conditions.append('m.mood_type = ?')
        params.append(mood_type)

    if start_date:
        conditions.append('DATE(m.recorded_at) >= DATE(?)')
        params.append(start_date)

    if end_date:
        conditions.append('DATE(m.recorded_at) <= DATE(?)')
        params.append(end_date)

    where_clause = ' AND '.join(conditions)

    # 查询总数
    cursor.execute(f'''
        SELECT COUNT(*) as total FROM mood_records m
        WHERE {where_clause}
    ''', params)

    total = cursor.fetchone()['total']

    # 查询数据（包含学生信息）
    cursor.execute(f'''
        SELECT
            m.*,
            u.name as elderly_name
        FROM mood_records m
        LEFT JOIN users u ON m.elderly_id = u.id
        WHERE {where_clause}
        ORDER BY m.recorded_at DESC
        LIMIT ? OFFSET ?
    ''', params + [limit, offset])

    records = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({
        'records': records,
        'total': total,
        'limit': limit,
        'offset': offset
    })

@app.route('/api/family/moods/stats', methods=['GET'])
def get_mood_stats():
    """获取情绪统计数据"""
    family_id = request.args.get('family_id')
    elderly_id = request.args.get('elderly_id')
    days = request.args.get('days', 7, type=int)  # 统计最近N
    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    conn = get_db()
    cursor = conn.cursor()

    conditions = ['family_id = ?']
    params = [family_id]

    if elderly_id:
        conditions.append('elderly_id = ?')
        params.append(elderly_id)

    # 添加时间范围条件
    conditions.append(f"DATE(recorded_at) >= DATE('now', '-{days} days')")

    where_clause = ' AND '.join(conditions)

    # 按情绪类型统
    cursor.execute(f'''
        SELECT
            mood_type,
            COUNT(*) as count,
            AVG(mood_score) as avg_score
        FROM mood_records
        WHERE {where_clause}
        GROUP BY mood_type
        ORDER BY count DESC
    ''', params)

    mood_type_stats = []
    for row in cursor.fetchall():
        stat = dict(row)
        stat['avg_score'] = round(stat['avg_score'], 1) if stat['avg_score'] else 0
        mood_type_stats.append(stat)

    # 按日期统计平均分
    cursor.execute(f'''
        SELECT
            DATE(recorded_at) as date,
            AVG(mood_score) as avg_score,
            COUNT(*) as count
        FROM mood_records
        WHERE {where_clause}
        GROUP BY DATE(recorded_at)
        ORDER BY date DESC
    ''', params)

    daily_stats = []
    for row in cursor.fetchall():
        stat = dict(row)
        stat['avg_score'] = round(stat['avg_score'], 1) if stat['avg_score'] else 0
        daily_stats.append(stat)

    # 计算整体统计
    cursor.execute(f'''
        SELECT
            COUNT(*) as total_records,
            AVG(mood_score) as avg_score,
            MAX(mood_score) as max_score,
            MIN(mood_score) as min_score
        FROM mood_records
        WHERE {where_clause}
    ''', params)

    overall = dict(cursor.fetchone())
    overall['avg_score'] = round(overall['avg_score'], 1) if overall['avg_score'] else 0

    # 今日记录
    cursor.execute(f'''
        SELECT COUNT(*) as today_count
        FROM mood_records
        WHERE {where_clause.replace(f"DATE(recorded_at) >= DATE('now', '-{days} days')", "DATE(recorded_at) = DATE('now')")}
    ''', params)

    today_count = cursor.fetchone()['today_count']

    conn.close()

    return jsonify({
        'mood_type_stats': mood_type_stats,
        'daily_stats': daily_stats,
        'overall': overall,
        'today_count': today_count,
        'days': days
    })

@app.route('/api/family/moods/trend', methods=['GET'])
def get_mood_trend():
    """获取情绪趋势数据"""
    family_id = request.args.get('family_id')
    elderly_id = request.args.get('elderly_id')
    days = request.args.get('days', 30, type=int)

    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    conn = get_db()
    cursor = conn.cursor()

    conditions = ['family_id = ?']
    params = [family_id]

    if elderly_id:
        conditions.append('elderly_id = ?')
        params.append(elderly_id)

    conditions.append(f"DATE(recorded_at) >= DATE('now', '-{days} days')")

    where_clause = ' AND '.join(conditions)

    # 按日期获取情绪趋
    cursor.execute(f'''
        SELECT
            DATE(recorded_at) as date,
            mood_type,
            AVG(mood_score) as avg_score,
            COUNT(*) as count
        FROM mood_records
        WHERE {where_clause}
        GROUP BY DATE(recorded_at), mood_type
        ORDER BY date ASC, count DESC
    ''', params)

    trend_data = []
    for row in cursor.fetchall():
        item = dict(row)
        item['avg_score'] = round(item['avg_score'], 1) if item['avg_score'] else 0
        trend_data.append(item)

    conn.close()

    return jsonify({
        'trend': trend_data,
        'days': days
    })

# ==================== 屏幕API ====================

@app.route('/api/elderly/schedules/today', methods=['GET'])
def get_today_schedules():
    """获取今日计划提醒"""
    family_id = request.args.get('family_id')
    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # 获取今天的日期和星期几（0=周日, 1=周一, ..., 6=周六
    today = datetime.now().strftime('%Y-%m-%d')
    weekday = datetime.now().strftime('%w')  # 0-6

    # 查询今日计划    # 1. 一次性课表：日期匹配今天
    # 2. 每日重复：直接显    # 3. 每周重复：repeat_days 包含今天的星期几（逗号分隔格式"1,2,3,4,5"
    cursor.execute('''
        SELECT * FROM schedules
        WHERE family_id = ?
        AND is_active = 1
        AND (
            (repeat_type = 'once' AND DATE(schedule_time) = DATE(?))
            OR repeat_type = 'daily'
            OR (repeat_type = 'weekly' AND (
                repeat_days LIKE ? OR
                repeat_days LIKE ? OR
                repeat_days LIKE ? OR
                repeat_days = ?
            ))
        )
        ORDER BY TIME(schedule_time)
    ''', (family_id, today,
          weekday + ',%',      # 开头匹 "1,..."
          '%,' + weekday + ',%',  # 中间匹配: "...,1,..."
          '%,' + weekday,      # 结尾匹配: "...,1"
          weekday))            # 精确匹配: "1"

    schedules = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({'schedules': schedules})

@app.route('/api/elderly/schedules/upcoming', methods=['GET'])
def get_upcoming_schedules():
    """获取即将到来的课表（下一小时内）"""
    family_id = request.args.get('family_id')
    elderly_id = request.args.get('elderly_id')

    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT * FROM schedules
        WHERE family_id = ?
        AND is_active = 1
        AND datetime(schedule_time) BETWEEN datetime('now') AND datetime('now', '+1 hour')
        ORDER BY schedule_time
    ''', (family_id,))

    schedules = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({'schedules': schedules})

@app.route('/api/elderly/reminders/<int:reminder_id>/complete', methods=['POST'])
def complete_reminder(reminder_id):
    """标记提醒为已完成"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE reminders
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (reminder_id,))

    conn.commit()
    conn.close()

    return jsonify({'success': True})

@app.route('/api/elderly/reminders/<int:reminder_id>/dismiss', methods=['POST'])
def dismiss_reminder(reminder_id):
    """忽略提醒"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE reminders
        SET status = 'dismissed'
        WHERE id = ?
    ''', (reminder_id,))

    conn.commit()
    conn.close()

    return jsonify({'success': True})


@app.route('/api/elderly/schedules/<int:schedule_id>/status', methods=['POST'])
def update_schedule_status(schedule_id):
    """更新课表状"""
    data = request.json
    status = data.get('status')  # pending, completed, skipped, missed

    if status not in ['pending', 'completed', 'skipped', 'missed']:
        return jsonify({'error': 'invalid status'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # 如果状态是 completed，记录完成时
    if status == 'completed':
        cursor.execute('''
            UPDATE schedules
            SET status = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (status, schedule_id))
    else:
        cursor.execute('''
            UPDATE schedules
            SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (status, schedule_id))

    conn.commit()
    conn.close()

    return jsonify({'success': True})

# ==================== 用户管理 API ====================

@app.route('/api/users', methods=['POST'])
def create_user():
    """创建用户"""
    data = request.json

    required_fields = ['user_type', 'name', 'family_id']
    if not all(field in data for field in required_fields):
        return jsonify({'error': '缺少必需字段'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        INSERT INTO users (user_type, name, phone, family_id)
        VALUES (?, ?, ?, ?)
    ''', (
        data['user_type'],
        data['name'],
        data.get('phone', ''),
        data['family_id']
    ))

    user_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return jsonify({'success': True, 'user_id': user_id}), 201

@app.route('/api/users/<string:family_id>', methods=['GET'])
def get_family_users(family_id):
    """获取组内用户列表"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT * FROM users
        WHERE family_id = ?
        ORDER BY user_type, created_at
    ''', (family_id,))

    users = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({'users': users})

@app.route('/api/visitor/info', methods=['GET'])
def get_visitor_info():
    """
    获取当前学生信息（供 Fay MCP 工具调用
    参数:
    - family_id: 组ID（可选，默认 family_001    - elderly_id: 学生ID（可选，默认 1
    返回学生基本信息:
    - 姓名
    - 认知状    - 听力状况
    - 视力状况
    - 兴趣爱好
    - 避免话题
    """
    family_id = request.args.get('family_id', 'family_001')
    elderly_id = request.args.get('elderly_id', 1, type=int)

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute('''
            SELECT id, name, cognitive_status, hearing, vision, hobbies, avoid_topics
            FROM users
            WHERE family_id = ? AND id = ? AND user_type = 'elderly'
        ''', (family_id, elderly_id))

        row = cursor.fetchone()

        if not row:
            return jsonify({
                'success': False,
                'message': 'visitor not found'
            })

        visitor = dict(row)

        # 翻译字段值为中文
        cognitive_labels = {
            'normal': '正常',
            'mild': '轻度障碍',
            'moderate': '中度障碍'
        }
        hearing_labels = {
            'normal': '正常',
            'mild': '轻度下降',
            'moderate': '中度下降',
            'severe': '重度下降'
        }
        vision_labels = {
            'normal': '正常',
            'mild': '轻度下降',
            'moderate': '中度下降',
            'severe': '重度下降'
        }

        return jsonify({
            'success': True,
            'visitor': {
                'id': visitor['id'],
                'name': visitor['name'] or '学生',
                'cognitive_status': visitor['cognitive_status'] or 'normal',
                'cognitive_status_label': cognitive_labels.get(visitor['cognitive_status'], '正常'),
                'hearing': visitor['hearing'] or 'normal',
                'hearing_label': hearing_labels.get(visitor['hearing'], '正常'),
                'vision': visitor['vision'] or 'normal',
                'vision_label': vision_labels.get(visitor['vision'], '正常'),
                'hobbies': visitor['hobbies'] or '',
                'hobbies_list': [h.strip() for h in (visitor['hobbies'] or '').split(',') if h.strip()],
                'avoid_topics': visitor['avoid_topics'] or '',
                'avoid_topics_list': [t.strip() for t in (visitor['avoid_topics'] or '').split(',') if t.strip()]
            }
        })

    except Exception as e:
        print(f"[学生信息] 查询错误: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

@app.route('/api/visitor/info', methods=['POST'])
def update_visitor_info():
    """
    更新学生信息

    请求
    - family_id: 组ID（可选，默认 family_001    - elderly_id: 学生ID（可选，默认 1    - cognitive_status: 认知状    - hearing: 听力状况
    - vision: 视力状况
    - hobbies: 兴趣爱好
    - avoid_topics: 避免话题
    """
    data = request.json or {}
    family_id = data.get('family_id', 'family_001')
    elderly_id = data.get('elderly_id', 1)

    conn = get_db()
    cursor = conn.cursor()

    try:
        # 构建更新语句
        updates = []
        params = []

        if 'cognitive_status' in data:
            updates.append('cognitive_status = ?')
            params.append(data['cognitive_status'])
        if 'hearing' in data:
            updates.append('hearing = ?')
            params.append(data['hearing'])
        if 'vision' in data:
            updates.append('vision = ?')
            params.append(data['vision'])
        if 'hobbies' in data:
            updates.append('hobbies = ?')
            params.append(data['hobbies'])
        if 'avoid_topics' in data:
            updates.append('avoid_topics = ?')
            params.append(data['avoid_topics'])

        if not updates:
            return jsonify({'error': '没有要更新的字段'}), 400

        params.extend([family_id, elderly_id])

        cursor.execute(f'''
            UPDATE users
            SET {', '.join(updates)}
            WHERE family_id = ? AND id = ? AND user_type = 'elderly'
        ''', params)

        conn.commit()

        if cursor.rowcount == 0:
            return jsonify({'error': 'visitor not found'}), 404

        return jsonify({'success': True, 'message': 'visitor updated'})

    except Exception as e:
        print(f"[学生信息] 更新错误: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()

# ==================== 文件API ====================

@app.route('/api/family/media', methods=['POST'])
def upload_media():
    """管理端上传文件文"""
    try:
        print(f"[上传] 收到上传请求")
        print(f"[上传] request.files keys: {list(request.files.keys())}")
        print(f"[上传] request.form keys: {list(request.form.keys())}")

        # 检查是否有文件
        if 'file' not in request.files:
            print("[上传] 错误: 没有上传文件")
            return jsonify({'error': '没有上传文件'}), 400

        file = request.files['file']
        print(f"[上传] 文件名: {file.filename}")

        if file.filename == '':
            print("[Upload] error: empty filename")
            return jsonify({'error': 'empty filename'}), 400

        if not allowed_file(file.filename):
            print(f"[上传] 错误: 不支持的文件类型 - {file.filename}")
            return jsonify({'error': '不支持的文件类型'}), 400

        # 获取其他表单数据
        family_id = request.form.get('family_id')
        title = request.form.get('title')
        description = request.form.get('description', '')
        uploaded_by = request.form.get('uploaded_by')

        print(f"[上传] family_id: {family_id}, title: {title}")

        if not family_id or not title:
            print("[上传] 错误: 缺少必需字段")
            return jsonify({'error': '缺少必需字段'}), 400

        # 保存文件
        # secure_filename 会过滤中文字符，所以只保留扩展名，使用时间戳作为文件名
        original_filename = file.filename
        ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else ''
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S%f')
        unique_filename = f"{timestamp}.{ext}" if ext else timestamp
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)

        print(f"[上传] 保存路径: {file_path}")
        file.save(file_path)
        print(f"[上传] 文件保存成功")

        # 判断文件类型
        media_type = 'video' if ext in {'mp4', 'mov', 'avi'} else 'pdf' if ext == 'pdf' else 'photo'

        # 如果是视频，检查并转码H.264（确Electron 兼容
        if media_type == 'video':
            print(f"[上传] 检查视频编码...")
            transcode_success, transcode_error = transcode_video_to_h264(file_path)
            if not transcode_success:
                # 转码失败，删除文件并返回错误
                os.remove(file_path)
                return jsonify({'error': f'视频转码失败: {transcode_error}'}), 500

        # 获取文件大小（转码后可能变化
        file_size = os.path.getsize(file_path)

        # 生成缩略
        thumbnail_path = None
        if media_type == 'video':
            thumbnail_path = generate_video_thumbnail(file_path, unique_filename)
        elif media_type == 'photo':
            thumbnail_path = generate_photo_thumbnail(file_path, unique_filename)

        print(f"[上传] 缩略图路径: {thumbnail_path}")

        # 插入数据
        conn = get_db()
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO media (
                family_id, media_type, title, description,
                file_path, file_size, thumbnail_path, uploaded_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (family_id, media_type, title, description, file_path, file_size, thumbnail_path, uploaded_by))

        media_id = cursor.lastrowid

        # 创建默认触发策略
        cursor.execute('''
            INSERT INTO media_policies (media_id, time_windows, moods, occasions, cooldown, priority)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (media_id, '[]', '[]', '[]', 60, 5))

        conn.commit()
        conn.close()

        print(f"[上传] 上传成功, media_id: {media_id}")

        return jsonify({
            'success': True,
            'media_id': media_id,
            'file_path': file_path,
            'media_type': media_type
        }), 201

    except Exception as e:
        print(f"[上传] 异常: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'上传失败: {str(e)}'}), 500

@app.route('/api/family/media', methods=['GET'])
def get_family_media():
    """获取所有文件列"""
    family_id = request.args.get('family_id')
    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # 获取文件列表及其标签和策
    cursor.execute('''
        SELECT
            m.*,
            p.time_windows,
            p.moods,
            p.occasions,
            p.cooldown,
            p.priority,
            p.play_count,
            p.last_played_at,
            GROUP_CONCAT(t.tag) as tags
        FROM media m
        LEFT JOIN media_policies p ON m.id = p.media_id
        LEFT JOIN media_tags t ON m.id = t.media_id
        WHERE m.family_id = ? AND m.is_active = 1
        GROUP BY m.id
        ORDER BY m.created_at DESC
    ''', (family_id,))

    media_list = []
    for row in cursor.fetchall():
        media_dict = dict(row)
        # 解析标签
        if media_dict['tags']:
            media_dict['tags'] = media_dict['tags'].split(',')
        else:
            media_dict['tags'] = []

        # 解析JSON字段
        for field in ['time_windows', 'moods', 'occasions']:
            try:
                media_dict[field] = json.loads(media_dict[field]) if media_dict[field] else []
            except:
                media_dict[field] = []

        media_list.append(media_dict)

    conn.close()

    return jsonify({'media': media_list})

@app.route('/api/family/media/<int:media_id>', methods=['GET'])
def get_media_detail(media_id):
    """获取文件详情"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT
            m.*,
            p.time_windows,
            p.moods,
            p.occasions,
            p.cooldown,
            p.priority,
            p.play_count,
            p.last_played_at
        FROM media m
        LEFT JOIN media_policies p ON m.id = p.media_id
        WHERE m.id = ?
    ''', (media_id,))

    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'media not found'}), 404

    media_dict = dict(row)

    # 获取标签
    cursor.execute('SELECT tag FROM media_tags WHERE media_id = ?', (media_id,))
    media_dict['tags'] = [row['tag'] for row in cursor.fetchall()]

    # 解析JSON字段
    for field in ['time_windows', 'moods', 'occasions']:
        try:
            media_dict[field] = json.loads(media_dict[field]) if media_dict[field] else []
        except:
            media_dict[field] = []

    # 获取播放统计
    cursor.execute('''
        SELECT
            COUNT(*) as total_plays,
            SUM(CASE WHEN feedback_type = 'like' THEN 1 ELSE 0 END) as likes,
            SUM(CASE WHEN feedback_type = 'dislike' THEN 1 ELSE 0 END) as dislikes
        FROM media_play_history mph
        LEFT JOIN media_feedback mf ON mph.media_id = mf.media_id AND mph.elderly_id = mf.elderly_id
        WHERE mph.media_id = ?
    ''', (media_id,))

    stats = dict(cursor.fetchone())
    media_dict['statistics'] = stats

    conn.close()

    return jsonify(media_dict)

@app.route('/api/family/media/<int:media_id>', methods=['PUT'])
def update_media(media_id):
    """更新文件信息和触发策"""
    data = request.json

    conn = get_db()
    cursor = conn.cursor()

    # 更新文件基本信息
    if 'title' in data or 'description' in data:
        update_fields = []
        params = []

        if 'title' in data:
            update_fields.append('title = ?')
            params.append(data['title'])

        if 'description' in data:
            update_fields.append('description = ?')
            params.append(data['description'])

        update_fields.append('updated_at = CURRENT_TIMESTAMP')
        params.append(media_id)

        cursor.execute(f'''
            UPDATE media
            SET {', '.join(update_fields)}
            WHERE id = ?
        ''', params)

    # 更新标签
    if 'tags' in data:
        # 删除旧标
        cursor.execute('DELETE FROM media_tags WHERE media_id = ?', (media_id,))

        # 添加新标
        for tag in data['tags']:
            cursor.execute('''
                INSERT INTO media_tags (media_id, tag)
                VALUES (?, ?)
            ''', (media_id, tag))

    # 更新触发策略
    policy_fields = ['time_windows', 'moods', 'occasions', 'cooldown', 'priority']
    policy_updates = []
    policy_params = []

    for field in policy_fields:
        if field in data:
            policy_updates.append(f'{field} = ?')
            # JSON字段需要序列化
            if field in ['time_windows', 'moods', 'occasions']:
                policy_params.append(json.dumps(data[field]))
            else:
                policy_params.append(data[field])

    if policy_updates:
        policy_updates.append('updated_at = CURRENT_TIMESTAMP')
        policy_params.append(media_id)

        cursor.execute(f'''
            UPDATE media_policies
            SET {', '.join(policy_updates)}
            WHERE media_id = ?
        ''', policy_params)

    conn.commit()
    conn.close()

    return jsonify({'success': True})

@app.route('/api/family/media/<int:media_id>', methods=['DELETE'])
def delete_media(media_id):
    """删除文件（软删除"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        UPDATE media
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ''', (media_id,))

    conn.commit()
    conn.close()

    return jsonify({'success': True})

# ==================== 屏幕端媒API ====================

@app.route('/api/elderly/media/recommended', methods=['GET'])
def get_recommended_media():
    """获取推荐文件（基于时段、标签等策略
    筛选策略：
    - 时段: 上午(09:00-12:00), 午间(12:00-14:00), 下午(14:00-18:00), 全天(09:00-18:00)
    - 默认行为: 未设置任何筛选条件的文件默认在任何时候都可以播放
    """
    family_id = request.args.get('family_id')
    elderly_id = request.args.get('elderly_id')
    filter_tags = request.args.get('tags', '')  # 组合标签筛选，逗号分隔

    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    # 解析筛选标
    required_tags = [t.strip() for t in filter_tags.split(',') if t.strip()] if filter_tags else []

    conn = get_db()
    cursor = conn.cursor()

    # 获取当前时间
    now = datetime.now()
    current_time = now.strftime('%H:%M')

    # 查询符合条件的媒
    cursor.execute('''
        SELECT
            m.*,
            p.time_windows,
            p.moods,
            p.occasions,
            p.cooldown,
            p.priority,
            p.play_count,
            p.last_played_at,
            GROUP_CONCAT(t.tag) as tags
        FROM media m
        INNER JOIN media_policies p ON m.id = p.media_id
        LEFT JOIN media_tags t ON m.id = t.media_id
        WHERE m.family_id = ? AND m.is_active = 1
        GROUP BY m.id
        ORDER BY p.priority DESC, p.play_count ASC
    ''', (family_id,))

    recommended = []
    all_tags = set()  # 收集所有可用标
    for row in cursor.fetchall():
        media_dict = dict(row)

        # 解析JSON字段
        time_windows = json.loads(media_dict['time_windows']) if media_dict['time_windows'] else []

        # 检查冷却时
        if media_dict['last_played_at']:
            last_played = datetime.fromisoformat(media_dict['last_played_at'])
            cooldown_minutes = media_dict['cooldown']
            if now - last_played < timedelta(minutes=cooldown_minutes):
                continue  # 还在冷却期，跳过

        # 检查时段匹        # 办公时段: 上午(09:00-12:00), 午间(12:00-14:00), 下午(14:00-18:00), 全天(09:00-18:00)
        # 如果没有设置时段，默认任何时候都可以播放
        time_match = not time_windows  # 空列= 任何时候都可以播放
        for window in time_windows:
            if '-' in window:
                start, end = window.split('-')
                if start <= current_time <= end:
                    time_match = True
                    break

        if not time_match:
            continue

        # 解析标签
        if media_dict['tags']:
            media_dict['tags'] = media_dict['tags'].split(',')
        else:
            media_dict['tags'] = []

        # 收集所有标
        for tag in media_dict['tags']:
            all_tags.add(tag)

        # 检查标签匹配（如果指定了筛选标签，必须全部包含
        if required_tags:
            media_tags_set = set(media_dict['tags'])
            if not all(tag in media_tags_set for tag in required_tags):
                continue  # 不包含所有要求的标签，跳
        recommended.append(media_dict)

    conn.close()

    return jsonify({
        'media': recommended,
        'available_tags': sorted(list(all_tags))
    })
@app.route('/api/elderly/media/<int:media_id>/download', methods=['POST'])
def record_media_download(media_id):
    """记录文件下载"""
    data = request.json
    
    elderly_id = data.get('elderly_id')
    download_type = data.get('download_type', '')
    
    if not elderly_id:
        return jsonify({'error': '缺少elderly_id'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    try:
        # 插入下载记录
        cursor.execute('''
            INSERT INTO media_download_history (media_id, elderly_id, download_type)
            VALUES (?, ?, ?)
        ''', (media_id, elderly_id, download_type))
        
        # 更新下载计数
        cursor.execute('''
            UPDATE media
            SET download_count = COALESCE(download_count, 0) + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (media_id,))
        
        conn.commit()
        return jsonify({'success': True})
        
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()
@app.route('/api/elderly/media/<int:media_id>/play', methods=['POST'])
def record_media_play(media_id):
    """记录文件播放"""
    data = request.json

    elderly_id = data.get('elderly_id')
    duration_watched = data.get('duration_watched', 0)
    completed = data.get('completed', 0)
    triggered_by = data.get('triggered_by', 'manual')
    mood_before = data.get('mood_before', '')
    mood_after = data.get('mood_after', '')

    if not elderly_id:
        return jsonify({'error': '缺少elderly_id'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # 记录播放历史
    cursor.execute('''
        INSERT INTO media_play_history (
            media_id, elderly_id, duration_watched, completed,
            triggered_by, mood_before, mood_after
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (media_id, elderly_id, duration_watched, completed,
          triggered_by, mood_before, mood_after))

    # 更新文件策略的播放次数和最后播放时
    cursor.execute('''
        UPDATE media_policies
        SET play_count = play_count + 1,
            last_played_at = CURRENT_TIMESTAMP
        WHERE media_id = ?
    ''', (media_id,))

    conn.commit()
    conn.close()

    return jsonify({'success': True})

@app.route('/api/elderly/media/<int:media_id>/feedback', methods=['POST'])
def submit_media_feedback(media_id):
    """提交文件反馈（点点踩"""
    data = request.json

    elderly_id = data.get('elderly_id')
    feedback_type = data.get('feedback_type')  # 'like' 'dislike'

    if not elderly_id or feedback_type not in ['like', 'dislike']:
        return jsonify({'error': '参数错误'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # 使用 INSERT OR REPLACE 来处理重复反
    cursor.execute('''
        INSERT OR REPLACE INTO media_feedback (media_id, elderly_id, feedback_type)
        VALUES (?, ?, ?)
    ''', (media_id, elderly_id, feedback_type))

    conn.commit()
    conn.close()

    return jsonify({'success': True})

@app.route('/api/elderly/media/history', methods=['GET'])
def get_media_history():
    """获取文件播放历史"""
    elderly_id = request.args.get('elderly_id')
    limit = request.args.get('limit', 50)

    if not elderly_id:
        return jsonify({'error': '缺少elderly_id参数'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT
            mph.*,
            m.title,
            m.media_type,
            m.file_path,
            mf.feedback_type
        FROM media_play_history mph
        INNER JOIN media m ON mph.media_id = m.id
        LEFT JOIN media_feedback mf ON mph.media_id = mf.media_id AND mph.elderly_id = mf.elderly_id
        WHERE mph.elderly_id = ?
        ORDER BY mph.played_at DESC
        LIMIT ?
    ''', (elderly_id, limit))

    history = [dict(row) for row in cursor.fetchall()]
    conn.close()

    return jsonify({'history': history})

@app.route('/api/family/media/recent-plays', methods=['GET'])
def get_recent_plays():
    """获取最近播放的文件（管理端查看"""
    family_id = request.args.get('family_id')
    limit = request.args.get('limit', 10)

    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT
            m.id,
            m.title,
            m.media_type,
            m.thumbnail_path,
            mph.played_at,
            COUNT(CASE WHEN mf.feedback_type = 'like' THEN 1 END) as likes,
            COUNT(CASE WHEN mf.feedback_type = 'dislike' THEN 1 END) as dislikes
        FROM media m
        INNER JOIN media_play_history mph ON m.id = mph.media_id
        LEFT JOIN media_feedback mf ON m.id = mf.media_id
        WHERE m.family_id = ?
        GROUP BY m.id, mph.played_at
        ORDER BY mph.played_at DESC
        LIMIT ?
    ''', (family_id, limit))

    recent = []
    for row in cursor.fetchall():
        item = dict(row)
        item['played_at'] = utc_to_beijing(item['played_at'])
        recent.append(item)
    conn.close()

    return jsonify({'recent_plays': recent})

# ==================== 静态文件服====================

@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    """提供上传文件的访问，支持视频Range 请求"""
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)

    if not os.path.exists(file_path):
        return jsonify({'error': 'file not found'}), 404

    # 获取文件大小
    file_size = os.path.getsize(file_path)

    # 判断文件类型
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    video_extensions = {'mp4', 'mov', 'avi', 'webm', 'mkv'}

   # 设置 Content-Type
    content_type_map = {
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'webm': 'video/webm',
        'mkv': 'video/x-matroska',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        # 👇 加上这一行
        'pdf': 'application/pdf'
    }
    content_type = content_type_map.get(ext, 'application/octet-stream')

    # 统一补充跨域与Range相关头
    def apply_stream_headers(resp):
        resp.headers['Accept-Ranges'] = 'bytes'
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Headers'] = 'Range, Content-Type, Accept'
        resp.headers['Access-Control-Expose-Headers'] = 'Content-Range, Accept-Ranges, Content-Length'
        return resp

    # 处理 Range 请求（视频播放需要）
    range_header = request.headers.get('Range')

    if range_header and ext in video_extensions:
        # 解析 Range 头，格式: bytes=start-end
        byte_range = range_header.replace('bytes=', '').split('-')
        start = int(byte_range[0]) if byte_range[0] else 0
        end = int(byte_range[1]) if byte_range[1] else file_size - 1

        # 确保范围有效
        if start >= file_size:
            return Response(status=416)  # Range Not Satisfiable

        end = min(end, file_size - 1)
        length = end - start + 1

        # 读取指定范围的数
        with open(file_path, 'rb') as f:
            f.seek(start)
            data = f.read(length)

        # 返回 206 Partial Content
        response = Response(
            data,
            status=206,
            mimetype=content_type,
            direct_passthrough=True
        )
        response.headers['Content-Range'] = f'bytes {start}-{end}/{file_size}'
        response.headers['Content-Length'] = length
        
        # 支持自定义下载文件名
        download_name = request.args.get('download_name')
        if download_name:
            try:
                from urllib.parse import quote
                encoded_name = quote(download_name)
                response.headers['Content-Disposition'] = f'attachment; filename="{encoded_name}"; filename*=UTF-8\'\'{encoded_name}'
            except Exception:
                pass
                
        return apply_stream_headers(response)

    # Range 请求或非视频文件，使用普通方式返
    response = send_from_directory(app.config['UPLOAD_FOLDER'], filename)
    
    # 支持自定义下载文件名
    download_name = request.args.get('download_name')
    if download_name:
        try:
            from urllib.parse import quote
            encoded_name = quote(download_name)
            response.headers['Content-Disposition'] = f'attachment; filename="{encoded_name}"; filename*=UTF-8\'\'{encoded_name}'
        except Exception:
            pass

    return apply_stream_headers(response)

# ==================== 数字人文件展API ====================

@app.route('/api/elderly/show-media', methods=['POST'])
def show_media_on_avatar():
    """
    控制屏幕端在数字人主页中部弹出透明窗口展示文件文件
    参数:
    - media_title: 文件标题(用于查找文件文件)
    - avatar_text: 数字人播报内    - duration: 展示时长(,默认30    """
    data = request.json

    required_fields = ['media_title', 'avatar_text']
    if not all(field in data for field in required_fields):
        return jsonify({'error': '缺少必需字段: media_title 和 avatar_text'}), 400

    media_title = data['media_title']
    avatar_text = data['avatar_text']
    duration = data.get('duration', 30)  # 默认30
    # 从数据库查找文件文件
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('''
        SELECT id, media_type, file_path, title
        FROM media
        WHERE title = ? AND is_active = 1
        LIMIT 1
    ''', (media_title,))

    media_row = cursor.fetchone()

    if not media_row:
        conn.close()
        return jsonify({'error': f'media not found: {media_title}'}), 404

    media_dict = dict(media_row)
    media_type = media_dict['media_type']
    file_path = media_dict['file_path']

    # 提取文件不含路径)
    media_filename = os.path.basename(file_path)

    try:
        # 1. 推送播报内容到数字人（5000端口
        avatar_response = requests.post(
            'http://127.0.0.1:5000/transparent-pass',
            json={
                'user': 'User',
                'text': avatar_text
            },
            timeout=5
        )

        if not avatar_response.ok:
            print(f'推送数字人播报失败: {avatar_response.status_code}')

        # 2. 通知屏幕端弹出文件展示窗        # 创建文件展示事件（使family_alerts 表的特殊类型
        cursor.execute('''
            INSERT INTO family_alerts (
                family_id, alert_type, level, title, message, metadata, source
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            data.get('family_id', 'family_001'),
            'media_display',  # 特殊类型：文件展            'low',
            media_title,  # 使用文件标题作为标题
            avatar_text,
            json.dumps({
                'media_filename': media_filename,
                'media_type': media_type,
                'media_title': media_title,
                'avatar_text': avatar_text,
                'duration': duration,
                'event_type': 'show_media'
            }),
            'system'
        ))

        event_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'event_id': event_id,
            'message': 'media display request sent'
        }), 201

    except Exception as e:
        print(f'处理文件展示请求失败: {e}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/elderly/hide-media', methods=['POST'])
def hide_media_on_avatar():
    """
    控制屏幕端关闭当前显示的文件窗口
    参数:
    - family_id: 家庭ID（可选，默认family_001    """
    data = request.json or {}
    family_id = data.get('family_id', 'family_001')

    conn = get_db()
    cursor = conn.cursor()

    try:
        # 创建隐藏文件事件
        cursor.execute('''
            INSERT INTO family_alerts (
                family_id, alert_type, level, title, message, metadata, source
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (
            family_id,
            'media_display',  # 使用相同类型
            'low',
            '关闭文件显示',
            'Close current media display',
            json.dumps({
                'event_type': 'hide_media'
            }),
            'system'
        ))

        event_id = cursor.lastrowid
        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'event_id': event_id,
            'message': 'media close request sent'
        }), 201

    except Exception as e:
        print(f'处理关闭文件请求失败: {e}')
        conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/elderly/poll-media-events', methods=['GET'])
def poll_media_events():
    """
    屏幕端轮询文件展示事    """
    family_id = request.args.get('family_id', 'family_001')

    conn = get_db()
    cursor = conn.cursor()

    # 查询未读的文件展示事
    cursor.execute('''
        SELECT * FROM family_alerts
        WHERE family_id = ?
        AND alert_type = 'media_display'
        AND read = 0
        AND is_active = 1
        ORDER BY created_at DESC
        LIMIT 1
    ''', (family_id,))

    row = cursor.fetchone()

    if row:
        alert = dict(row)
        # 解析元数
        if alert['metadata']:
            try:
                alert['metadata'] = json.loads(alert['metadata'])
            except:
                alert['metadata'] = {}

        # 标记为已
        cursor.execute('''
            UPDATE family_alerts
            SET read = 1, read_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (alert['id'],))
        conn.commit()
        conn.close()

        return jsonify({'event': alert})
    else:
        conn.close()
        return jsonify({'event': None})

# ==================== 白板 ====================

@app.route('/api/whiteboards', methods=['GET'])
def list_whiteboards():
    """获取白板列表"""
    family_id = request.args.get('family_id', 'family_001')

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, family_id, title, file_path, created_at, updated_at
        FROM whiteboards
        WHERE family_id = ?
        ORDER BY created_at DESC
    ''', (family_id,))

    rows = cursor.fetchall()
    conn.close()

    whiteboards = [dict(row) for row in rows]
    return jsonify({'whiteboards': whiteboards})


@app.route('/api/whiteboards', methods=['POST'])
def create_whiteboard():
    """创建白板并保存图片"""
    data = request.json or {}
    family_id = data.get('family_id', 'family_001')
    title = data.get('title')
    image_data = data.get('image_data')

    if not image_data:
        return jsonify({'error': '缺少image_data'}), 400

    try:
        if isinstance(image_data, str) and image_data.startswith('data:image'):
            image_data = image_data.split(',', 1)[1]
        image_bytes = base64.b64decode(image_data)
    except Exception as e:
        return jsonify({'error': f'图片数据解析失败: {e}'}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute('''
            INSERT INTO whiteboards (family_id, title, file_path)
            VALUES (?, ?, ?)
        ''', (family_id, title, ''))
        whiteboard_id = cursor.lastrowid

        filename = f"whiteboards/whiteboard_{whiteboard_id}.png"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        with open(file_path, 'wb') as f:
            f.write(image_bytes)

        cursor.execute('''
            UPDATE whiteboards
            SET file_path = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ''', (filename, whiteboard_id))

        conn.commit()
        conn.close()

        return jsonify({
            'id': whiteboard_id,
            'family_id': family_id,
            'title': title,
            'file_path': filename
        }), 201
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/whiteboards/<int:whiteboard_id>', methods=['PUT'])
def update_whiteboard(whiteboard_id):
    """更新白板图片"""
    data = request.json or {}
    image_data = data.get('image_data')
    title = data.get('title')

    if not image_data:
        return jsonify({'error': '缺少image_data'}), 400

    try:
        if isinstance(image_data, str) and image_data.startswith('data:image'):
            image_data = image_data.split(',', 1)[1]
        image_bytes = base64.b64decode(image_data)
    except Exception as e:
        return jsonify({'error': f'图片数据解析失败: {e}'}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT id, file_path FROM whiteboards WHERE id = ?', (whiteboard_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': '白板不存在'}), 404

    filename = row['file_path'] or f"whiteboards/whiteboard_{whiteboard_id}.png"
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)

    try:
        with open(file_path, 'wb') as f:
            f.write(image_bytes)

        if title is not None:
            cursor.execute('''
                UPDATE whiteboards
                SET title = ?, file_path = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (title, filename, whiteboard_id))
        else:
            cursor.execute('''
                UPDATE whiteboards
                SET file_path = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (filename, whiteboard_id))

        conn.commit()
        conn.close()
        return jsonify({'success': True, 'id': whiteboard_id, 'file_path': filename})
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': str(e)}), 500


@app.route('/api/whiteboards/<int:whiteboard_id>', methods=['DELETE'])
def delete_whiteboard(whiteboard_id):
    """删除白板"""
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute('SELECT id, file_path FROM whiteboards WHERE id = ?', (whiteboard_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({'error': '白板不存在'}), 404

    file_path = row['file_path']

    try:
        cursor.execute('DELETE FROM whiteboards WHERE id = ?', (whiteboard_id,))
        conn.commit()
        conn.close()

        if file_path:
            abs_path = os.path.join(app.config['UPLOAD_FOLDER'], file_path)
            try:
                if os.path.exists(abs_path):
                    os.remove(abs_path)
            except Exception as e:
                print(f'[Whiteboard] 删除文件失败: {e}')

        return jsonify({'success': True})
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': str(e)}), 500

# ==================== 屏幕端Toast通知 ====================

# Global toast cache (in-memory; cleared on restart)
pending_toasts = {}  # key: family_id, value: list of toast objects

# SSE连接管理
sse_clients = {}  # key: family_id, value: list of response queues

@app.route('/api/elderly/toast', methods=['POST'])
def create_toast():
    """创建屏幕端Toast通知（供MCP工具调用"""
    data = request.json

    family_id = data.get('family_id')
    toast_type = data.get('type', 'info')  # success, info, calling
    message = data.get('message')
    duration = data.get('duration', 3000)  # 默认3
    if not family_id or not message:
        return jsonify({'error': '缺少必需参数'}), 400

    # 创建toast对象
    toast = {
        'id': int(time.time() * 1000),  # 使用时间戳作为ID
        'type': toast_type,
        'message': message,
        'duration': duration,
        'created_at': datetime.now().isoformat()
    }

    # 添加到待显示列表（备用轮询方式）
    if family_id not in pending_toasts:
        pending_toasts[family_id] = []
    pending_toasts[family_id].append(toast)

    # 通过SSE推送给连接的客户端
    if family_id in sse_clients:
        for client_queue in sse_clients[family_id]:
            try:
                client_queue.put(toast)
            except:
                pass  # 客户端可能已断开

    return jsonify({'success': True, 'toast_id': toast['id']}), 201

@app.route('/api/elderly/toast/poll', methods=['GET'])
def poll_toast():
    """屏幕端轮询获取待显示的Toast（备用方案）"""
    family_id = request.args.get('family_id')

    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    # 获取并清空该family的待显示toast
    toasts = pending_toasts.get(family_id, [])
    if toasts:
        # 返回最新的toast，并从列表中移除
        toast = toasts.pop(0)
        return jsonify({'toast': toast})

    return jsonify({'toast': None})

@app.route('/api/elderly/toast/stream', methods=['GET'])
def toast_stream():
    """SSE端点：实时推送Toast通知"""
    family_id = request.args.get('family_id')

    if not family_id:
        return jsonify({'error': '缺少family_id参数'}), 400

    def generate():
        import queue

        # 为此客户端创建队
        client_queue = queue.Queue()

        # 注册客户
        if family_id not in sse_clients:
            sse_clients[family_id] = []
        sse_clients[family_id].append(client_queue)

        try:
            # 发送连接成功消
            yield f"data: {json.dumps({'type': 'connected'})}\n\n"

            # 持续监听队列
            while True:
                try:
                    # 等待新的toast0秒超时，发送心跳）
                    toast = client_queue.get(timeout=30)
                    yield f"data: {json.dumps(toast)}\n\n"
                except queue.Empty:
                    # 发送心跳保持连
                    yield f": heartbeat\n\n"
        finally:
            # 客户端断开时清
            if family_id in sse_clients:
                sse_clients[family_id].remove(client_queue)
                if not sse_clients[family_id]:
                    del sse_clients[family_id]

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive'
        }
    )

# ==================== 视频API ====================

class CameraStatus(Enum):
    """摄像头状态枚"""
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    ERROR = "error"

@dataclass
class CameraConfig:
    """摄像头配"""
    device_index: int = 0  # 摄像头设备索
    frame_rate: int = 12           # 帧率 (10-15fps推荐)
    jpeg_quality: int = 70         # JPEG质量 (1-100)
    resolution_width: int = 640  # 分辨率宽
    resolution_height: int = 480   # 分辨率高
class CameraManager:
    """
    摄像头管理类
    - 单例模式管理摄像头资    - 支持多客户端同时观看
    - 自动释放长时间未使用的资    """
    _instance: Optional['CameraManager'] = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._initialized = True
        self.camera = None
        self.config = CameraConfig()
        self.status = CameraStatus.STOPPED
        self.client_count = 0
        self.last_frame: Optional[bytes] = None
        self.frame_lock = threading.Lock()
        self.capture_thread: Optional[threading.Thread] = None
        self.running = False
        self.last_access_time = time.time()
        self.error_message: Optional[str] = None

        # 启动资源回收线程
        self._start_cleanup_thread()

    def _start_cleanup_thread(self):
        """启动资源清理线程0秒无客户端则释放摄像"""
        def cleanup_worker():
            while True:
                time.sleep(30)
                if self.status == CameraStatus.RUNNING and self.client_count == 0:
                    if time.time() - self.last_access_time > 60:
                        print("[Camera] No clients for 60s, releasing camera")
                        self.stop()

        thread = threading.Thread(target=cleanup_worker, daemon=True)
        thread.start()

    def configure(self, **kwargs):
        """更新摄像头配"""
        for key, value in kwargs.items():
            if hasattr(self.config, key):
                setattr(self.config, key, value)

    def start(self) -> bool:
        """启动摄像"""
        if not OPENCV_AVAILABLE:
            self.status = CameraStatus.ERROR
            self.error_message = 'OpenCV not installed'
            return False

        with self._lock:
            if self.status == CameraStatus.RUNNING:
                return True

            self.status = CameraStatus.STARTING
            self.error_message = None

            try:
                # 使用 DirectShow 后端 (Windows 上更可靠)
                self.camera = cv2.VideoCapture(self.config.device_index, cv2.CAP_DSHOW)

                if not self.camera.isOpened():
                    # 如果 DirectShow 失败，尝试默认后
                    print(f"[Camera] DirectShow 后端失败，尝试默认后端...")
                    self.camera = cv2.VideoCapture(self.config.device_index)

                if not self.camera.isOpened():
                    self.status = CameraStatus.ERROR
                    self.error_message = f"无法打开摄像头 (设备索引: {self.config.device_index})"
                    return False

                # 设置分辨
                self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, self.config.resolution_width)
                self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config.resolution_height)

                # 尝试读取一帧确保摄像头真正工作
                ret, _ = self.camera.read()
                if not ret:
                    self.camera.release()
                    self.status = CameraStatus.ERROR
                    self.error_message = f"摄像头无法获取画面 (设备索引: {self.config.device_index})"
                    return False

                # 启动帧捕获线
                self.running = True
                self.capture_thread = threading.Thread(target=self._capture_loop, daemon=True)
                self.capture_thread.start()

                self.status = CameraStatus.RUNNING
                print(f"[Camera] 摄像头已启动 (设备: {self.config.device_index}, 分辨率: {self.config.resolution_width}x{self.config.resolution_height})")
                return True

            except Exception as e:
                self.status = CameraStatus.ERROR
                self.error_message = str(e)
                print(f"[Camera] 启动失败: {e}")
                return False

    def stop(self):
        """停止摄像"""
        # 先设running = False，让捕获线程退
        self.running = False

        # 先释放摄像头，让 camera.read() 返回失败从而退出循
        if self.camera:
            try:
                self.camera.release()
            except:
                pass
            self.camera = None

        # 等待捕获线程退出（短超时，因为摄像头已释放
        if self.capture_thread and self.capture_thread.is_alive():
            self.capture_thread.join(timeout=1)

        with self._lock:
            self.status = CameraStatus.STOPPED
            self.last_frame = None
            print("[Camera] 摄像头已停止")

    def _capture_loop(self):
        """帧捕获循环（在独立线程中运行"""
        frame_interval = 1.0 / self.config.frame_rate
        consecutive_failures = 0
        max_failures = 30  # 连续失败30次后停止

        while self.running:
            start_time = time.time()

            try:
                # 检查摄像头是否有效
                if self.camera is None or not self.camera.isOpened():
                    break

                ret, frame = self.camera.read()

                if not ret:
                    # 如果正在停止，直接退
                    if not self.running:
                        break
                    consecutive_failures += 1
                    if consecutive_failures >= max_failures:
                        print(f"[Camera] 连续 {max_failures} 次帧获取失败，停止摄像头")
                        with self._lock:
                            self.status = CameraStatus.ERROR
                            self.error_message = 'Camera capture failed; check device connection'
                        break
                    time.sleep(0.1)
                    continue

                # 成功获取帧，重置失败计数
                consecutive_failures = 0

                # 编码为JPEG
                encode_param = [int(cv2.IMWRITE_JPEG_QUALITY), self.config.jpeg_quality]
                ret, jpeg = cv2.imencode('.jpg', frame, encode_param)

                if ret:
                    with self.frame_lock:
                        self.last_frame = jpeg.tobytes()

            except Exception as e:
                # 摄像头被释放时会抛出异常，直接退
                if not self.running:
                    break
                print(f"[Camera] 帧捕获异常: {e}")

            # 控制帧率
            elapsed = time.time() - start_time
            if elapsed < frame_interval:
                time.sleep(frame_interval - elapsed)

    def get_frame(self) -> Optional[bytes]:
        """获取最新帧"""
        self.last_access_time = time.time()
        with self.frame_lock:
            return self.last_frame

    def register_client(self):
        """注册客户"""
        with self._lock:
            self.client_count += 1
            print(f"[Camera] 客户端连接，当前: {self.client_count}")

    def unregister_client(self):
        """注销客户"""
        with self._lock:
            self.client_count = max(0, self.client_count - 1)
            print(f"[Camera] 客户端断开，当前: {self.client_count}")

    def get_status(self) -> Dict[str, Any]:
        """获取摄像头状"""
        return {
            'status': self.status.value,
            'client_count': self.client_count,
            'config': {
                'device_index': self.config.device_index,
                'frame_rate': self.config.frame_rate,
                'jpeg_quality': self.config.jpeg_quality,
                'resolution': f"{self.config.resolution_width}x{self.config.resolution_height}"
            },
            'error': self.error_message,
            'opencv_available': OPENCV_AVAILABLE
        }

# 全局摄像头管理器实例
camera_manager = CameraManager()

def create_error_frame(message: str) -> bytes:
    """创建错误提示"""
    # 创建黑色背景
    img = np.zeros((480, 640, 3), dtype=np.uint8)

    if OPENCV_AVAILABLE:
        # 添加错误文字
        font = cv2.FONT_HERSHEY_SIMPLEX
        # 计算文字大小和位
        text_size = cv2.getTextSize(message, font, 0.8, 2)[0]
        text_x = (640 - text_size[0]) // 2
        text_y = (480 + text_size[1]) // 2
        cv2.putText(img, message, (text_x, text_y), font, 0.8, (255, 255, 255), 2)

        # 编码为JPEG
        _, jpeg = cv2.imencode('.jpg', img)
        return jpeg.tobytes()
    else:
        # 返回空帧
        return b''

@app.route('/api/video/stream', methods=['GET'])
def video_stream():
    """
    MJPEG over HTTP 视频流端    使用 multipart/x-mixed-replace 实现流式传输
    """
    def generate():
        # 确保摄像头启
        if not camera_manager.start():
            # 返回错误
            error_frame = create_error_frame("Camera unavailable")
            if error_frame:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + error_frame + b'\r\n')
            return

        # 注册客户
        camera_manager.register_client()
        client_registered = True

        try:
            frame_interval = 1.0 / camera_manager.config.frame_rate

            while True:
                frame = camera_manager.get_frame()

                if frame:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

                time.sleep(frame_interval)

        except GeneratorExit:
            # 客户端断开连接
            print("[Camera] 视频流 GeneratorExit - 客户端断开")
        except Exception as e:
            # 其他异常（如连接重置
            print(f"[Camera] 视频流异常: {e}")
        finally:
            if client_registered:
                camera_manager.unregister_client()
                print("[Camera] stream cleanup done")

    return Response(
        generate(),
        mimetype='multipart/x-mixed-replace; boundary=frame',
        headers={
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-Accel-Buffering': 'no',
            'Connection': 'close'
        }
    )

@app.route('/api/video/snapshot', methods=['GET'])
def video_snapshot():
    """获取当前帧快照（单张图片"""
    if camera_manager.status != CameraStatus.RUNNING:
        if not camera_manager.start():
            return jsonify({'error': camera_manager.error_message or '摄像头不可用'}), 503

    frame = camera_manager.get_frame()

    if frame:
        return Response(frame, mimetype='image/jpeg')
    else:
        return jsonify({'error': 'failed to get frame'}), 500

@app.route('/api/video/status', methods=['GET'])
def video_status():
    """获取摄像头状"""
    return jsonify(camera_manager.get_status())

@app.route('/api/video/config', methods=['GET', 'POST'])
def video_config():
    """获取或更新摄像头配置"""
    if request.method == 'GET':
        return jsonify({
            'device_index': camera_manager.config.device_index,
            'frame_rate': camera_manager.config.frame_rate,
            'jpeg_quality': camera_manager.config.jpeg_quality,
            'resolution_width': camera_manager.config.resolution_width,
            'resolution_height': camera_manager.config.resolution_height
        })

    data = request.json or {}
    need_restart = False

    # 更新配置
    if 'device_index' in data:
        new_index = int(data['device_index'])
        if new_index != camera_manager.config.device_index:
            camera_manager.config.device_index = new_index
            need_restart = True
    if 'frame_rate' in data:
        camera_manager.config.frame_rate = max(1, min(30, int(data['frame_rate'])))
    if 'jpeg_quality' in data:
        camera_manager.config.jpeg_quality = max(1, min(100, int(data['jpeg_quality'])))
    if 'resolution_width' in data:
        new_width = int(data['resolution_width'])
        if new_width != camera_manager.config.resolution_width:
            camera_manager.config.resolution_width = new_width
            need_restart = True
    if 'resolution_height' in data:
        new_height = int(data['resolution_height'])
        if new_height != camera_manager.config.resolution_height:
            camera_manager.config.resolution_height = new_height
            need_restart = True

    # 如果摄像头正在运行且需要重启，则在后台线程中重启（避免阻塞HTTP响应
    if need_restart and camera_manager.status == CameraStatus.RUNNING:
        def restart_camera():
            print(f"[Camera] 正在重启摄像头，切换到设备 {camera_manager.config.device_index}...")
            camera_manager.stop()
            time.sleep(1.0)  # 等待资源完全释放（增加到1秒）
            success = camera_manager.start()
            if success:
                print('[Camera] restart success')
            else:
                print(f"[Camera] 摄像头重启失败: {camera_manager.error_message}")
        threading.Thread(target=restart_camera, daemon=True).start()

    return jsonify({'success': True, 'config': camera_manager.get_status()['config']})

@app.route('/api/video/start', methods=['POST'])
def video_start():
    """手动启动摄像"""
    success = camera_manager.start()
    return jsonify({
        'success': success,
        'status': camera_manager.get_status()
    })

@app.route('/api/video/stop', methods=['POST'])
def video_stop():
    """手动停止摄像"""
    camera_manager.stop()
    # 停止时重置客户端计数（修复计数不准确问题
    with camera_manager._lock:
        camera_manager.client_count = 0
    return jsonify({
        'success': True,
        'status': camera_manager.get_status()
    })

@app.route('/api/video/reset-clients', methods=['POST'])
def video_reset_clients():
    """重置客户端计数（用于调试和恢复）"""
    with camera_manager._lock:
        old_count = camera_manager.client_count
        camera_manager.client_count = 0
    print(f"[Camera] 客户端计数已重置: {old_count} -> 0")
    return jsonify({
        'success': True,
        'old_count': old_count,
        'status': camera_manager.get_status()
    })

@app.route('/api/video/devices', methods=['GET'])
def video_devices():
    """检测可用的摄像头设"""
    if not OPENCV_AVAILABLE:
        return jsonify({'devices': [], 'error': 'OpenCV not installed'})

    devices = []
    current_device = camera_manager.config.device_index
    camera_running = camera_manager.status == CameraStatus.RUNNING

    # 如果摄像头正在运行，直接返回当前设备信息，不进行检    # 避免与正在使用的摄像头冲
    if camera_running and camera_manager.camera:
        # 返回当前正在使用的摄像头
        try:
            width = int(camera_manager.camera.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(camera_manager.camera.get(cv2.CAP_PROP_FRAME_HEIGHT))
            devices.append({
                'index': current_device,
                'name': f'摄像头 {current_device} (当前使用中)',
                'resolution': f'{width}x{height}',
                'available': True
            })
        except:
            devices.append({
                'index': current_device,
                'name': f'摄像头 {current_device} (当前使用中)',
                'resolution': '未知',
                'available': True
            })

        # 快速检测其他设备（不读取帧，只检查是否可以打开
        for i in range(5):  # 只检测前5
            if i == current_device:
                continue
            try:
                cap = cv2.VideoCapture(i, cv2.CAP_DSHOW)  # 使用 DirectShow，更
                if cap.isOpened():
                    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    devices.append({
                        'index': i,
                        'name': f'摄像头 {i}',
                        'resolution': f'{width}x{height}',
                        'available': True
                    })
                    cap.release()
            except:
                continue
    else:
        # 摄像头未运行，可以完整检
        for i in range(5):  # 只检测前5个设
            try:
                cap = cv2.VideoCapture(i, cv2.CAP_DSHOW)  # 使用 DirectShow
                if cap.isOpened():
                    # 快速获取分辨率信息，不读取
                    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    if width > 0 and height > 0:
                        devices.append({
                            'index': i,
                            'name': f'摄像头 {i}',
                            'resolution': f'{width}x{height}',
                            'available': True
                        })
                    cap.release()
            except Exception as e:
                print(f"[Camera] 检测设备 {i} 失败: {e}")
                continue

    # 按索引排
    devices.sort(key=lambda x: x['index'])

    return jsonify({
        'devices': devices,
        'current_device': current_device
    })

# ==================== Fay 聊天记录转发接口 ====================
# Fay 数字API 地址 (可通过环境变量配置)
FAY_API_BASE = os.environ.get('FAY_HTTP_URL', 'http://127.0.0.1:5000')
FAY_WS_URL = os.environ.get('FAY_WS_URL', 'ws://127.0.0.1:10002')

# ==================== Fay WebSocket 转发 ====================
# 用于Fay 的实时消息转发给管理端和屏幕
fay_ws_client = None
fay_ws_connected = False
fay_ws_thread = None
# Ļ˳ʼϢ· Output: false Ȳ
last_fay_init_payload = None

# 屏幕Socket.IO namespace
elderly_clients: Set[str] = set()  # 记录连接的屏幕端客户
@socketio.on('connect', namespace='/elderly')
def elderly_connect():
    """屏幕端连"""
    elderly_clients.add(request.sid)
    print(f'[Elderly WS] 屏幕端已连接: {request.sid}, 当前连接数: {len(elderly_clients)}')
    emit('connected', {'status': 'ok', 'sid': request.sid})

@socketio.on('disconnect', namespace='/elderly')
def elderly_disconnect():
    """屏幕端断开连接"""
    elderly_clients.discard(request.sid)
    print(f'[Elderly WS] 屏幕端已断开: {request.sid}, 当前连接数: {len(elderly_clients)}')

@socketio.on('init', namespace='/elderly')
def elderly_init(data):
    """Ļ˳ʼϢ"""
    print(f'[Elderly WS] Ļ˳ʼ: {data}')
    
    # תʼϢ Fayڿ Output: false Ȳ
    global fay_ws_connected, fay_ws_client, last_fay_init_payload
    try:
        import json
        msg = json.dumps(data)
        # 棬 Fay WS ·
        last_fay_init_payload = msg
        if fay_ws_connected and fay_ws_client:
            fay_ws_client.send(msg)
            print(f'[Elderly WS] תʼϢ Fay: {msg}')
    except Exception as e:
        print(f'[Elderly WS] תʼϢ Fay ʧ: {e}')
            
    emit('init_ack', {'status': 'ok'})

def on_fay_message(ws, message):
    """收到 Fay WebSocket 消息时转发给管理端和屏幕"""
    global fay_ws_connected
    try:
        data = json.loads(message)
        print(f'[Fay WS] 收到消息: {data}')

        # 解析 Fay 的消息格        # Fay 格式: {Data: {Key: 'text'/'log'/'audio', Value: '...', IsFirst: 1, IsEnd: 0, Text: '...'}}
        if 'Data' in data:
            fay_data = data['Data']
            key = fay_data.get('Key', '')

            # 转发给管理端（转换格式）
            if key in ['text', 'log']:
                converted = {
                    'type': key,
                    'text': fay_data.get('Value', '') or fay_data.get('Text', ''),
                    'is_first': fay_data.get('IsFirst', 0),
                    'is_end': fay_data.get('IsEnd', 0),
                }
                print(f'[Fay WS] 转换后消息: {converted}')
                socketio.emit('fay_message', converted, namespace='/fay')
            elif key == 'audio':
                text = fay_data.get('Text', '')
                if text:
                    converted = {
                        'type': 'text',
                        'text': text,
                        'is_first': fay_data.get('IsFirst', 0),
                        'is_end': fay_data.get('IsEnd', 0),
                    }
                    print(f'[Fay WS] 从audio提取文本: {converted}')
                    socketio.emit('fay_message', converted, namespace='/fay')

            # 转发给屏幕端（只转发 text log 消息，audio 消息会和 text 重复            # 问题分析：Fay 对同一句话会先text 再发 audio，两者内容相            # 如果都转发会导致前端 SDK 被调用两次，触发速率限制导致后续消息丢失
            if key in ['text', 'log'] and len(elderly_clients) > 0:
                print(f'[Fay WS] forwarded to {len(elderly_clients)} clients')
                socketio.emit('fay_message', data, namespace='/elderly')
            elif key == 'audio':
                # 跳过 audio 消息，避免重复（text 消息已包含相同内容）
                print(f'[Fay WS] 跳过 audio 消息转发（已通过 text 消息发送）')
        else:
            # 直接转发其他格式的消
            socketio.emit('fay_message', data, namespace='/fay')
            if len(elderly_clients) > 0:
                socketio.emit('fay_message', data, namespace='/elderly')

    except json.JSONDecodeError:
        print(f'[Fay WS] 非JSON消息: {message}')
    except Exception as e:
        print(f'[Fay WS] 处理消息失败: {e}')

def on_fay_error(ws, error):
    """Fay WebSocket 错误处理"""
    global fay_ws_connected
    print(f'[Fay WS] 错误: {error}')
    fay_ws_connected = False

def on_fay_close(ws, close_status_code, close_msg):
    """Fay WebSocket 关闭处理"""
    global fay_ws_connected
    print(f'[Fay WS] 连接关闭: {close_status_code} - {close_msg}')
    fay_ws_connected = False

def on_fay_open(ws):
    """Fay WebSocket ӳɹ"""
    global fay_ws_connected, last_fay_init_payload
    print(f'[Fay WS] ӵ {FAY_WS_URL}')
    fay_ws_connected = True
    # ·Ļ˳ʼϢ Output: false
    if last_fay_init_payload:
        try:
            ws.send(last_fay_init_payload)
            print(f'[Fay WS] Re-sent init payload after reconnect: {last_fay_init_payload}')
        except Exception as e:
            print(f'[Fay WS] Failed to send init payload after reconnect: {e}')


def connect_to_fay_ws():
    """ӵ Fay  WebSocket """
    global fay_ws_client, fay_ws_connected

    while True:
        try:
            if not fay_ws_connected:
                print(f'[Fay WS]  {FAY_WS_URL}...')
                fay_ws_client = websocket.WebSocketApp(
                    FAY_WS_URL,
                    on_message=on_fay_message,
                    on_error=on_fay_error,
                    on_close=on_fay_close,
                    on_open=on_fay_open
                )
                fay_ws_client.run_forever(reconnect=5)
        except Exception as e:
            print(f'[Fay WS] 쳣: {e}')
            fay_ws_connected = False

        # ȴ
        time.sleep(5)
def start_fay_ws_relay():
    """启动 Fay WebSocket 转发线程"""
    global fay_ws_thread
    if fay_ws_thread is None or not fay_ws_thread.is_alive():
        fay_ws_thread = threading.Thread(target=connect_to_fay_ws, daemon=True)
        fay_ws_thread.start()
        print('[Fay WS] relay thread started')

# Socket.IO 事件处理
@socketio.on('connect', namespace='/fay')
def handle_fay_connect():
    """管理端客户端连接"""
    print('[Socket.IO] admin client connected')
    # 发送当Fay WS 连接状
    emit('fay_ws_status', {'connected': fay_ws_connected})

@socketio.on('disconnect', namespace='/fay')
def handle_fay_disconnect():
    """管理端客户端断开"""
    print(f'[Socket.IO] 管理端客户端已断开')

@app.route('/api/fay/chat-history', methods=['POST'])
def get_fay_chat_history():
    """
    转发 Fay 的聊天记录接    让管理端（手机）可以通过服务器IP访问聊天记录
    """
    try:
        data = request.get_json() or {}
        username = data.get('username', 'User')
        limit = data.get('limit', 100)

        # 转发请求Fay
        response = requests.post(
            f'{FAY_API_BASE}/api/get-msg',
            json={'username': username, 'limit': limit},
            timeout=10
        )

        if response.ok:
            return jsonify(response.json())
        else:
            return jsonify({'error': '获取聊天记录失败', 'list': []}), response.status_code

    except requests.exceptions.ConnectionError:
        return jsonify({'error': '无法连接到Fay服务', 'list': []}), 503
    except requests.exceptions.Timeout:
        return jsonify({'error': 'Fay服务响应超时', 'list': []}), 504
    except Exception as e:
        print(f'[ERROR] 获取Fay聊天记录失败: {e}')
        return jsonify({'error': str(e), 'list': []}), 500


@app.route('/api/fay/chat', methods=['POST'])
def send_fay_chat():
    """
    转发消息Fay 的聊天接    让管理端可以通过服务器IP发送消息给数字    """
    try:
        data = request.get_json() or {}
        username = data.get('username', 'User')
        content = data.get('content', '')

        if not content.strip():
            return jsonify({'error': '消息内容不能为空'}), 400

        # 转发请求Fay chat completions 接口
        response = requests.post(
            f'{FAY_API_BASE}/v1/chat/completions',
            json={
                'model': 'fay-streaming',
                'messages': [{'role': username, 'content': content}],
                'stream': True
            },
            timeout=30,
            stream=True  # 流式响应
        )

        if response.ok:
            # 消费流式响应，确保请求完
            for _ in response.iter_lines():
                pass
            return jsonify({'success': True, 'message': 'message sent'})
        else:
            return jsonify({'error': 'send failed'}), response.status_code

    except requests.exceptions.ConnectionError:
        return jsonify({'error': '无法连接到Fay服务'}), 503
    except requests.exceptions.Timeout:
        return jsonify({'error': 'Fay服务响应超时'}), 504
    except Exception as e:
        print(f'[ERROR] 发送Fay消息失败: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/api/fay/chat-stream', methods=['POST'])
def send_fay_chat_stream():
    """
    转发消息Fay 的聊天接口（流式    实时Fay 的回复流式转发给前端
    """
    data = request.get_json() or {}
    username = data.get('username', 'User')
    content = data.get('content', '')

    if not content.strip():
        return jsonify({'error': '消息内容不能为空'}), 400

    def generate():
        try:
            # 转发请求Fay chat completions 接口
            response = requests.post(
                f'{FAY_API_BASE}/v1/chat/completions',
                json={
                    'model': 'fay-streaming',
                    'messages': [{'role': username, 'content': content}],
                    'stream': True
                },
                timeout=60,
                stream=True
            )

            if not response.ok:
                yield f'data: {{"error": "Fay服务返回错误: {response.status_code}"}}\n\n'
                return

            # 逐行读取并转发流式响
            for line in response.iter_lines():
                if line:
                    line_str = line.decode('utf-8')
                    # Fay 返回的格式是 "data: {...}"
                    if line_str.startswith('data:'):
                        data_part = line_str[5:].strip()
                        if data_part == '[DONE]':
                            yield 'data: [DONE]\n\n'
                        else:
                            try:
                                # 解析 Fay 返回的数
                                parsed = json.loads(data_part)
                                # 提取 content
                                if 'choices' in parsed and len(parsed['choices']) > 0:
                                    delta = parsed['choices'][0].get('delta', {})
                                    content_chunk = delta.get('content', '')
                                    if content_chunk:
                                        yield f'data: {{"content": {json.dumps(content_chunk)}}}\n\n'
                            except json.JSONDecodeError:
                                # 直接转发原始数据
                                yield f'{line_str}\n\n'

            yield 'data: [DONE]\n\n'

        except requests.exceptions.ConnectionError:
            yield 'data: {"error": "无法连接到Fay服务"}\n\n'
        except requests.exceptions.Timeout:
            yield 'data: {"error": "Fay服务响应超时"}\n\n'
        except Exception as e:
            print(f'[ERROR] 流式发送Fay消息失败: {e}')
            yield f'data: {{"error": "{str(e)}"}}\n\n'

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive'
        }
    )

@app.route('/api/device/lan-ip', methods=['GET'])
def get_device_lan_ip():
    """获取屏幕端保存的局域网 IP。"""
    return jsonify({'lan_ip': get_saved_lan_ip()})

@app.route('/api/device/lan-ip', methods=['POST'])
def save_device_lan_ip():
    """保存屏幕端局域网 IP。"""
    data = request.get_json() or {}
    lan_ip = str(data.get('lan_ip', '')).strip()

    if not is_valid_lan_ip(lan_ip):
        return jsonify({'error': '请输入合法的局域网 IP'}), 400

    if not update_saved_lan_ip(lan_ip):
        return jsonify({'error': '保存局域网 IP 失败'}), 500

    return jsonify({'success': True, 'lan_ip': lan_ip})


@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查端"""
    return jsonify({'status': 'ok', 'timestamp': datetime.now().isoformat()})

# ==================== 资源监控 ====================
resource_monitor_thread = None

def get_gpu_usage():
    """
    获取 GPU 使用    支持 NVIDIA GPU (nvidia-smi)、AMD GPU、Intel GPU
    如果无法获取则返None
    """
    import subprocess

    # 1. 尝试 NVIDIA GPU (nvidia-smi)
    try:
        result = subprocess.run(
            ['nvidia-smi', '--query-gpu=utilization.gpu', '--format=csv,noheader,nounits'],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            gpu_usage = float(result.stdout.strip().split('\n')[0])
            return gpu_usage
    except:
        pass

    # 2. 尝试 AMD GPU (/sys/class/drm/card*/device/gpu_busy_percent)
    try:
        for card in ['card0', 'card1']:
            path = f'/sys/class/drm/{card}/device/gpu_busy_percent'
            if os.path.exists(path):
                with open(path, 'r') as f:
                    return float(f.read().strip())
    except:
        pass

    # 3. 尝试 Intel GPU (intel_gpu_top /sys 文件)
    try:
        path = '/sys/class/drm/card0/gt/gt0/rps_cur_freq_mhz'
        if os.path.exists(path):
            with open(path, 'r') as f:
                # Intel GPU 返回频率，需要转换为使用率（这里简化处理）
                freq = float(f.read().strip())
                max_freq_path = '/sys/class/drm/card0/gt/gt0/rps_max_freq_mhz'
                if os.path.exists(max_freq_path):
                    with open(max_freq_path, 'r') as mf:
                        max_freq = float(mf.read().strip())
                        return (freq / max_freq) * 100 if max_freq > 0 else None
    except:
        pass

    # 4. 尝试摩尔线程 GPU（暂无标准接口，返回 None    # TODO: 如果摩尔线程提供了监控接口，可以在这里添
    return None

def monitor_resources():
    """后台监控系统资源"""
    while True:
        try:
            # 获取CPU和内存使用率
            cpu_percent = psutil.cpu_percent(interval=2) # 2秒采集一            
            memory_info = psutil.virtual_memory()
            memory_percent = memory_info.percent

            # 获取GPU使用
            gpu_percent = get_gpu_usage()

            # 推送数据到所有客户端
            stats = {
                'cpu': cpu_percent,
                'memory': memory_percent
            }
            if gpu_percent is not None:
                stats['gpu'] = gpu_percent

            socketio.emit('system_stats', stats)
        except Exception as e:
            print(f"[Resource Monitor] Error: {e}")
            time.sleep(5)

def start_resource_monitor():
    """启动资源监控线程"""
    global resource_monitor_thread
    if resource_monitor_thread is None or not resource_monitor_thread.is_alive():
        resource_monitor_thread = threading.Thread(target=monitor_resources, daemon=True)
        resource_monitor_thread.start()
        print('[Resource Monitor] thread started')

# 初始化数据库（在模块加载时执行）
init_db()
print("数据库初始化完成")

# 启动 Fay WebSocket 转发
start_fay_ws_relay()
print("Fay WebSocket relay started")

# 启动资源监控
start_resource_monitor()
print("Resource monitor started")

if __name__ == '__main__':
    # 启动应用（使socketio.run 替代 app.run
    socketio.run(app, host='0.0.0.0', port=8000, debug=True, allow_unsafe_werkzeug=True)
