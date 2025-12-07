from urllib.parse import quote

from fastapi import FastAPI, HTTPException, Request, Response, APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from pymongo import MongoClient
from datetime import datetime
from typing import Optional
import re
import os
import hashlib
import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse

from security import cleanup_expired_cache, require_login, logout_user, login_user, get_current_user, JWT_EXPIRE_PERIOD

# 配置logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from starlette.middleware.cors import CORSMiddleware

app = FastAPI(title="页面访问监控API")

# 获取CORS允许的源列表
allow_origins_env = os.getenv("ALLOW_ORIGINS")
allow_origins = []

if allow_origins_env:
    # 如果环境变量不为空，按逗号分割多个源
    allow_origins = [origin.strip() for origin in allow_origins_env.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",  # 允许本地任意端口
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有方法
    allow_headers=["*"],  # 允许所有头
)


class TokenRefreshMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        # 如果有新生成的令牌，更新响应的cookie
        if hasattr(request.state, 'new_token'):
            response.set_cookie(
                key="access_token", 
                value=request.state.new_token, 
                httponly=True, 
                secure=False,  # 生产环境应设置为True
                max_age=JWT_EXPIRE_PERIOD
            )
        return response


app.add_middleware(TokenRefreshMiddleware)


# MongoDB连接
MONGODB_URI = os.getenv("MONGO_DB_CONN_STR", "mongodb://localhost:27017/")
client = MongoClient(MONGODB_URI)
db = client["page_monitor"]
stats_collection = db["stats"]

# 创建API路由
api_router = APIRouter(prefix="/api")


def sanitize_key(key: str) -> str:
    """清理key中的特殊字符"""
    if not key:
        return "unknown"
    # 替换MongoDB保留字符
    return re.sub(r'[.$]', '_', str(key))


def sanitize_fingerprint(fingerprint: str) -> str:
    """清理和验证用户指纹"""
    if not fingerprint:
        return "anonymous"
    # 对指纹进行哈希处理，确保格式统一且安全
    return hashlib.md5(str(fingerprint).encode()).hexdigest()


def get_client_ip(request: Request) -> str:
    """获取客户端IP地址"""
    # 尝试从X-Forwarded-For头获取IP（如果使用了代理）
    client_ip = request.headers.get("X-Forwarded-For")
    if client_ip:
        # X-Forwarded-For格式: client_ip, proxy1_ip, proxy2_ip
        return client_ip.split(",")[0].strip()
    # 直接从请求获取客户端IP
    return request.client.host


async def _track_common(request: Request, data: dict, track_type: str, detail_handler):
    """
    通用跟踪处理函数，处理重复的初始化和数据库更新逻辑
    :param request: 请求对象
    :param data: 请求数据
    :param track_type: 跟踪类型（pageview, download, event, duration）
    :param detail_handler: 具体跟踪类型的处理函数，返回update_fields
    :return: 跟踪结果
    """
    try:
        # 从request data中获取system参数
        system = sanitize_key(data.get('system', 'default'))
        # 获取并处理用户指纹
        user_fingerprint = sanitize_fingerprint(data.get('userFingerprint', ''))
        # 获取客户端IP并用于统计分析
        client_ip = get_client_ip(request)
        # 获取IP前两段用于地域统计（保护隐私）
        ip_prefix = '_'.join(client_ip.split('.')[:2]) if '.' in client_ip else 'unknown'
        # 获取当前日期（用于按天分片）
        current_date = datetime.utcnow().strftime('%Y-%m-%d')
        
        # 调用具体处理函数获取update_fields
        update_fields = detail_handler(data, track_type, system, user_fingerprint, client_ip, ip_prefix, current_date)
        
        # 按系统和日期分片存储数据
        result = stats_collection.update_one(
            {'system': system, 'date': current_date},
            update_fields,
            upsert=True
        )

        return {"success": True, "matched_count": result.matched_count, "modified_count": result.modified_count}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"跟踪{track_type}失败: {str(e)}")


