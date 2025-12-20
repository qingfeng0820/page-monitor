from fastapi import HTTPException, Request, APIRouter

from datetime import datetime
from typing import Optional, Dict, Any
import hashlib
import logging

from mongodb import stats_collection, sites_collection
from util import lru_cache_with_ttl, access_system

logger = logging.getLogger(__name__)

# 创建API路由
api_router = APIRouter(prefix="/api")


def sanitize_key(key: str) -> str:
    """清理key中的特殊字符 - 存储时使用"""
    if not key:
        return "unknown"
    
    # 替换MongoDB保留字符和可能引起问题的字符
    safe = str(key)
    
    # 替换点号（URL和IP中的点）
    safe = safe.replace('.', '_dot_')
    
    # 替换美元符号（MongoDB保留字符）
    safe = safe.replace('$', '_dollar_')
    
    # 替换其他可能的问题字符
    safe = safe.replace('\x00', '_null_')  # null字符
    
    return safe


def restore_all_keys_recursive(data):
    """
    递归遍历并还原数据结构中的所有键
    支持字典、列表、元组和基本类型
    """
    if isinstance(data, dict):
        # 处理字典：还原每个键，并递归处理值
        restored_dict = {}
        for key, value in data.items():
            # 还原键名
            restored_key = restore_key(key)
            # 递归处理值
            restored_dict[restored_key] = restore_all_keys_recursive(value)
        return restored_dict

    elif isinstance(data, list):
        # 处理列表：递归处理每个元素
        return [restore_all_keys_recursive(item) for item in data]

    elif isinstance(data, tuple):
        # 处理元组：递归处理每个元素，返回元组
        return tuple(restore_all_keys_recursive(item) for item in data)

    elif isinstance(data, set):
        # 处理集合：递归处理每个元素，返回列表（因为集合可能包含不可哈希的字典）
        return [restore_all_keys_recursive(item) for item in data]

    else:
        # 基本类型：直接返回
        return data


def restore_key(safe_key: str) -> str:
    """还原key中的特殊字符 - 展示时使用（性能优化版）"""
    if not safe_key or not isinstance(safe_key, str):
        return safe_key if safe_key is not None else "unknown"

    # 使用链式替换，性能更好
    return safe_key.replace('_dot_', '.').replace('_dollar_', '$').replace('_null_', '')


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


async def check_site_api_key(request: Request, data: dict):
    url = data.get('url', 'unknown')
    system = sanitize_key(data.get('system', 'default'))
    api_key = request.headers.get("X-API-Key") or data.get('apiKey')
    
    # 如果没有提供system或apikey，抛出403错误
    if not system:
        raise HTTPException(status_code=403, detail="System parameter is required")
    
    if not api_key:
        raise HTTPException(status_code=403, detail="API key is required in X-API-Key header")
    
    # 查询sites_collection，检查system是否注册且apikey匹配
    site = await sites_collection.find_one({
        "site_name": system,
        "api_key": api_key
    })
    
    # 如果找不到匹配的记录，抛出404错误
    if not site:
        raise HTTPException(status_code=404, detail="System not registered or invalid API key")
    
    # 检查url是否与注册的site_url匹配
    # 1. 从request中获取origin
    # 2. 检查URL是否以origin为前缀
    # 3. 比对origin与注册URL是否匹配
    registered_url = site.get("site_url")
    
    # 如果registered_url为空，返回500错误
    if not registered_url:
        raise HTTPException(status_code=500, detail="找不到registered_url")

    if registered_url.endswith('/'):
        registered_url = registered_url[:-1]
    
    # 只从Origin头获取请求的origin
    request_origin = request.headers.get("Origin")
    
    if request_origin:
        # 检查当前URL是否以请求origin为前缀
        if not url.startswith(request_origin):
            raise HTTPException(status_code=403, detail="URL不对")
        
        # 解析注册的URL的origin
        try:
            # registered_parsed = urlparse(registered_url)
            # registered_origin = f"{registered_parsed.scheme}://{registered_parsed.netloc}"
            #
            # # 比对请求origin与注册URL的origin是否匹配
            # if request_origin == registered_origin:
            #     return True
            if url.startswith(registered_url):
                return True
            raise HTTPException(status_code=403, detail="URL does not match registered site URL")
        except:
            # 如果URL解析失败，继续检查完全匹配
            pass
    
    # 如果以上验证都失败，尝试完全匹配
    if url != registered_url:
        raise HTTPException(status_code=403, detail="URL does not match registered site URL")

    return True


