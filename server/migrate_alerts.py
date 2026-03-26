"""
数据库迁移脚本 - 升级 family_alerts 表结构
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'officeecho.db')

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # 检查表是否存在
        cursor.execute('''
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='family_alerts'
        ''')

        if cursor.fetchone():
            print("表 family_alerts 已存在，开始迁移...")

            # 重命名旧表
            cursor.execute('ALTER TABLE family_alerts RENAME TO family_alerts_old')

            # 创建新表
            cursor.execute('''
                CREATE TABLE family_alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    family_id TEXT NOT NULL,
                    elderly_id INTEGER,
                    alert_type TEXT NOT NULL,
                    level TEXT NOT NULL,
                    title TEXT,
                    message TEXT NOT NULL,
                    metadata TEXT,
                    source TEXT DEFAULT 'elderly',
                    handled INTEGER DEFAULT 0,
                    handled_at TIMESTAMP,
                    handled_by INTEGER,
                    reply_message TEXT,
                    read INTEGER DEFAULT 0,
                    read_at TIMESTAMP,
                    is_active INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (elderly_id) REFERENCES users(id),
                    FOREIGN KEY (handled_by) REFERENCES users(id)
                )
            ''')

            # 复制旧数据
            cursor.execute('''
                INSERT INTO family_alerts
                (id, family_id, alert_type, level, message, handled, handled_at, created_at, updated_at)
                SELECT id, family_id, alert_type, level, message, handled, handled_at, created_at, updated_at
                FROM family_alerts_old
            ''')

            # 删除旧表
            cursor.execute('DROP TABLE family_alerts_old')

            print("数据迁移完成！")
        else:
            print("表不存在，将在初始化时创建")

        # 创建索引
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

        print("索引创建完成！")

        conn.commit()
        print("\n✅ 迁移成功！")

    except Exception as e:
        conn.rollback()
        print(f"\n❌ 迁移失败: {e}")
        import traceback
        traceback.print_exc()

    finally:
        conn.close()

if __name__ == '__main__':
    migrate()