@api_router.post("/track/pageview")
async def track_pageview(request: Request, data: dict):
    """
    跟踪页面访问
    """
    def pageview_handler(data, track_type, system, user_fingerprint, client_ip, ip_prefix, current_date):
        url = sanitize_key(data.get('url', 'unknown'))
        browser = sanitize_key(data.get('browser', 'unknown'))
        os_name = sanitize_key(data.get('os', 'unknown'))
        device = sanitize_key(data.get('device', 'unknown'))
        
        return {
            '$inc': {
                'pageViews.total': 1,
                f'pageViews.byUrl.{url}': 1,
                f'pageViews.byBrowser.{browser}': 1,
                f'pageViews.byOS.{os_name}': 1,
                f'pageViews.byDevice.{device}': 1,
                # IP相关统计（使用IP前缀保护隐私）
                f'pageViews.byIPPrefix.{ip_prefix}': 1,
                f'pageViews.byUrlAndIPPrefix.{url}.{ip_prefix}': 1,
                # 用户指纹统计
                f'pageViews.byUser.{user_fingerprint}': 1,
                f'pageViews.byUrlAndUser.{url}.{user_fingerprint}': 1,
                # 组合维度统计
                f'pageViews.byUrlAndBrowser.{url}.{browser}': 1,
                f'pageViews.byUrlAndDevice.{url}.{device}': 1,
                f'pageViews.byBrowserAndOS.{browser}.{os_name}': 1
            },
            '$set': {
                'system': system,
                'date': current_date,
                'lastUpdated': datetime.utcnow()
            },
            # 记录唯一用户数（使用$addToSet确保每个用户只计数一次）
            '$addToSet': {
                'pageViews.uniqueUsers': user_fingerprint,
                f'pageViews.byUrlUniqueUsers.{url}': user_fingerprint,
                f'pageViews.byIPPrefixUniqueUsers.{ip_prefix}': user_fingerprint,
                f'pageViews.byBrowserAndOsUniqueUsers.{browser}.{os_name}': user_fingerprint
            }
        }
    
    return await _track_common(request, data, "页面访问", pageview_handler)


@api_router.post("/track/download")
async def track_download(request: Request, data: dict):
    """
    跟踪文件下载
    """
    def download_handler(data, track_type, system, user_fingerprint, client_ip, ip_prefix, current_date):
        download_url = sanitize_key(data.get('downloadUrl', 'unknown'))
        file_name = sanitize_key(data.get('fileName', 'unknown'))
        source_page = sanitize_key(data.get('sourcePage', 'unknown'))
        
        return {
            '$inc': {
                'downloads.total': 1,
                f'downloads.byFile.{file_name}': 1,
                f'downloads.byUrl.{download_url}': 1,
                f'downloads.bySourcePage.{source_page}': 1,
                # IP相关统计（使用IP前缀保护隐私）
                f'downloads.byIPPrefix.{ip_prefix}': 1,
                f'downloads.byFileAndIPPrefix.{file_name}.{ip_prefix}': 1,
                # 用户指纹统计
                f'downloads.byUser.{user_fingerprint}': 1,
                f'downloads.byFileAndUser.{file_name}.{user_fingerprint}': 1,
                # 组合维度统计
                f'downloads.byFileAndSource.{file_name}.{source_page}': 1
            },
            '$set': {
                'system': system,
                'date': current_date,
                'lastUpdated': datetime.utcnow()
            },
            # 记录唯一用户数
            '$addToSet': {
                'downloads.uniqueUsers': user_fingerprint,
                f'downloads.byFileUniqueUsers.{file_name}': user_fingerprint,
                f'downloads.byIPPrefixUniqueUsers.{ip_prefix}': user_fingerprint
            }
        }
    
    return await _track_common(request, data, "下载", download_handler)


@api_router.post("/track/event")
async def track_event(request: Request, data: dict):
    """
    跟踪自定义事件
    """
    def event_handler(data, track_type, system, user_fingerprint, client_ip, ip_prefix, current_date):
        event_type = sanitize_key(data.get('eventType', 'click'))
        event_category = sanitize_key(data.get('eventCategory', 'engagement'))
        event_action = sanitize_key(data.get('eventAction', 'click'))
        event_label = sanitize_key(data.get('eventLabel', 'unknown'))
        selector = sanitize_key(data.get('selector', 'unknown'))
        url = sanitize_key(data.get('url', 'unknown'))
        
        return {
            '$inc': {
                'events.total': 1,
                f'events.byType.{event_type}': 1,
                f'events.byCategory.{event_category}': 1,
                f'events.byAction.{event_action}': 1,
                f'events.byLabel.{event_label}': 1,
                f'events.bySelector.{selector}': 1,
                f'events.byUrl.{url}': 1,
                # IP相关统计（使用IP前缀保护隐私）
                f'events.byIPPrefix.{ip_prefix}': 1,
                f'events.byCategoryAndIPPrefix.{event_category}.{ip_prefix}': 1,
                f'events.byActionAndIPPrefix.{event_action}.{ip_prefix}': 1,
                # 用户指纹统计
                f'events.byUser.{user_fingerprint}': 1,
                f'events.byCategoryAndUser.{event_category}.{user_fingerprint}': 1,
                f'events.byCategoryAndActionAndUser.{event_category}.{event_action}.{user_fingerprint}': 1,
                # 组合维度统计
                f'events.byCategoryAndAction.{event_category}.{event_action}': 1,
                f'events.byCategoryAndLabel.{event_category}.{event_label}': 1,
                f'events.byUrlAndAction.{url}.{event_action}': 1
            },
            '$set': {
                'system': system,
                'date': current_date,
                'lastUpdated': datetime.utcnow()
            },
            # 记录唯一用户数（使用$addToSet确保每个用户只计数一次）
            '$addToSet': {
                'events.uniqueUsers': user_fingerprint,
                f'events.byCategoryUniqueUsers.{event_category}': user_fingerprint,
                f'events.byActionUniqueUsers.{event_action}': user_fingerprint,
                f'events.byIPPrefixUniqueUsers.{ip_prefix}': user_fingerprint
            }
        }
    
    return await _track_common(request, data, "自定义事件", event_handler)


