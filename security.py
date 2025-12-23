import os
import time
import threading
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from functools import wraps
from typing import Optional, Dict, List, Callable, Tuple
from fastapi import HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from functools import lru_cache
from passlib.context import CryptContext

from starlette.responses import RedirectResponse

from models import User

# 密码加密上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_password_hash(password: str) -> str:
    """生成密码的哈希值"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码是否匹配哈希值"""
    return pwd_context.verify(plain_password, hashed_password)


# JWT配置
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your-secret-key")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_PERIOD = int(os.environ.get("JWT_EXPIRE_PERIOD", 1800))
JWT_DECODE_PAYLOAD_CACHE_TTL = int(os.environ.get("JWT_DECODE_PAYLOAD_CACHE_TTL", 300))
JWT_AUTO_REFRESH_TOKEN = os.environ.get("JWT_AUTO_REFRESH_TOKEN", "True").lower() == "true"
SESSION_TIMEOUT = int(os.environ.get("SESSION_TIMEOUT", 600))

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# 凭证异常
credentials_exception = HTTPException(
    status_code=401,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)

permissions_exception = HTTPException(
    status_code=403,
    detail="Insufficient permissions",
    headers={"WWW-Authenticate": "Bearer"},
)


class UserCache(ABC):
    """user interface"""
    def get(self, username: str) -> Optional[User]:
        pass
    
    def set(self, username: str, user: User) -> None:
        pass

    def clear(self, username: str = None) -> None:
        pass

    def clear_all(self) -> None:
        pass

    def cleanup_expired(self) -> None:
        pass


class NoUserCache(UserCache):
    pass

class LocalUserCache(UserCache):
    def __init__(self, ttl: int = 300):
        self._cache: Dict[str, Tuple[User, float]] = {}  # {username: (user, expire_time)}
        self._ttl = ttl
        self._lock = threading.Lock()

    def get(self, username: str) -> Optional[User]:
        with self._lock:
            self._cleanup_expired()

            if username in self._cache:
                user, expire_time = self._cache[username]
                if time.time() < expire_time:
                    return user
                else:
                    del self._cache[username]
            return None

    def set(self, username: str, user: User) -> None:
        with self._lock:
            expire_time = time.time() + self._ttl
            self._cache[username] = (user, expire_time)

    def clear(self, username: str = None) -> None:
        with self._lock:
            if username:
                self._cache.pop(username, None)
            else:
                self._cache.clear()

    def clear_all(self) -> None:
        with self._lock:
            self._cache.clear()

    def _cleanup_expired(self) -> None:
        current_time = time.time()
        expired_keys = [
            username for username, (_, expire_time) in self._cache.items()
            if current_time >= expire_time
        ]
        for key in expired_keys:
            del self._cache[key]

    def cleanup_expired(self) -> None:
        """对外暴露的清理方法，确保线程安全"""
        with self._lock:
            self._cleanup_expired()


class UserService(ABC):
    """user interface"""

    @abstractmethod
    async def get_user_by_username(self, username: str) -> Optional[User]:
        """get user by name"""
        pass

    @abstractmethod
    async def authenticate_user(self, username: str, password: str) -> Optional[User]:
        """check user credentials"""
        pass


class InMemoryUserService(UserService):
    def __init__(self):
        self._default_pass = os.environ["DEFAULT_USER_PWD"] if "DEFAULT_USER_PWD" in os.environ else None
        # 模拟内存中的用户数据
        self._fake_users_db = {
            "admin": {
                "id": "admin",
                "username": "admin",
                "full_name": "Admin User",
                "email": "admin@example.com",
                "permissions": [],
                "is_super": True,
                "disabled": False,
            },
            "tester": {
                "id": "tester",
                "username": "tester",
                "full_name": "Test User",
                "email": "tester@example.com",
                "permissions": [],
                "disabled": False,
            }
        }

    async def get_user_by_username(self, username: str) -> Optional[User]:
        if username in self._fake_users_db:
            user_dict = self._fake_users_db[username]
            return User(**user_dict)
        return None

    async def authenticate_user(self, username: str, password: str) -> Optional[User]:
        user = await self.get_user_by_username(username)
        if user:
            if not self._default_pass or password == self._default_pass:
                return user
        return None


# 全局变量存储UserService实例
_current_user_service = None

# 全局变量存储UserCache实例
_current_user_cache = None


def get_user_service() -> UserService:
    """获取UserService实例
    
    支持通过set_user_service函数注入自定义实现：
    ```python
    from security import get_user_service, set_user_service
    set_user_service(CustomUserService())
    ```
    """
    global _current_user_service
    if _current_user_service is None:
        _current_user_service = InMemoryUserService()
    return _current_user_service


def set_user_service(service: UserService) -> None:
    """设置自定义的UserService实现"""
    global _current_user_service
    _current_user_service = service


def get_user_cache() -> UserCache:
    """获取UserCache实例
    """
    global _current_user_cache
    if _current_user_cache is None:
        _current_user_cache = NoUserCache()
    return _current_user_cache

