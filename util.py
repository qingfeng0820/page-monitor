import inspect
import time
from functools import wraps
from typing import Callable, Dict, Tuple, Any
from fastapi import Request


# 带过期时间的LRU缓存装饰器（支持异步函数）
def lru_cache_with_ttl(maxsize: int = 128, ttl: int = 3600):
    """
    带过期时间的LRU缓存装饰器，同时支持同步和异步函数
    :param maxsize: 缓存最大数量
    :param ttl: 缓存过期时间（秒）
    """
    # 只使用一个缓存字典，存储(key: (timestamp, result))
    cache: Dict[Tuple[Any, ...], Tuple[float, Any]] = {}
    # 使用有序列表来维护访问顺序，用于LRU淘汰
    access_order = []

    def decorator(func: Callable) -> Callable:
        # 检查函数是否为异步函数
        is_async = inspect.iscoroutinefunction(func)

        if is_async:
            @wraps(func)
            async def cached_func(*args, **kwargs):
                # 构建缓存键，过滤掉不可哈希的参数（如Request对象）
                hashable_args = []
                for arg in args:
                    if isinstance(arg, Request):
                        # 跳过Request对象，不将其作为缓存键的一部分
                        continue
                    hashable_args.append(arg)

                hashable_kwargs = {}
                for k, v in kwargs.items():
                    if isinstance(v, Request):
                        # 跳过Request对象
                        continue
                    hashable_kwargs[k] = v

                key = tuple(hashable_args) + tuple(sorted(hashable_kwargs.items()))

                # 检查缓存是否存在且未过期
                if key in cache:
                    timestamp, result = cache[key]
                    if time.time() - timestamp < ttl:
                        # 更新访问顺序（移到最后，表示最近使用）
                        if key in access_order:
                            access_order.remove(key)
                        access_order.append(key)
                        return result
                    else:
                        # 缓存已过期，移除
                        del cache[key]
                        if key in access_order:
                            access_order.remove(key)

                # 执行异步函数
                result = await func(*args, **kwargs)

                # 检查缓存大小，超过限制则移除最久未使用的项
                if len(cache) >= maxsize:
                    # 移除第一个元素（最久未使用）
                    oldest_key = access_order.pop(0)
                    del cache[oldest_key]

                # 存储结果和时间戳
                cache[key] = (time.time(), result)
                access_order.append(key)

                return result
        else:
            @wraps(func)
            def cached_func(*args, **kwargs):
                # 构建缓存键，过滤掉不可哈希的参数
                hashable_args = []
                for arg in args:
                    if isinstance(arg, Request):
                        # 跳过Request对象
                        continue
                    hashable_args.append(arg)

                hashable_kwargs = {}
                for k, v in kwargs.items():
                    if isinstance(v, Request):
                        # 跳过Request对象
                        continue
                    hashable_kwargs[k] = v

                key = tuple(hashable_args) + tuple(sorted(hashable_kwargs.items()))

                # 检查缓存是否存在且未过期
                if key in cache:
                    timestamp, result = cache[key]
                    if time.time() - timestamp < ttl:
                        # 更新访问顺序
                        if key in access_order:
                            access_order.remove(key)
                        access_order.append(key)
                        return result
                    else:
                        # 缓存已过期
                        del cache[key]
                        if key in access_order:
                            access_order.remove(key)

                # 执行同步函数
                result = func(*args, **kwargs)

                # LRU淘汰
                if len(cache) >= maxsize:
                    oldest_key = access_order.pop(0)
                    del cache[oldest_key]

                # 存储结果
                cache[key] = (time.time(), result)
                access_order.append(key)

                return result

        return cached_func

    return decorator