@api_router.post("/track/duration")
async def track_duration(request: Request, data: dict):
    """
    跟踪页面停留时长
    """
    def duration_handler(data, track_type, system, user_fingerprint, client_ip, ip_prefix, current_date):
        duration = int(data.get('duration', 0))
        url = sanitize_key(data.get('url', 'unknown'))
        browser = sanitize_key(data.get('browser', 'unknown'))
        os_name = sanitize_key(data.get('os', 'unknown'))
        device = sanitize_key(data.get('device', 'unknown'))
        
        return {
            '$inc': {
                'duration.total': duration,
                'duration.count': 1,
                f'duration.byUrl.{url}': duration,
                f'duration.byUrl.count.{url}': 1,
                f'duration.byBrowser.{browser}': duration,
                f'duration.byBrowser.count.{browser}': 1,
                f'duration.byOS.{os_name}': duration,
                f'duration.byOS.count.{os_name}': 1,
                f'duration.byDevice.{device}': duration,
                f'duration.byDevice.count.{device}': 1,
                # IP相关统计（使用IP前缀保护隐私）
                f'duration.byIPPrefix.{ip_prefix}': duration,
                f'duration.byIPPrefix.count.{ip_prefix}': 1,
                f'duration.byUrlAndIPPrefix.{url}.{ip_prefix}': duration,
                f'duration.byUrlAndIPPrefix.count.{url}.{ip_prefix}': 1,
                # 用户指纹统计
                f'duration.byUser.{user_fingerprint}': duration,
                f'duration.byUser.count.{user_fingerprint}': 1,
                f'duration.byUrlAndUser.{url}.{user_fingerprint}': duration,
                f'duration.byUrlAndUser.count.{url}.{user_fingerprint}': 1,
                # 组合维度统计
                f'duration.byUrlAndBrowser.{url}.{browser}': duration,
                f'duration.byUrlAndBrowser.count.{url}.{browser}': 1,
                f'duration.byUrlAndDevice.{url}.{device}': duration,
                f'duration.byUrlAndDevice.count.{url}.{device}': 1,
                f'duration.byBrowserAndOS.{browser}.{os_name}': duration,
                f'duration.byBrowserAndOS.count.{browser}.{os_name}': 1
            },
            '$set': {
                'system': system,
                'date': current_date,
                'lastUpdated': datetime.utcnow()
            },
            # 记录唯一用户数（使用$addToSet确保每个用户只计数一次）
            '$addToSet': {
                'duration.uniqueUsers': user_fingerprint,
                f'duration.byUrlUniqueUsers.{url}': user_fingerprint,
                f'duration.byIPPrefixUniqueUsers.{ip_prefix}': user_fingerprint
            }
        }
    
    return await _track_common(request, data, "页面停留时长", duration_handler)


def merge_nested_dicts(dict1, dict2):
    """
    合并两个嵌套字典，将相同路径的值相加
    :param dict1: 第一个字典
    :param dict2: 第二个字典
    :return: 合并后的字典
    """
    result = dict1.copy()

    for key, value in dict2.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            # 递归合并嵌套字典
            result[key] = merge_nested_dicts(result[key], value)
        elif key in result and isinstance(result[key], int) and isinstance(value, int):
            # 相加数值
            result[key] = result[key] + value
        else:
            # 其他情况，直接使用新值
            result[key] = value

    return result


def get_top_entries(dictionary, limit=10):
    """
    获取字典中值最大的前N个条目
    :param dictionary: 输入字典
    :param limit: 返回的条目数
    :return: 包含前N个条目的字典
    """
    if not dictionary:
        return {}

    # 处理嵌套字典的情况
    def calculate_total_value(value):
        """计算嵌套字典的总值或返回单个值"""
        if isinstance(value, dict):
            # 如果是嵌套字典，计算所有值的总和
            return sum(calculate_total_value(v) for v in value.values())
        elif isinstance(value, int):
            # 如果是整数，直接返回
            return value
        else:
            # 其他情况返回0
            return 0

    # 对字典项按总值降序排序
    sorted_items = sorted(dictionary.items(),
                          key=lambda x: calculate_total_value(x[1]),
                          reverse=True)
    # 返回前limit个条目
    return dict(sorted_items[:limit])