def set_user_cache(cache: UserCache) -> None:
    """设置自定义的UserCache实现"""
    global _current_user_cache
    _current_user_cache = cache

def cleanup_expired_cache() -> None:
    _current_user_cache.cleanup_expired()


@lru_cache(maxsize=1000)
def _decode_jwt_cached(token: str, timestamp: int) -> dict:
    return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])


async def get_token_from_header_or_cookie(request: Request) -> str:
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header[7:]  # 移除 "Bearer " 前缀

    token = request.cookies.get("access_token")
    if token:
        return token


# async def get_current_user(token: str = Depends(oauth2_scheme)):
async def get_current_user(request: Request) -> Optional[User]:
    token = await get_token_from_header_or_cookie(request)
    if token is None:
        return None
    try:
        cache_key = int(time.time() / JWT_DECODE_PAYLOAD_CACHE_TTL)
        payload = _decode_jwt_cached(token, cache_key)
        username: str = payload.get("sub")
        if username is None:
            return None

        # 检查JWT是否即将过期（例如，剩余时间少于5分钟）
        current_time = time.time()
        exp = payload.get("exp", 0)
        if JWT_AUTO_REFRESH_TOKEN and exp - current_time < 300:  # 少于5分钟，需要刷新
            # 生成新的JWT令牌
                user = await get_user_service().get_user_by_username(username)
                if user:
                    # 生成新的JWT令牌
                    new_token = create_access_token(data={"sub": user.username})
                    # 更新cookie
                    response = RedirectResponse(url=request.url.path)
                    response.set_cookie(
                        key="access_token", 
                        value=new_token, 
                        httponly=True, 
                        secure=False,  # 生产环境应设置为True
                        max_age=JWT_EXPIRE_PERIOD
                    )
                    request.state.new_token = new_token
    except JWTError:
        return None

    user = _current_user_cache.get(username)
    if user is None:
        user = await get_user_service().get_user_by_username(username)
        if user:
            _current_user_cache.set(username, user)
    if user.disabled:
        return None
    return user


def require_permissions(required_permissions: Optional[List[str]] = None, login_url: str = None):
    """
    permission decorator

    Args:
        required_permissions: required permission list ，None means just needs login
        login_url: If not login, redirect to login_url
    """

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            request = kwargs.get('request')
            if not request:
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break
            if not request:
                if login_url:
                    return RedirectResponse(url=login_url, status_code=status.HTTP_302_FOUND)
                raise credentials_exception
            current_user = await get_current_user(request)
            if not current_user:
                if login_url:
                    return RedirectResponse(url=login_url, status_code=status.HTTP_302_FOUND)
                raise credentials_exception
            if required_permissions:
                is_super = getattr(current_user, 'is_super', False)
                if not is_super:
                    user_permissions = getattr(current_user, 'permissions', [])
                    # 检查用户是否具有任一必需的权限
                    has_any_permission = False
                    for perm in required_permissions:
                        # 处理动态权限（${xxx}形式）
                        if perm.startswith('${') and perm.endswith('}'):
                            # 从request对象中获取对应的属性值
                            attr_name = perm[2:-1]  # 去掉${和}，获取属性名

                            # 尝试从request中获取属性值
                            # 先尝试从path_params中获取
                            if hasattr(request, 'path_params') and attr_name in request.path_params:
                                dynamic_perm = request.path_params[attr_name]
                            # 再尝试从query_params中获取
                            elif hasattr(request, 'query_params') and attr_name in request.query_params:
                                dynamic_perm = request.query_params[attr_name]
                            # 尝试从JSON request body中获取
                            elif hasattr(request, 'body'):
                                try:
                                    # 尝试解析JSON body
                                    body = await request.json()
                                    if isinstance(body, dict) and attr_name in body:
                                        dynamic_perm = body[attr_name]
                                    else:
                                        dynamic_perm = None
                                except:
                                    # 如果不是JSON或解析失败，继续尝试其他方式
                                    dynamic_perm = None
                            # 最后尝试直接从request中获取属性
                            else:
                                dynamic_perm = getattr(request, attr_name, None)
                            if not dynamic_perm:
                                dynamic_perm = "default"
                            # 如果动态权限值存在且用户拥有该权限，则通过权限检查
                            if dynamic_perm and dynamic_perm in user_permissions:
                                has_any_permission = True
                                break
                        # 处理静态权限
                        elif perm in user_permissions:
                            has_any_permission = True
                            break

                    if not has_any_permission:
                        raise permissions_exception
            return await func(*args, **kwargs)
        return wrapper
    return decorator


def require_login(login_url: str = None):
    return require_permissions(login_url=login_url)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(seconds=JWT_EXPIRE_PERIOD)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt


async def login_user(username, password):
    user = await get_user_service().authenticate_user(username, password)
    if not user:
        raise credentials_exception
    access_token = create_access_token(data={"sub": user.username})
    return access_token


async def logout_user(username):
    _decode_jwt_cached.cache_clear()
    _current_user_cache.clear(username)