async def _track_common(request: Request, data: dict, track_type: str, detail_handler):
    """
    通用跟踪处理函数，处理重复的初始化和数据库更新逻辑
    :param request: 请求对象
    :param data: 请求数据
    :param track_type: 跟踪类型（pageview, download, event, duration）
    :param detail_handler: 具体跟踪类型的处理函数，返回update_fields
    :return: 跟踪结果
    """
    await check_site_api_key(request, data)
    try:
        # 从request data中获取system参数
        system = sanitize_key(data.get('system', 'default'))
        # 获取并处理用户指纹
        user_fingerprint = sanitize_fingerprint(data.get('userFingerprint', ''))
        # 获取客户端IP并用于统计分析
        client_ip = get_client_ip(request)
        # 获取IP前两段用于地域统计（保护隐私）
        ip_prefix = sanitize_key('.'.join(client_ip.split('.')[:2])) if '.' in client_ip else 'unknown'
        # 获取当前日期（用于按天分片）
        current_date = datetime.utcnow().strftime('%Y-%m-%d')
        
        # 调用具体处理函数获取update_fields
        update_fields = detail_handler(data, track_type, system, user_fingerprint, client_ip, ip_prefix, current_date)
        
        # 按系统、日期和统计类型三级分片存储数据
        # 使用更高效的更新操作，减少数据库负载和并发竞争
        result = await stats_collection.update_one(
            {'system': system, 'date': current_date, 'type': track_type},
            update_fields,
            upsert=True
        )

        return {"success": True, "matched_count": result.matched_count, "modified_count": result.modified_count}

    except Exception as e:
        logger.error(f"跟踪{track_type}失败: {str(e)}", exc_info=True)
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
        referrer = sanitize_key(data.get('referrer', ''))
        
        return {
            '$inc': {
                'data.total': 1,
                f'data.byUrl.{url}': 1,
                f'data.byBrowser.{browser}': 1,
                f'data.byOS.{os_name}': 1,
                f'data.byDevice.{device}': 1,
                # IP相关统计（使用IP前缀保护隐私）
                f'data.byIPPrefix.{ip_prefix}': 1,
                f'data.byUrlAndIPPrefix.{url}.{ip_prefix}': 1,
                # 用户指纹统计
                f'data.byUser.{user_fingerprint}': 1,
                f'data.byUrlAndUser.{url}.{user_fingerprint}': 1,
                # 组合维度统计
                f'data.byUrlAndBrowser.{url}.{browser}': 1,
                f'data.byUrlAndDevice.{url}.{device}': 1,
                f'data.byBrowserAndOS.{browser}.{os_name}': 1,
                # 来源页面统计
                f'data.byReferrer.{referrer}': 1,
                f'data.byUrlAndReferrer.{url}.{referrer}': 1
            },
            '$set': {
                'system': system,
                'date': current_date,
                'type': track_type,
                'lastUpdated': datetime.utcnow()
            },
            # 记录唯一用户数（使用$addToSet确保每个用户只计数一次）
            '$addToSet': {
                'data.uniqueUsers': user_fingerprint,
                f'data.byUrlUniqueUsers.{url}': user_fingerprint,
                f'data.byIPPrefixUniqueUsers.{ip_prefix}': user_fingerprint,
                f'data.byBrowserAndOsUniqueUsers.{browser}.{os_name}': user_fingerprint
            }
        }
    
    return await _track_common(request, data, "pageViews", pageview_handler)


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
                'data.total': 1,
                f'data.byFile.{file_name}': 1,
                f'data.byUrl.{download_url}': 1,
                f'data.bySourcePage.{source_page}': 1,
                # IP相关统计（使用IP前缀保护隐私）
                f'data.byIPPrefix.{ip_prefix}': 1,
                f'data.byFileAndIPPrefix.{file_name}.{ip_prefix}': 1,
                # 用户指纹统计
                f'data.byUser.{user_fingerprint}': 1,
                f'data.byFileAndUser.{file_name}.{user_fingerprint}': 1,
                # 组合维度统计
                f'data.byFileAndSource.{file_name}.{source_page}': 1
            },
            '$set': {
                'system': system,
                'date': current_date,
                'type': track_type,
                'lastUpdated': datetime.utcnow()
            },
            # 记录唯一用户数
            '$addToSet': {
                'data.uniqueUsers': user_fingerprint,
                f'data.byFileUniqueUsers.{file_name}': user_fingerprint,
                f'data.byIPPrefixUniqueUsers.{ip_prefix}': user_fingerprint
            }
        }
    
    return await _track_common(request, data, "downloads", download_handler)