async def _stats_common(request: Request, system: str, start_date: Optional[str], end_date: Optional[str], limit: int, stats_type: str, result_initializer, unique_users_handler, final_result_handler):
    """
    通用统计处理函数，处理重复的查询和聚合逻辑
    :param request: 请求对象
    :param system: 系统名称
    :param start_date: 开始日期
    :param end_date: 结束日期
    :param limit: 返回条目数限制
    :param stats_type: 统计类型（pageViews, downloads, events, duration）
    :param result_initializer: 初始化聚合结果的函数
    :param unique_users_handler: 处理唯一用户数据的函数
    :param final_result_handler: 处理最终结果的函数
    :return: 统计结果
    """
    try:
        # 构建查询条件
        query = {'system': system, stats_type: {'$exists': True}}

        # 如果提供了日期范围，添加日期过滤条件
        if start_date:
            query['date'] = {'$gte': start_date}
        if end_date:
            if 'date' in query:
                query['date']['$lte'] = end_date
            else:
                query['date'] = {'$lte': end_date}

        # 查询多个日期分片的数据，并按日期排序
        stats_cursor = stats_collection.find(query, {'_id': 0, 'date': 1, stats_type: 1}).sort('date', 1)

        # 初始化聚合结果
        aggregated_stats = result_initializer()
        
        # 初始化趋势数据列表
        trend_data = []

        # 聚合所有日期分片的数据，并收集趋势数据
        for stats in stats_cursor:
            if stats_type in stats:
                stats_data = stats[stats_type]
                date = stats['date']
                
                # 收集当天的趋势数据
                if stats_type == 'duration':
                    # 停留时长统计的趋势数据包含总时长和会话数
                    day_data = {
                        'date': date,
                        'total': stats_data.get('total', 0),
                        'count': stats_data.get('count', 0)
                    }
                else:
                    # 其他统计类型的趋势数据包含总数和独立用户数
                    day_data = {
                        'date': date,
                        'total': stats_data.get('total', 0),
                        'uniqueUsers': len(stats_data.get('uniqueUsers', []))
                    }
                trend_data.append(day_data)

                # 聚合基本统计
                aggregated_stats['total'] += stats_data.get('total', 0)
                # 处理duration统计方法中的count字段
                if 'count' in stats_data and 'count' in aggregated_stats:
                    aggregated_stats['count'] += stats_data.get('count', 0)

                # 聚合嵌套字典数据
                # 动态聚合所有需要merge的嵌套字段
                for key in aggregated_stats:
                    if key != 'total' and key != 'count' and key != 'uniqueUsers' and not key.endswith('UniqueUsers'):
                        aggregated_stats[key] = merge_nested_dicts(aggregated_stats[key], stats_data.get(key, {}))
                        # 在聚合过程中应用limit限制，减少内存占用
                        if key != 'byBrowserAndOsUniqueUsers':  # 特殊字段在finalize中处理
                            aggregated_stats[key] = get_top_entries(aggregated_stats[key], limit)

                # 合并唯一用户集合
                if 'uniqueUsers' in stats_data:
                    aggregated_stats['uniqueUsers'].update(stats_data['uniqueUsers'])

                # 处理特定的唯一用户数据
                unique_users_handler(aggregated_stats, stats_data, stats_type)

        # 将集合转换为列表，方便客户端处理
        aggregated_stats['uniqueUsers'] = list(aggregated_stats['uniqueUsers'])
        
        # 将趋势数据添加到聚合结果中
        aggregated_stats['trendData'] = trend_data

        # 返回处理后的结果
        return final_result_handler(aggregated_stats, limit)

    except Exception as e:
        logger.error(f"获取{stats_type}统计失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取{stats_type}统计失败: {str(e)}")


def _init_pageview_result():
    """
    初始化页面访问统计结果
    """
    return {
        'total': 0,
        'byUrl': {},
        'byBrowser': {},
        'byOS': {},
        'byDevice': {},
        'byIPPrefix': {},
        'byUrlAndIPPrefix': {},
        'byUser': {},
        'byUrlAndUser': {},
        'byUrlAndBrowser': {},
        'byUrlAndDevice': {},
        'byBrowserAndOS': {},
        'uniqueUsers': set(),
        'byIPPrefixUniqueUsers': {},
        'byBrowserAndOsUniqueUsers': {}
    }


def _handle_pageview_unique_users(aggregated_stats, stats_data, stats_type):
    """
    处理页面访问的唯一用户数据
    """
    # 聚合按浏览器和操作系统分组的唯一用户
    for browser, os_data in stats_data.get('byBrowserAndOsUniqueUsers', {}).items():
        if browser not in aggregated_stats['byBrowserAndOsUniqueUsers']:
            aggregated_stats['byBrowserAndOsUniqueUsers'][browser] = {}
        
        for os, users in os_data.items():
            if os not in aggregated_stats['byBrowserAndOsUniqueUsers'][browser]:
                aggregated_stats['byBrowserAndOsUniqueUsers'][browser][os] = set()
            aggregated_stats['byBrowserAndOsUniqueUsers'][browser][os].update(users)
    
    # 聚合按IP前缀分组的唯一用户
    for ip, users in stats_data.get('byIPPrefixUniqueUsers', {}).items():
        if ip not in aggregated_stats['byIPPrefixUniqueUsers']:
            aggregated_stats['byIPPrefixUniqueUsers'][ip] = set()
        aggregated_stats['byIPPrefixUniqueUsers'][ip].update(users)


