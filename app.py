import ipaddress
import logging
import os
import secrets
import hashlib
import threading
import time
from urllib.parse import quote
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request, Response, APIRouter, Depends, Body, Query
from fastapi.security import OAuth2PasswordRequestForm
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse, JSONResponse
from starlette.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from pydantic import BaseModel

from starlette.staticfiles import StaticFiles

from security import require_login, logout_user, login_user, get_current_user, JWT_EXPIRE_PERIOD, cleanup_expired_cache, \
    get_password_hash, user_cache
import mongodb
from track import api_router
from util import access_system

SESSION_CLEANUP_PERIOD = os.environ["SESSION_CLEANUP_PERIOD"] if "SESSION_CLEANUP_PERIOD" in os.environ else 3600
ALLOW_REGISTER_OUT_OF_SITE = os.environ.get("ALLOW_REGISTER_OUT_OF_SITE", "False").lower() == "true"


# 注册请求模型
class RegisterRequest(BaseModel):
    username: str
    full_name: str
    password: str
    phone: str
    email: str


class CreateSiteRequest(BaseModel):
    site_name: str
    site_url: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str

class AddSiteUserRequest(BaseModel):
    username: str


# 生成API密钥的函数
def _generate_api_key(site_name, site_url, username):
    """使用site_name、site_url、username和当前时间生成唯一的API密钥"""
    key_data = f"{site_name}{site_url}{username}{datetime.now().isoformat()}{secrets.token_hex(16)}"
    return hashlib.sha256(key_data.encode()).hexdigest()


# 配置logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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


# 定义lifespan事件处理器
@asynccontextmanager
async def lifespan(app: FastAPI):
    await mongodb.init_db()

    # 使用set_user_service函数注入MongoDBUserService
    from security import get_user_service, set_user_service
    set_user_service(mongodb.MongoDBUserService())

    def periodic_cleanup():
        while True:
            try:
                cleanup_expired_cache()
            except Exception as e:
                print(f"Cache cleanup error: {e}")
            time.sleep(SESSION_CLEANUP_PERIOD)
    cleanup_thread = threading.Thread(target=periodic_cleanup, daemon=True)
    cleanup_thread.start()
    yield

app = FastAPI(title="页面访问监控API", lifespan=lifespan)

# 获取CORS允许的源列表
allow_origins_env = os.getenv("ALLOW_ORIGINS")
allow_origins = []

logger.info("ALLOW_ORIGINS: %s", allow_origins_env)

if allow_origins_env:
    # 如果环境变量不为空，按逗号分割多个源
    allow_origins = [origin.strip() for origin in allow_origins_env.split(",")]
    # 移除可能存在的空字符串
    allow_origins = [origin for origin in allow_origins if origin]

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",  # 允许本地开发环境
    allow_origins=allow_origins,  # 允许配置的生产环境源
    allow_credentials=True,  # 允许发送凭证
    allow_methods=["GET", "POST", "OPTIONS"],  # 只允许必要的HTTP方法
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "X-API-Key"],  # 只允许必要的头
    max_age=86400,  # 预检请求的缓存时间（秒）
)

app.add_middleware(TokenRefreshMiddleware)


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


@app.post("/user/change-password")
async def change_password(request: Request, password_data: ChangePasswordRequest):
    """修改用户密码，仅允许已认证用户使用"""
    # 获取当前用户
    current_user = await get_current_user(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="请先登录")
    
    # 验证新密码和确认密码是否一致
    if password_data.new_password != password_data.confirm_password:
        raise HTTPException(status_code=400, detail="新密码和确认密码不一致")
    
    # 验证当前密码是否正确
    user_info = await mongodb.users_collection.find_one({"username": current_user.username})
    if not user_info:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    from security import verify_password, get_password_hash
    if not verify_password(password_data.current_password, user_info["password"]):
        raise HTTPException(status_code=400, detail="当前密码错误")
    
    # 更新密码
    try:
        hashed_new_password = get_password_hash(password_data.new_password)
        await mongodb.users_collection.update_one(
            {"username": current_user.username},
            {"$set": {"password": hashed_new_password}}
        )
        user_cache.clear(current_user.username)
        return {"message": "密码修改成功"}
    except Exception as e:
        logger.error(f"修改密码失败: {str(e)}")
        raise HTTPException(status_code=500, detail="修改密码失败")