@api_router.post("/track/event")
async def track_event(request: Request, data: dict):
    """
    跟踪自定义事件
    """
    def event_handler(data, track_type, system, user_fingerprint, client_ip, ip_prefix, current_date):
        # 标准化事件字段，确保数据一致性
        event_type = sanitize_key(data.get('eventType', 'click'))
        event_category = sanitize_key(data.get('eventCategory', 'engagement'))
        event_action = sanitize_key(data.get('eventAction', 'click'))
        event_label = sanitize_key(data.get('eventLabel', 'unknown'))
        selector = sanitize_key(data.get('selector', 'unknown'))
        url = sanitize_key(data.get('url', 'unknown'))
        
        # 构建更新操作，减少重复代码
        update_fields = {
            '$inc': {
                'data.total': 1,
                f'data.byType.{event_type}': 1,
                f'data.byCategory.{event_category}': 1,
                f'data.byAction.{event_action}': 1,
                f'data.byLabel.{event_label}': 1,
                f'data.bySelector.{selector}': 1,
                f'data.byUrl.{url}': 1,
                # IP相关统计（使用IP前缀保护隐私）
                f'data.byIPPrefix.{ip_prefix}': 1,
                f'data.byCategoryAndIPPrefix.{event_category}.{ip_prefix}': 1,
                f'data.byActionAndIPPrefix.{event_action}.{ip_prefix}': 1,
                # 用户指纹统计
                f'data.byUser.{user_fingerprint}': 1,
                f'data.byCategoryAndUser.{event_category}.{user_fingerprint}': 1,
                f'data.byCategoryAndActionAndUser.{event_category}.{event_action}.{user_fingerprint}': 1,
                # 组合维度统计
                f'data.byCategoryAndAction.{event_category}.{event_action}': 1,
                f'data.byCategoryAndLabel.{event_category}.{event_label}': 1,
                f'data.byUrlAndAction.{url}.{event_action}': 1
            },
            '$set': {
                'system': system,
                'date': current_date,
                'type': track_type, 
                'lastUpdated': datetime.utcnow()
            },
            # 记录唯一用户数（使用$addToSet确保每个用户只计数一次）
            '$addToSet': {
                'data.uniqueUsers': user_fingerprint,
                f'data.byCategoryUniqueUsers.{event_category}': user_fingerprint,
                f'data.byActionUniqueUsers.{event_action}': user_fingerprint,
                f'data.byIPPrefixUniqueUsers.{ip_prefix}': user_fingerprint
            }
        }
        
        return update_fields
    
    return await _track_common(request, data, "events", event_handler)


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
                'data.total': duration,
                'data.count': 1,
                f'data.byUrl.{url}': duration,
                f'data.byUrl.count.{url}': 1,
                f'data.byBrowser.{browser}': duration,
                f'data.byBrowser.count.{browser}': 1,
                f'data.byOS.{os_name}': duration,
                f'data.byOS.count.{os_name}': 1,
                f'data.byDevice.{device}': duration,
                f'data.byDevice.count.{device}': 1,
                # IP相关统计（使用IP前缀保护隐私）
                f'data.byIPPrefix.{ip_prefix}': duration,
                f'data.byIPPrefix.count.{ip_prefix}': 1,
                f'data.byUrlAndIPPrefix.{url}.{ip_prefix}': duration,
                f'data.byUrlAndIPPrefix.count.{url}.{ip_prefix}': 1,
                # 用户指纹统计
                f'data.byUser.{user_fingerprint}': duration,
                f'data.byUser.count.{user_fingerprint}': 1,
                f'data.byUrlAndUser.{url}.{user_fingerprint}': duration,
                f'data.byUrlAndUser.count.{url}.{user_fingerprint}': 1,
                # 组合维度统计
                f'data.byUrlAndBrowser.{url}.{browser}': duration,
                f'data.byUrlAndBrowser.count.{url}.{browser}': 1,
                f'data.byUrlAndDevice.{url}.{device}': duration,
                f'data.byUrlAndDevice.count.{url}.{device}': 1,
                f'data.byBrowserAndOS.{browser}.{os_name}': duration,
                f'data.byBrowserAndOS.count.{browser}.{os_name}': 1
            },
            '$set': {
                'system': system,
                'date': current_date,
                'type': track_type,
                'lastUpdated': datetime.utcnow()
            },
            # 记录唯一用户数（使用$addToSet确保每个用户只计数一次）
            '$addToSet': {
                'data.uniqueUsers': user_fingerprint,
                f'data.byUrlUniqueUsers.{url}': user_fingerprint,
                f'data.byIPPrefixUniqueUsers.{ip_prefix}': user_fingerprint
            }
        }
    
    return await _track_common(request, data, "duration", duration_handler)