def _finalize_pageview_result(aggregated_stats, limit):
    """
    处理页面访问统计的最终结果
    """
    # 处理浏览器和操作系统唯一用户数据（将集合转换为列表）
    for browser in aggregated_stats['byBrowserAndOsUniqueUsers']:
        for os in aggregated_stats['byBrowserAndOsUniqueUsers'][browser]:
            aggregated_stats['byBrowserAndOsUniqueUsers'][browser][os] = list(aggregated_stats['byBrowserAndOsUniqueUsers'][browser][os])

    # 处理浏览器和操作系统组合的唯一用户数，应用limit限制
    raw_browser_os_unique_users = aggregated_stats.get('byBrowserAndOsUniqueUsers', {})
    # 先计算每个浏览器的总唯一用户数，用于排序
    browser_total_users = {}
    for browser, os_data in raw_browser_os_unique_users.items():
        browser_total_users[browser] = sum(len(users) for users in os_data.values())
    
    # 按总用户数排序浏览器，取前limit个
    sorted_browsers = sorted(browser_total_users.items(), key=lambda x: x[1], reverse=True)[:limit]
    
    # 构建应用了limit的browserAndOSUniqueUsers
    limited_browser_os_unique_users = {}
    for browser, _ in sorted_browsers:
        os_data = raw_browser_os_unique_users[browser]
        # 对每个浏览器下的操作系统也按用户数排序，取前limit个
        sorted_os = sorted(os_data.items(), key=lambda x: len(x[1]), reverse=True)[:limit]
        limited_browser_os_unique_users[browser] = {os: len(users) for os, users in sorted_os}

    # 处理IP前缀唯一用户数据（将集合转换为列表）
    for ip in aggregated_stats['byIPPrefixUniqueUsers']:
        aggregated_stats['byIPPrefixUniqueUsers'][ip] = list(aggregated_stats['byIPPrefixUniqueUsers'][ip])
    
    # 计算每个IP前缀的唯一用户数，应用limit限制
    ip_prefix_unique_users = {ip: len(users) for ip, users in aggregated_stats['byIPPrefixUniqueUsers'].items()}
    ip_prefix_unique_users = get_top_entries(ip_prefix_unique_users, limit)
    
    # 应用limit限制到所有嵌套字典
    for key in aggregated_stats:
        if key not in ['total', 'uniqueUsers', 'byBrowserAndOsUniqueUsers', 'byIPPrefixUniqueUsers', 'trendData'] and isinstance(aggregated_stats[key], dict):
            aggregated_stats[key] = get_top_entries(aggregated_stats[key], limit)
    
    # 返回处理后的结果
    return {
        "totalViews": aggregated_stats.get('total', 0),
        "browsers": aggregated_stats.get('byBrowser', {}),
        "os": aggregated_stats.get('byOS', {}),
        "devices": aggregated_stats.get('byDevice', {}),
        "urls": aggregated_stats.get('byUrl', {}),
        "urlAndBrowser": aggregated_stats.get('byUrlAndBrowser', {}),
        "urlAndDevice": aggregated_stats.get('byUrlAndDevice', {}),
        "browserAndOS": aggregated_stats.get('byBrowserAndOS', {}),
        "byIPPrefix": aggregated_stats.get('byIPPrefix', {}),
        "byUrlAndIPPrefix": aggregated_stats.get('byUrlAndIPPrefix', {}),
        "byUser": aggregated_stats.get('byUser', {}),
        "byUrlAndUser": aggregated_stats.get('byUrlAndUser', {}),
        "uniqueUsers": len(aggregated_stats.get('uniqueUsers', [])),
        "browserAndOSUniqueUsers": limited_browser_os_unique_users,
        "byIPPrefixUniqueUsers": ip_prefix_unique_users,
        "trendData": aggregated_stats.get('trendData', [])
    }


@api_router.get("/stats/pageview")
@require_login()
async def get_technology_stats(request: Request, system: str = "default",
                               start_date: Optional[str] = None, end_date: Optional[str] = None,
                               limit: int = 10):
    """
    获取页面访问统计
    """
    return await _stats_common(
        request, system, start_date, end_date, limit,
        "pageViews",
        _init_pageview_result,
        _handle_pageview_unique_users,
        _finalize_pageview_result
    )



