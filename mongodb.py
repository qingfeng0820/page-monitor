import logging
import os
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient

from security import UserService, verify_password
from models import User

# 配置MongoDB连接
MONGODB_URI = os.getenv("MONGO_DB_CONN_STR", "mongodb://localhost:27017/")

# 添加连接池配置和连接选项
MONGODB_OPTIONS = {
    'maxPoolSize': 100,  # 最大连接池大小
    'minPoolSize': 10,   # 最小连接池大小
    'maxIdleTimeMS': 30000,  # 连接最大空闲时间（毫秒）
    'serverSelectionTimeoutMS': 5000,  # 服务器选择超时时间
    'connectTimeoutMS': 20000,  # 连接超时时间
    'socketTimeoutMS': 20000,  # socket超时时间
    'heartbeatFrequencyMS': 20000,  # 心跳检测频率
}

# 应用连接池配置和连接选项
client = AsyncIOMotorClient(MONGODB_URI, **MONGODB_OPTIONS)
db = client["page_monitor"]
stats_collection = db["monitor_stats"]

# 网站信息集合（存储site_name, site_url, creator, api_key等）
sites_collection = db["sites"]

# 用户信息集合（存储name, password, email, phone, permissions等）
users_collection = db["users"]

logger = logging.getLogger(__name__)


async def init_db():
    try:
        # 添加索引以提高查询性能
        # 为常用查询字段创建三级复合唯一索引（系统+日期+统计类型）
        await stats_collection.create_index([("system", 1), ("date", 1), ("type", 1)], unique=True, background=True)
        # 为单个查询字段创建索引
        await stats_collection.create_index([("system", 1)], background=True)
        await stats_collection.create_index([("date", 1)], background=True)
        await stats_collection.create_index([("type", 1)], background=True)
        # 为lastUpdated字段创建索引，方便按时间排序
        await stats_collection.create_index([("lastUpdated", -1)], background=True)
        
        # 为sites_collection的字段添加索引
        await sites_collection.create_index([("site_name", 1)], unique=True, background=True)  # 网站名称唯一
        await sites_collection.create_index([("api_key", 1)], unique=True, background=True)    # API密钥唯一
        await sites_collection.create_index([("creator", 1)], background=True)                 # 按创建者查询
        
        # 为users_collection的字段添加索引
        await users_collection.create_index([("email", 1)], unique=True, background=True)     # 邮箱唯一
        await users_collection.create_index([("name", 1)], background=True)                   # 按用户名查询

        logger.info("MongoDB connection established successfully")
        logger.info("MongoDB indexes created successfully")
    except Exception as e:
        logger.error(f"Failed to connect to MongoDB or create indexes: {str(e)}")
        logger.error("Application will continue to run without MongoDB connection")


class MongoDBUserService(UserService):
    async def get_user_by_username(self, username: str) -> Optional[User]:
        """从MongoDB用户集合中根据用户名获取用户"""
        user_doc = await users_collection.find_one({"username": username})
        if user_doc:
            # 转换MongoDB文档为User对象
            return User(
                id=str(user_doc.get("_id")),
                username=user_doc.get("username"),
                email=user_doc.get("email"),
                full_name=user_doc.get("full_name"),
                disabled=user_doc.get("disabled", False),
                permissions=user_doc.get("permissions", []),
                is_super=user_doc.get("is_super", False)
            )
        return None

    async def authenticate_user(self, username: str, password: str) -> Optional[User]:
        """验证用户凭证"""
        user = await self.get_user_by_username(username)
        if user:
            # 检查密码
            user_doc = await users_collection.find_one({"username": username})
            hashed_password = user_doc.get("password")
            if hashed_password and verify_password(password, hashed_password):
                return user
        return None