def merge_nested_dicts(dict1, dict2):
    """
    合并两个嵌套字典，将相同路径的值相加
    :param dict1: 第一个字典
    :param dict2: 第二个字典
    :return: 合并后的字典
    """
    # 使用更高效的方式合并，避免不必要的复制
    result = {}
    
    # 先复制dict1的内容
    for key, value in dict1.items():
        result[key] = value

    # 合并dict2的内容
    for key, value in dict2.items():
        if key in result:
            if isinstance(result[key], dict) and isinstance(value, dict):
                # 递归合并嵌套字典
                result[key] = merge_nested_dicts(result[key], value)
            elif isinstance(result[key], int) and isinstance(value, int):
                # 相加数值
                result[key] = result[key] + value
            else:
                # 其他情况，直接使用新值
                result[key] = value
        else:
            # 键不存在，直接添加
            result[key] = value

    return result


def get_top_entries(dictionary, limit=10, except_keys=None):
    """
    获取字典中值最大的前N个条目
    :param dictionary: 输入字典
    :param limit: 返回的条目数
    :param except_keys: 需要排除的键列表
    :return: 包含前N个条目的字典
    """
    if not dictionary:
        return {}

    if except_keys is None:
        except_keys = []

    # 过滤掉需要排除的键
    filtered_dict = {k: v for k, v in dictionary.items() if k not in except_keys}

    if not filtered_dict:
        return {}

    # 计算嵌套字典总值的函数（非递归方式，避免栈溢出）
    def get_value_score(value):
        """获取值的分数（嵌套字典计算总和，其他返回原值）"""
        if isinstance(value, dict):
            total = 0
            stack = list(value.values())
            while stack:
                item = stack.pop()
                if isinstance(item, dict):
                    stack.extend(item.values())
                elif isinstance(item, int):
                    total += item
            return total
        elif isinstance(value, int):
            return value
        else:
            return 0

    # 预先计算所有值的分数，避免重复计算
    items_with_scores = [(k, v, get_value_score(v)) for k, v in filtered_dict.items()]
    # 按分数降序排序
    items_with_scores.sort(key=lambda x: x[2], reverse=True)
    # 取前limit个条目
    result = {item[0]: item[1] for item in items_with_scores[:limit]}
    
    # 添加排除的键
    for key in except_keys:
        if key in dictionary:
            result[key] = dictionary[key]
    
    return result