def _init_downloads_result():
    """
    初始化下载统计结果
    """
    return {
        'total': 0,
        'byFile': {},
        'byUrl': {},
        'bySourcePage': {},
        'byFileAndSource': {},
        'byIPPrefix': {},
        'byFileAndIPPrefix': {},
        'byUser': {},
        'byFileAndUser': {},
        'uniqueUsers': set(),
        'byFileUniqueUsers': {},
        'byIPPrefixUniqueUsers': {}
    }


def _handle_downloads_unique_users(aggregated_stats, stats_data, stats_type):
    """
    处理下载统计的唯一用户数据
    """
    # 聚合按文件分组的唯一用户
    for file, users in stats_data.get('byFileUniqueUsers', {}).items():
        if file not in aggregated_stats['byFileUniqueUsers']:
            aggregated_stats['byFileUniqueUsers'][file] = set()
        aggregated_stats['byFileUniqueUsers'][file].update(users)

    # 聚合按IP前缀分组的唯一用户
    for ip, users in stats_data.get('byIPPrefixUniqueUsers', {}).items():
        if ip not in aggregated_stats['byIPPrefixUniqueUsers']:
            aggregated_stats['byIPPrefixUniqueUsers'][ip] = set()
        aggregated_stats['byIPPrefixUniqueUsers'][ip].update(users)


def _finalize_downloads_result(aggregated_stats, limit):
    """
    处理下载统计的最终结果
    """
    # 将集合转换为列表，方便客户端处理
    for file in aggregated_stats['byFileUniqueUsers']:
        aggregated_stats['byFileUniqueUsers'][file] = list(aggregated_stats['byFileUniqueUsers'][file])
    for ip in aggregated_stats['byIPPrefixUniqueUsers']:
        aggregated_stats['byIPPrefixUniqueUsers'][ip] = list(aggregated_stats['byIPPrefixUniqueUsers'][ip])

    # 为文件唯一用户和IP前缀唯一用户应用limit
    # 处理文件唯一用户
    file_unique_users = {file: len(users) for file, users in aggregated_stats['byFileUniqueUsers'].items()}
    file_unique_users = get_top_entries(file_unique_users, limit)

    # 处理IP前缀唯一用户
    ip_prefix_unique_users = {ip: len(users) for ip, users in aggregated_stats['byIPPrefixUniqueUsers'].items()}
    ip_prefix_unique_users = get_top_entries(ip_prefix_unique_users, limit)

    # 返回处理后的结果
    return {
        "totalDownloads": aggregated_stats.get('total', 0),
        "byFile": get_top_entries(aggregated_stats.get('byFile', {}), limit),
        "byUrl": get_top_entries(aggregated_stats.get('byUrl', {}), limit),
        "bySourcePage": get_top_entries(aggregated_stats.get('bySourcePage', {}), limit),
        "byFileAndSource": get_top_entries(aggregated_stats.get('byFileAndSource', {}), limit),
        "byIPPrefix": get_top_entries(aggregated_stats.get('byIPPrefix', {}), limit),
        "byFileAndIPPrefix": get_top_entries(aggregated_stats.get('byFileAndIPPrefix', {}), limit),
        "uniqueUsers": len(aggregated_stats.get('uniqueUsers', [])),
        "byFileUniqueUsers": file_unique_users,
        "byIPPrefixUniqueUsers": ip_prefix_unique_users,
        "byUser": get_top_entries(aggregated_stats.get('byUser', {}), limit),
        "trendData": aggregated_stats.get("trendData", [])
    }


@api_router.get("/stats/downloads")
@require_login()
async def get_download_stats(request: Request, system: str = "default",
                             start_date: Optional[str] = None, end_date: Optional[str] = None,
                             limit: int = 10):
    """
    获取下载统计
    """
    return await _stats_common(
        request, system, start_date, end_date, limit,
        "downloads",
        _init_downloads_result,
        _handle_downloads_unique_users,
        _finalize_downloads_result
    )


def _init_events_result():
    """
    初始化事件统计结果
    """
    return {
        'total': 0,
        'byType': {},
        'byCategory': {},
        'byAction': {},
        'byLabel': {},
        'bySelector': {},
        'byUrl': {},
        'byIPPrefix': {},
        'byCategoryAndIPPrefix': {},
        'byActionAndIPPrefix': {},
        'byUser': {},
        'byCategoryAndUser': {},
        'byCategoryAndActionAndUser': {},
        'byCategoryAndAction': {},
        'byCategoryAndLabel': {},
        'byUrlAndAction': {},
        'uniqueUsers': set(),
        'byCategoryUniqueUsers': {},
        'byActionUniqueUsers': {},
        'byIPPrefixUniqueUsers': {}
    }


