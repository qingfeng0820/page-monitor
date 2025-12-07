import os
import time
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from functools import wraps
from typing import Optional, Dict, List, Callable, Tuple
from fastapi import HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from functools import lru_cache

from starlette.responses import RedirectResponse

from auth.models import User

# JWT配置
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your-secret-key")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_PERIOD = int(os.environ.get("JWT_EXPIRE_PERIOD", 1800))
JWT_DECODE_PAYLOAD_CACHE_TTL = int(os.environ.get("JWT_DECODE_PAYLOAD_CACHE_TTL", 300))
JWT_AUTO_REFRESH_TOKEN = bool(os.environ.get("JWT_AUTO_REFRESH_TOKEN", True))
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


class UserCache:
    def __init__(self, ttl: int = 300):
        self._cache: Dict[str, Tuple[User, float]] = {}  # {username: (user, expire_time)}
        self._ttl = ttl

    def get(self, username: str) -> Optional[User]:
        self._cleanup_expired()

        if username in self._cache:
            user, expire_time = self._cache[username]
            if time.time() < expire_time:
                return user
            else:
                del self._cache[username]
        return None

    def set(self, username: str, user: User) -> None:
        expire_time = time.time() + self._ttl
        self._cache[username] = (user, expire_time)

    def clear(self, username: str = None) -> None:
        if username:
            self._cache.pop(username, None)
        else:
            self._cache.clear()

    def _cleanup_expired(self) -> None:
        current_time = time.time()
        expired_keys = [
            username for username, (_, expire_time) in self._cache.items()
            if current_time >= expire_time
        ]
        for key in expired_keys:
            del self._cache[key]


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


user_service = InMemoryUserService()
user_cache = UserCache(ttl=SESSION_TIMEOUT)


def cleanup_expired_cache() -> None:
    current_time = time.time()
    expired_keys = [
        username for username, (_, expire_time) in user_cache._cache.items()
        if current_time >= expire_time
    ]
    for key in expired_keys:
        del user_cache._cache[key]


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
            # 重新生成新的JWT令牌
            user = await user_service.get_user_by_username(username)
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

    user = user_cache.get(username)
    if user is None:
        user = await user_service.get_user_by_username(username)
        if user:
            user_cache.set(username, user)
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
                user_permissions = getattr(current_user, 'permissions', [])
                if not any(permission in user_permissions for permission in required_permissions):
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
    user = await user_service.authenticate_user(username, password)
    if not user:
        raise credentials_exception
    access_token = create_access_token(data={"sub": user.username})
    return access_token


async def logout_user(username):
    _decode_jwt_cached.cache_clear()
    user_cache.clear(username)