@lru_cache_with_ttl(maxsize=50, ttl=5)  # 缓存50个结果，过期时间5秒
@access_system("${system}")
async def _stats_common(request: Request, system: str, start_date: Optional[str], end_date: Optional[str], limit: int,
                        stats_type: str, result_initializer, unique_users_handler, final_result_handler):
    """
    通用统计处理函数，处理重复的查询和聚合逻辑
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
        query = {'system': system}

        # 如果提供了日期范围，添加日期过滤条件
        if start_date and end_date:
            query['date'] = {'$gte': start_date, '$lte': end_date}
        elif start_date:
            query['date'] = {'$gte': start_date}
        elif end_date:
            query['date'] = {'$lte': end_date}

        # 查询多个日期分片的数据，并按日期排序
        # 更新查询条件，添加type字段
        query['type'] = stats_type
        
        # 只投影需要的字段，减少数据传输
        stats_cursor = stats_collection.find(
            query,
            {'_id': 0, 'date': 1, 'data': 1}
        ).sort('date', 1)

        # 初始化聚合结果
        aggregated_stats = result_initializer()
        
        # 初始化趋势数据列表
        trend_data = []
        
        # 预计算需要聚合的字段列表，避免重复判断
        merge_fields = [
            key for key in aggregated_stats 
            if key not in ('total', 'count', 'uniqueUsers') 
            and not key.endswith('UniqueUsers')
        ]

        # 聚合所有日期分片的数据，并收集趋势数据
        async for stats in stats_cursor:
            if 'data' not in stats:
                continue
                
            stats_data = stats['data']
            date = stats['date']
            
            # 收集当天的趋势数据（只创建必要的字段）
            day_data = {'date': date}
            if stats_type == 'duration':
                # 停留时长统计的趋势数据包含总时长和会话数
                day_data['total'] = stats_data.get('total', 0)
                day_data['count'] = stats_data.get('count', 0)
            else:
                # 其他统计类型的趋势数据包含总数和独立用户数
                day_data['total'] = stats_data.get('total', 0)
                day_data['uniqueUsers'] = len(stats_data.get('uniqueUsers', []))
            
            # 添加按子类别收集的趋势数据
            if stats_type == 'pageViews' and 'byUrl' in stats_data:
                # 页面访问按URL收集趋势数据，包含访问次数和用户数
                url_trend_data = {}
                top_urls = get_top_entries(stats_data['byUrl'], limit)
                for url, count in top_urls.items():
                    # 获取该URL的用户数信息
                    unique_users = len(stats_data.get('byUrlUniqueUsers', {}).get(url, []))
                    url_trend_data[url] = {
                        'count': count,
                        'uniqueUsers': unique_users
                    }
                day_data['byUrl'] = url_trend_data
            elif stats_type == 'duration' and 'byUrl' in stats_data:
                # 停留时长按URL收集趋势数据，包含总时长和会话数
                url_trend_data = {}
                top_urls = get_top_entries(stats_data['byUrl'], limit, except_keys=['count'])
                for url, count in top_urls.items():
                    if url == 'count':
                        continue
                    sessions = 1
                    if 'count' in stats_data['byUrl'] and url in stats_data['byUrl']['count']:
                        sessions = stats_data['byUrl']['count'][url]
                    url_trend_data[url] = {
                        'total': count,
                        'count': sessions
                    }
                day_data['byUrl'] = url_trend_data
            elif stats_type == 'downloads' and 'byFile' in stats_data:
                # 下载按文件收集趋势数据，包含下载次数和用户数
                file_data = {}
                # 收集每个文件的下载次数
                for file, count in stats_data['byFile'].items():
                    file_data[file] = {
                        'count': count,
                        'uniqueUsers': len(stats_data.get('byFileUniqueUsers', {}).get(file, []))
                    }
                # 按下载次数排序，取前limit个
                sorted_files = sorted(file_data.items(), key=lambda x: x[1]['count'], reverse=True)[:limit]
                day_data['byFile'] = {file: data for file, data in sorted_files}
            elif stats_type == 'events' and 'byCategoryAndAction' in stats_data:
                # 事件按类别+动作收集趋势数据，包含事件次数和用户数
                event_data = {}
                # 获取事件类别和动作数据
                for category, actions in stats_data['byCategoryAndAction'].items():
                    for action, count in actions.items():
                        event_key = f"{category}.{action}"
                        # 计算该事件的唯一用户数
                        unique_users = 0
                        if stats_data.get('byCategoryAndActionAndUser', {}).get(category, {}).get(action):
                            unique_users = len(stats_data['byCategoryAndActionAndUser'][category][action])
                        event_data[event_key] = {
                            'count': count,
                            'uniqueUsers': unique_users
                        }
                # 按事件次数排序，取前limit个
                sorted_events = sorted(event_data.items(), key=lambda x: x[1]['count'], reverse=True)[:limit]
                day_data['byCategoryAndAction'] = {event: data for event, data in sorted_events}
            
            trend_data.append(day_data)

            # 聚合基本统计（避免重复查找）
            total = stats_data.get('total', 0)
            aggregated_stats['total'] += total
            
            # 处理duration统计方法中的count字段
            if 'count' in stats_data and 'count' in aggregated_stats:
                aggregated_stats['count'] += stats_data.get('count', 0)

            # 聚合嵌套字典数据（使用预计算的字段列表）
            for key in merge_fields:
                if key in stats_data:
                    if not aggregated_stats[key]:
                        # 如果聚合结果为空，直接使用当前数据
                        aggregated_stats[key] = stats_data[key]
                    else:
                        # 合并嵌套字典
                        aggregated_stats[key] = merge_nested_dicts(aggregated_stats[key], stats_data[key])
                    
            # 合并唯一用户集合（只在存在时处理）
            stats_unique_users = stats_data.get('uniqueUsers')
            if stats_unique_users:
                aggregated_stats['uniqueUsers'].update(stats_unique_users)

            # 处理特定的唯一用户数据
            unique_users_handler(aggregated_stats, stats_data, stats_type)

        # 将集合转换为列表，方便客户端处理
        aggregated_stats['uniqueUsers'] = list(aggregated_stats['uniqueUsers'])
        
        # 将趋势数据添加到聚合结果中
        aggregated_stats['trendData'] = trend_data

        # ========== 统一还原所有键 ==========
        aggregated_stats = restore_all_keys_recursive(aggregated_stats)

        # 返回处理后的结果
        return final_result_handler(aggregated_stats, limit)

    except Exception as e:
        logger.error(f"获取{stats_type}统计失败: {str(e)}", exc_info=True)
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
        'byReferrer': {},
        'byUrlAndReferrer': {},
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
        "referrers": aggregated_stats.get('byReferrer', {}),
        "urlAndBrowser": aggregated_stats.get('byUrlAndBrowser', {}),
        "urlAndDevice": aggregated_stats.get('byUrlAndDevice', {}),
        "urlAndReferrer": aggregated_stats.get('byUrlAndReferrer', {}),
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
async def get_technology_stats(request: Request, system: str = "default",
                               start_date: Optional[str] = None, end_date: Optional[str] = None,
                               limit: int = 10):
    """
    获取页面访问统计
    """
    return await _stats_common(
        request,
        system, start_date, end_date, limit,
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
async def get_download_stats(request: Request, system: str = "default",
                             start_date: Optional[str] = None, end_date: Optional[str] = None,
                             limit: int = 10):
    """
    获取下载统计
    """
    return await _stats_common(
        request,
        system, start_date, end_date, limit,
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
async def get_event_stats(request: Request, system: str = "default",
                          start_date: Optional[str] = None, end_date: Optional[str] = None,
                          limit: int = 10):
    """
    获取事件统计
    """
    return await _stats_common(
        request,
        system, start_date, end_date, limit,
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
        "byUrl": get_top_entries(aggregated_stats.get('byUrl', {}), limit, except_keys=['count']),
        "byBrowser": get_top_entries(aggregated_stats.get('byBrowser', {}), limit, except_keys=['count']),
        "byOS": get_top_entries(aggregated_stats.get('byOS', {}), limit, except_keys=['count']),
        "byDevice": get_top_entries(aggregated_stats.get('byDevice', {}), limit, except_keys=['count']),
        "byIPPrefix": get_top_entries(aggregated_stats.get('byIPPrefix', {}), limit, except_keys=['count']),
        "byUrlAndIPPrefix": get_top_entries(aggregated_stats.get('byUrlAndIPPrefix', {}), limit, except_keys=['count']),
        "byUser": get_top_entries(aggregated_stats.get('byUser', {}), limit, except_keys=['count']),
        "byUrlAndUser": get_top_entries(aggregated_stats.get('byUrlAndUser', {}), limit, except_keys=['count']),
        "byUrlAndBrowser": get_top_entries(aggregated_stats.get('byUrlAndBrowser', {}), limit, except_keys=['count']),
        "byUrlAndDevice": get_top_entries(aggregated_stats.get('byUrlAndDevice', {}), limit, except_keys=['count']),
        "byBrowserAndOS": get_top_entries(aggregated_stats.get('byBrowserAndOS', {}), limit, except_keys=['count']),
        "uniqueUsers": len(aggregated_stats.get('uniqueUsers', [])),
        "trendData": aggregated_stats.get('trendData', [])
    }


@api_router.get("/stats/duration")
async def get_duration_stats(request: Request, system: str = "default",
                             start_date: Optional[str] = None, end_date: Optional[str] = None,
                             limit: int = 10):
    """
    获取停留时长统计
    """
    return await _stats_common(
        request,
        system, start_date, end_date, limit,
        "duration",
        _init_duration_result,
        _handle_duration_unique_users,
        _finalize_duration_result
    )


async def _delete_system_stats(system: str) -> Dict[str, Any]:
    """
    删除指定system的所有统计数据（普通方法，不带有路由装饰器）
    
    Args:
        system: 要删除统计数据的系统名称
    
    Returns:
        包含删除结果的字典
    """
    try:
        # 清理system名称中的特殊字符
        sanitized_system = sanitize_key(system)
        
        # 删除该系统的所有统计数据
        result = await stats_collection.delete_many({'system': sanitized_system})
        
        return {
            "success": True,
            "message": f"成功删除系统 '{sanitized_system}' 的统计数据",
            "deleted_count": result.deleted_count
        }
    except Exception as e:
        logger.error(f"删除系统统计数据失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"删除系统统计数据失败: {str(e)}")


@api_router.delete("/stats/{system}")
@access_system("${system}")
async def delete_system_stats(request: Request, system: str):
    """
    删除指定system的所有统计数据
    
    Args:
        request: 请求对象，用于获取当前用户信息
        system: 要删除统计数据的系统名称
    """
    try:
        # 权限检查由access_system装饰器处理
        return await _delete_system_stats(system)
    except Exception as e:
        logger.error(f"API删除统计数据失败: {str(e)}", exc_info=True)
        raise