def _handle_events_unique_users(aggregated_stats, stats_data, stats_type):
    """
    处理事件统计的唯一用户数据
    """
    # 聚合按类别分组的唯一用户
    for category, users in stats_data.get('byCategoryUniqueUsers', {}).items():
        if category not in aggregated_stats['byCategoryUniqueUsers']:
            aggregated_stats['byCategoryUniqueUsers'][category] = set()
        # 只处理集合或列表类型，避免类型错误
        if isinstance(users, (set, list)):
            aggregated_stats['byCategoryUniqueUsers'][category].update(users)

    # 聚合按操作分组的唯一用户
    for action, users in stats_data.get('byActionUniqueUsers', {}).items():
        if action not in aggregated_stats['byActionUniqueUsers']:
            aggregated_stats['byActionUniqueUsers'][action] = set()
        # 只处理集合或列表类型，避免类型错误
        if isinstance(users, (set, list)):
            aggregated_stats['byActionUniqueUsers'][action].update(users)

    # 聚合按IP前缀分组的唯一用户
    for ip, users in stats_data.get('byIPPrefixUniqueUsers', {}).items():
        if ip not in aggregated_stats['byIPPrefixUniqueUsers']:
            aggregated_stats['byIPPrefixUniqueUsers'][ip] = set()
        # 只处理集合或列表类型，避免类型错误
        if isinstance(users, (set, list)):
            aggregated_stats['byIPPrefixUniqueUsers'][ip].update(users)


def _finalize_events_result(aggregated_stats, limit):
    """
    处理事件统计的最终结果
    """
    # 将集合转换为列表，方便客户端处理
    for category in aggregated_stats['byCategoryUniqueUsers']:
        aggregated_stats['byCategoryUniqueUsers'][category] = list(aggregated_stats['byCategoryUniqueUsers'][category])
    for action in aggregated_stats['byActionUniqueUsers']:
        aggregated_stats['byActionUniqueUsers'][action] = list(aggregated_stats['byActionUniqueUsers'][action])
    for ip in aggregated_stats['byIPPrefixUniqueUsers']:
        aggregated_stats['byIPPrefixUniqueUsers'][ip] = list(aggregated_stats['byIPPrefixUniqueUsers'][ip])

    # 只返回客户端需要的前N条数据，减少数据传输量
    return {
        "totalEvents": aggregated_stats.get('total', 0),
        "byType": get_top_entries(aggregated_stats.get('byType', {}), limit),
        "byCategory": get_top_entries(aggregated_stats.get('byCategory', {}), limit),
        "byAction": get_top_entries(aggregated_stats.get('byAction', {}), limit),
        "byLabel": get_top_entries(aggregated_stats.get('byLabel', {}), limit),
        "bySelector": get_top_entries(aggregated_stats.get('bySelector', {}), limit),
        "byUrl": get_top_entries(aggregated_stats.get('byUrl', {}), limit),
        "byCategoryAndAction": get_top_entries(aggregated_stats.get('byCategoryAndAction', {}), limit),
        "byCategoryAndLabel": get_top_entries(aggregated_stats.get('byCategoryAndLabel', {}), limit),
        "byUrlAndAction": get_top_entries(aggregated_stats.get('byUrlAndAction', {}), limit),
        # IP相关统计
        "byIPPrefix": get_top_entries(aggregated_stats.get('byIPPrefix', {}), limit),
        "byCategoryAndIPPrefix": get_top_entries(aggregated_stats.get('byCategoryAndIPPrefix', {}), limit),
        "byActionAndIPPrefix": get_top_entries(aggregated_stats.get('byActionAndIPPrefix', {}), limit),
        "byCategoryUniqueUsers": get_top_entries({category: len(users) for category, users in
                                                aggregated_stats.get('byCategoryUniqueUsers', {}).items()},
                                                limit),
        "byActionUniqueUsers": get_top_entries({action: len(users) for action, users in
                                              aggregated_stats.get('byActionUniqueUsers', {}).items()},
                                              limit),
        "byIPPrefixUniqueUsers": get_top_entries({ip: len(users) for ip, users in
                                                aggregated_stats.get('byIPPrefixUniqueUsers', {}).items()},
                                                limit),
         "byCategoryAndActionAndUser": get_top_entries(aggregated_stats.get('byCategoryAndActionAndUser', {}), limit),
        "byUser": get_top_entries(aggregated_stats.get('byUser', {}), limit),
        "trendData": aggregated_stats.get("trendData", [])
    }


@api_router.get("/stats/events")
@require_login()
async def get_event_stats(request: Request, system: str = "default",
                          start_date: Optional[str] = None, end_date: Optional[str] = None,
                          limit: int = 10):
    """
    获取事件统计
    """
    return await _stats_common(
        request, system, start_date, end_date, limit,
        "events",
        _init_events_result,
        _handle_events_unique_users,
        _finalize_events_result
    )