@app.get("/sites")
async def get_sites(request: Request):
    """获取当前用户的所有网站列表，仅允许已认证用户使用"""
    # 获取当前用户
    current_user = await get_current_user(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="请先登录")
    
    # 查询用户的所有网站（包括自己创建的和有权限访问的）
    try:
        # 使用异步方式获取所有网站
        sites_cursor = mongodb.sites_collection.find(
            {"$or": [
                {"creator": current_user.username},
                {"site_name": {"$in": current_user.permissions}}
            ]},
            {"_id": 0, "site_name": 1, "site_url": 1, "api_key": 1, "creator": 1}
        )
        return await sites_cursor.to_list(length=None)
    except Exception as e:
        logger.error(f"获取网站列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail="获取网站列表失败")


@app.post("/sites")
async def create_site(request: Request, site_data: CreateSiteRequest):
    """创建新网站接口，仅允许已认证用户使用"""
    # 获取当前用户
    current_user = await get_current_user(request)
    if not current_user:
        raise HTTPException(status_code=401, detail="请先登录")
    
    # 验证网站名称和URL
    if site_data.site_name == "" or site_data.site_url == "":
        raise HTTPException(status_code=400, detail="请填写完整的网站信息")
    
    if site_data.site_name == "default":
        raise HTTPException(status_code=400, detail="不合法网站名称")
    
    # 检查网站是否已存在（根据site_name或site_url判断）
    existing_site = await mongodb.sites_collection.find_one({
        "$or": [
            {"site_name": site_data.site_name},
            {"site_url": site_data.site_url}
        ]
    })
    
    if existing_site:
        raise HTTPException(status_code=400, detail="网站已存在")

    # 更新用户的permissions，添加新创建的系统名称作为权限项
    user = await mongodb.users_collection.find_one({"username": current_user.username})
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    api_key = _generate_api_key(site_data.site_name, site_data.site_url, current_user.username)
    
    # 保存网站信息到网站表
    save_data = {
        "site_name": site_data.site_name,
        "site_url": site_data.site_url,
        "creator": current_user.username,
        "api_key": api_key,
        "created_at": datetime.now()
    }

    # 插入网站数据到数据库
    await mongodb.sites_collection.insert_one(save_data)
    

    # 获取当前用户的权限列表
    current_permissions = user.get("permissions", [])
    
    # 如果系统名称不在权限列表中，则添加
    if site_data.site_name not in current_permissions:
        updated_permissions = current_permissions + [site_data.site_name]
        
        # 更新用户的权限字段
        await mongodb.users_collection.update_one(
            {"username": current_user.username},
            {"$set": {"permissions": updated_permissions}}
        )
        user_cache.clear(current_user.username)
    return {
        "message": "网站创建成功",
        "api_key": api_key,
        "site_info": {
            "site_name": site_data.site_name,
            "site_url": site_data.site_url,
            "creator": current_user.username
        }
    }


@app.delete("/sites/{site_name}")
@access_system("${site_name}")
async def delete_site(request: Request, site_name: str):
    """
    删除指定的网站及其相关数据，包括：
    1. 从sites_collection中删除网站记录
    2. 从所有用户的permissions中移除该网站名称
    3. 删除该网站的所有统计数据
    
    Args:
        request: 请求对象，用于获取当前用户信息
        site_name: 要删除的网站名称
    """
    try:
        # 获取当前用户
        current_user = await get_current_user(request)
        if not current_user:
            raise HTTPException(status_code=401, detail="请先登录")
        
        # 检查网站是否存在
        site = await mongodb.sites_collection.find_one({"site_name": site_name})
        if not site:
            raise HTTPException(status_code=404, detail="网站不存在")
        
        # 检查当前用户是否是网站的创建者（只有创建者可以删除）
        if site.get("creator") != current_user.username:
            raise HTTPException(status_code=403, detail="没有权限删除此网站")
        
        # 删除网站记录
        await mongodb.sites_collection.delete_one({"site_name": site_name})
        
        # 从所有用户的permissions中移除该网站名称
        result = await mongodb.users_collection.update_many(
            {"permissions": site_name},  # 查找所有包含该网站权限的用户
            {"$pull": {"permissions": site_name}}  # 从权限列表中移除该网站名称
        )
        user_cache.clear_all()
        
        # 从track.py中导入普通方法，以便可以直接调用_delete_system_stats函数
        from track import _delete_system_stats
    
        # 删除该网站的所有统计数据
        stats_result = await _delete_system_stats(site_name)
        
        return {
            "success": True,
            "message": f"成功删除网站 '{site_name}' 及其相关数据",
            "site_deleted": True,
            "users_updated": result.modified_count,
            "stats_deleted": stats_result.get("deleted_count", 0)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除网站失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"删除网站失败: {str(e)}")


@app.get("/sites/{site_name}/users")
@access_system("${site_name}")
async def get_site_users(request: Request, site_name: str):
    """
    获取网站的授权用户列表
    
    Args:
        request: 请求对象，用于获取当前用户信息
        site_name: 网站名称
    """
    try:
        # 检查网站是否存在
        site = await mongodb.sites_collection.find_one({"site_name": site_name})
        if not site:
            raise HTTPException(status_code=404, detail="网站不存在")
        
        # 获取所有具有该网站权限的用户
        users_cursor = mongodb.users_collection.find(
            {"permissions": site_name},
            {"_id": 0, "username": 1, "full_name": 1, "email": 1, "permissions": 1}
        )
        users = await users_cursor.to_list(length=None)
        
        # 添加创建者信息
        creator = await mongodb.users_collection.find_one(
            {"username": site.get("creator")},
            {"_id": 0, "username": 1, "full_name": 1, "email": 1}
        )
        
        return {
            "success": True,
            "site_name": site_name,
            "creator": creator,
            "users": users
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取网站授权用户列表失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取网站授权用户列表失败: {str(e)}")


@app.post("/sites/{site_name}/users")
@access_system("${site_name}")
async def add_site_user(request: Request, site_name: str, user_request: AddSiteUserRequest):
    """
    为网站添加授权用户
    
    Args:
        request: 请求对象，用于获取当前用户信息
        site_name: 网站名称
        user_request: 包含要授权的用户名的请求体
    """
    try:
        # 检查网站是否存在
        site = await mongodb.sites_collection.find_one({"site_name": site_name})
        if not site:
            raise HTTPException(status_code=404, detail="网站不存在")
        
        # 检查当前用户是否是网站的创建者（只有创建者可以授权）
        # current_user = await get_current_user(request)
        # if site.get("creator") != current_user.username:
        #     raise HTTPException(status_code=403, detail="只有网站创建者可以添加授权用户")
        
        # 检查目标用户是否存在
        user = await mongodb.users_collection.find_one({"username": user_request.username})
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        
        # 检查用户是否已经有该网站的权限
        if site_name in user.get("permissions", []):
            return {
                "success": True,
                "message": f"用户 '{user_request.username}' 已经有 '{site_name}' 系统的访问权限",
                "already_has_permission": True
            }
        
        # 为用户添加网站权限
        await mongodb.users_collection.update_one(
            {"username": user_request.username},
            {"$addToSet": {"permissions": site_name}}
        )
        user_cache.clear(user_request.username)
        
        return {
            "success": True,
            "message": f"成功为用户 '{user_request.username}' 添加 '{site_name}' 系统的访问权限"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"添加网站授权用户失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"添加网站授权用户失败: {str(e)}")


@app.delete("/sites/{site_name}/users/{username}")
@access_system("${site_name}")
async def remove_site_user(request: Request, site_name: str, username: str):
    """
    从网站移除授权用户
    
    Args:
        request: 请求对象，用于获取当前用户信息
        site_name: 网站名称
        username: 要移除授权的用户名
    """
    try:
        # 检查网站是否存在
        site = await mongodb.sites_collection.find_one({"site_name": site_name})
        if not site:
            raise HTTPException(status_code=404, detail="网站不存在")
        
        # 检查当前用户是否是网站的创建者（只有创建者可以移除授权）
        current_user = await get_current_user(request)
        if site.get("creator") != current_user.username:
            raise HTTPException(status_code=403, detail="只有网站创建者可以移除授权用户")

        if site.get("creator") == current_user.username:
            raise HTTPException(status_code=403, detail="不能移除自己")
        
        # 检查目标用户是否存在
        user = await mongodb.users_collection.find_one({"username": username})
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        
        # 检查用户是否有该网站的权限
        if site_name not in user.get("permissions", []):
            return {
                "success": True,
                "message": f"用户 '{username}' 没有 '{site_name}' 系统的访问权限",
                "no_permission": True
            }
        
        # 从用户移除网站权限
        await mongodb.users_collection.update_one(
            {"username": username},
            {"$pull": {"permissions": site_name}}
        )
        user_cache.clear(username)
        
        return {
            "success": True,
            "message": f"成功从用户 '{username}' 移除 '{site_name}' 系统的访问权限"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"移除网站授权用户失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"移除网站授权用户失败: {str(e)}")


@app.post("/register")
async def register(request: Request, register_data: RegisterRequest):
    if register_data.username == "" or register_data.password == "" or (register_data.email == "" and register_data.phone == ""):
        raise HTTPException(status_code=400, detail="请填写完整的注册信息 (邮箱/手机填一个)")

    # 检查用户名是否已存在
    if await mongodb.users_collection.find_one({"username": register_data.username}):
        raise HTTPException(status_code=400, detail="用户名已被注册")
    
    # 检查邮箱是否已存在
    if register_data.email and await mongodb.users_collection.find_one({"email": register_data.email}):
        raise HTTPException(status_code=400, detail="邮箱已被注册")
    
    # 检查手机号是否已存在
    if register_data.phone and await mongodb.users_collection.find_one({"phone": register_data.phone}):
        raise HTTPException(status_code=400, detail="手机号已被注册")
    
    
    # 保存用户信息到用户表
    user_data = {
        "username": register_data.username, 
        "password": get_password_hash(register_data.password),
        "full_name": register_data.full_name,
        "email": register_data.email,
        "phone": register_data.phone,
        "created_at": datetime.now()
    }
    
    # 插入数据到数据库
    await mongodb.users_collection.insert_one(user_data)
    
    return {
        "message": "注册成功",
        "user_info": {
            "username": register_data.username,
            "email": register_data.email,
            "full_name": register_data.full_name,
            "phone": register_data.phone
        }
    }


def is_private_ip(ip_str):
    """检查IP地址是否为内网IP"""
    try:
        ip = ipaddress.ip_address(ip_str)
        # 检查是否为内网IP范围
        return (
            ip.is_private or 
            ipaddress.IPv4Address(ip_str) in ipaddress.IPv4Network('10.0.0.0/8') or
            ipaddress.IPv4Address(ip_str) in ipaddress.IPv4Network('172.16.0.0/12') or
            ipaddress.IPv4Address(ip_str) in ipaddress.IPv4Network('192.168.0.0/16') or
            ipaddress.IPv4Address(ip_str) in ipaddress.IPv4Network('127.0.0.0/8')
        )
    except ValueError:
        return False


class ProtectedStaticFiles(StaticFiles):
    async def __call__(self, scope, receive, send) -> None:
        request = Request(scope, receive)

        # 检查请求的文件是否为HTML文件
        path = scope.get("path", "")
        
        # 为register.html添加内网IP访问控制
        if path.endswith('/register.html'):
            # 获取客户端IP地址
            client_ip = request.client.host if request.client else ""
            
            # 检查是否为内网IP
            if not ALLOW_REGISTER_OUT_OF_SITE and not is_private_ip(client_ip):
                # 非内网IP访问被拒绝
                response = JSONResponse(
                    status_code=403,
                    content={"detail": "注册页面仅允许内网访问"}
                )
                await response(scope, receive, send)
                return
        
        is_html_file = path == "/" or path.endswith('.html') and not path.endswith('/login.html') \
                       and not path.endswith('/register.html') if path else False

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