def _init_duration_result():
    """
    初始化停留时长统计结果
    """
    return {
        'total': 0,
        'count': 0,
        'byUrl': {},
        'byBrowser': {},
        'byOS': {},
        'byDevice': {},
        'byIPPrefix': {},
        'byUrlAndIPPrefix': {},
        'byUser': {},
        'byUrlAndUser': {},
        'byUrlAndBrowser': {},
        'byUrlAndDevice': {},
        'byBrowserAndOS': {},
        'uniqueUsers': set()
    }


def _handle_duration_unique_users(aggregated_stats, stats_data, stats_type):
    """
    处理停留时长统计的唯一用户数据
    """
    # 停留时长统计没有特殊的唯一用户处理逻辑，只需要基础的集合合并
    pass


def _finalize_duration_result(aggregated_stats, limit):
    """
    处理停留时长统计的最终结果
    """
    # 只返回客户端需要的前N条数据，减少数据传输量
    return {
        "totalDuration": aggregated_stats.get('total', 0),
        "totalSessions": aggregated_stats.get('count', 0),
        "byUrl": get_top_entries(aggregated_stats.get('byUrl', {}), limit),
        "byBrowser": get_top_entries(aggregated_stats.get('byBrowser', {}), limit),
        "byOS": get_top_entries(aggregated_stats.get('byOS', {}), limit),
        "byDevice": get_top_entries(aggregated_stats.get('byDevice', {}), limit),
        "byIPPrefix": get_top_entries(aggregated_stats.get('byIPPrefix', {}), limit),
        "byIPPrefix.count": get_top_entries(aggregated_stats.get('byIPPrefix.count', {}), limit),
        "byUrlAndIPPrefix": get_top_entries(aggregated_stats.get('byUrlAndIPPrefix', {}), limit),
        "byUrlAndIPPrefix.count": get_top_entries(aggregated_stats.get('byUrlAndIPPrefix.count', {}), limit),
        "byUser": get_top_entries(aggregated_stats.get('byUser', {}), limit),
        "byUrlAndUser": get_top_entries(aggregated_stats.get('byUrlAndUser', {}), limit),
        "byUrlAndBrowser": get_top_entries(aggregated_stats.get('byUrlAndBrowser', {}), limit),
        "byUrlAndDevice": get_top_entries(aggregated_stats.get('byUrlAndDevice', {}), limit),
        "byBrowserAndOS": get_top_entries(aggregated_stats.get('byBrowserAndOS', {}), limit),
        "uniqueUsers": len(aggregated_stats.get('uniqueUsers', [])),
        "trendData": aggregated_stats.get('trendData', [])
    }


@api_router.get("/stats/duration")
@require_login()
async def get_duration_stats(request: Request, system: str = "default",
                             start_date: Optional[str] = None, end_date: Optional[str] = None,
                             limit: int = 10):
    """
    获取停留时长统计
    """
    return await _stats_common(
        request, system, start_date, end_date, limit,
        "duration",
        _init_duration_result,
        _handle_duration_unique_users,
        _finalize_duration_result
    )


@app.post("/login")
async def login_for_access_token(response: Response, form_data: OAuth2PasswordRequestForm = Depends()):
    access_token = await login_user(form_data.username, form_data.password)
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,     # 防止XSS攻击
        # secure=True,       # 仅在HTTPS下传输
        samesite="lax",    # 防止CSRF攻击
        max_age=3600,      # 过期时间（秒）
        path="/"           # Cookie路径
    )
    return {"message": "Login successful"}

@app.post("/logout")
@require_login()
async def logout(request: Request, response: Response):
    try:
        current_user = await get_current_user(request)
        await logout_user(current_user.username)
    except Exception as e:
        pass
    response.delete_cookie(
        key="access_token",
        path="/",  # 与设置时保持一致
        # domain="example.com"  # 如果设置了domain也需要指定
    )
    return {"message": "Logout successful"}




class ProtectedStaticFiles(StaticFiles):
    async def __call__(self, scope, receive, send) -> None:
        request = Request(scope, receive)

        # 检查请求的文件是否为HTML文件
        path = scope.get("path", "")
        is_html_file = path == "/" or path.endswith('.html') and not path.endswith('/login.html') if path else False

        if is_html_file:
            redirect_url = f"/login.html?url={quote(str(request.url))}"
            try:
                current_user = await get_current_user(request)
                if not current_user:
                    response = RedirectResponse(url=redirect_url)
                    await response(scope, receive, send)
                    return
            except:
                response = RedirectResponse(url=redirect_url)
                await response(scope, receive, send)
                return
        await super().__call__(scope, receive, send)


# 注册API路由
app.include_router(api_router)

# 配置静态文件服务（放在API路由定义之后）
app.mount("/public", StaticFiles(directory="public"), name="public")
app.mount("/webfonts", StaticFiles(directory="public/monitor/webfonts"), name="webfonts")
app.mount("/", ProtectedStaticFiles(directory="public/monitor", html=True), name="root")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
