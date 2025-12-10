// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', async function() {
    // 获取用户名
    const username = localStorage.getItem('username');
    if (username) {
        document.getElementById('username').textContent = `欢迎，${username}`;
    }

    // 获取用户系统列表
    await fetchSystems();

    // 处理创建系统表单
    const createForm = document.getElementById('create-system-form');
    createForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        const formData = new FormData(createForm);
        const data = Object.fromEntries(formData);

        const messageDiv = document.getElementById('create-message');
        messageDiv.style.display = 'none';

        try {
            const response = await fetch('/sites', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    site_name: data.system_name,
                    site_url: data.site_url
                })
            });

            const result = await response.json();

            if (response.ok) {
                messageDiv.textContent = '系统监控创建成功！';
                messageDiv.className = 'success-message';
                messageDiv.style.display = 'block';
                
                // 清空表单
                createForm.reset();
                
                // 重新加载系统列表
                await fetchSystems();
            } else {
                messageDiv.textContent = result.detail || '系统创建失败，请稍后重试';
                messageDiv.className = 'error-message';
                messageDiv.style.display = 'block';
            }
        } catch (error) {
            messageDiv.textContent = '网络错误，请稍后重试';
            messageDiv.className = 'error-message';
            messageDiv.style.display = 'block';
        }
    });

    // 等待所有系统卡片渲染完成,为每个系统加载授权用户
    setTimeout(() => {
        const systemCards = document.querySelectorAll('.system-card');
        systemCards.forEach(card => {
            const siteName = card.dataset.systemName;
            if (siteName) {
                loadAuthorizedUsers(siteName);
            }
        });
    }, 500);

});

// <!-- 用户监控系统相关的JavaScript函数 -->
// 获取用户的监控系统列表
async function fetchSystems() {
    const container = document.getElementById('systems-container');
    const messageDiv = document.getElementById('message');
    
    try {
        const response = await fetch('/sites');
        
        if (response.ok) {
            const systems = await response.json();
            
            if (systems.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-box-open"></i>
                        <h3>您还没有任何系统在监控</h3>
                        <p>请使用下方的表单创建您的第一个系统的监控</p>
                    </div>
                `;
            } else {
                // 获取当前用户名
                const username = localStorage.getItem('username');
                
                container.innerHTML = systems.map(system => `
                    <div class="system-card" data-system-name="${system.site_name}">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <h2><i class="fas fa-globe"></i> ${system.site_name}</h2>
                            ${username === system.creator ? `<button class="delete-btn" onclick="deleteSystem('${system.site_name}');" title="删除系统">
                                <i class="fas fa-trash"></i>
                            </button>` : ''}
                        </div>
                        <div class="system-url">${system.site_url}</div>
                        <div class="system-creator">创建者: ${system.creator || '未知'}</div>
                        <div class="api-key">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                                <span class="api-key-label">嵌入代码</span>
                                <button class="copy-btn" onclick="copyCode('code-${system.site_name}', this);" title="复制嵌入代码">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                            <pre><code id="code-${system.site_name}">&lt;script src="${window.location.origin}/public/pagemonitor.min.js" data-system="${system.site_name}" data-api-key="${system.api_key}"&gt;&lt;/script&gt;</code></pre>
                        </div>
                        <div style="text-align: right; color: var(--primary-color); font-size: 14px; cursor: pointer;" onclick="selectSystem('${system.site_name}');">
                            <i class="fas fa-chart-line"></i> 查看监控数据 &gt;
                        </div>
                        <div class="authorization-section">
                            <h3><i class="fas fa-user-shield"></i> 授权管理</h3>
                            <div class="authorization-controls">
                                <div style="display: flex; margin-bottom: 15px;">
                                    <input type="text" id="add-user-${system.site_name}" placeholder="输入用户名" style="flex: 1; padding: 8px; margin-right: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                                    <button onclick="addAuthorizedUser('${system.site_name}')" class="action-btn" style="padding: 8px 16px; background-color: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;" title="添加授权用户">
                                        <i class="fas fa-plus"></i>
                                    </button>
                                </div>
                                <div class="authorized-users-list" id="authorized-users-${system.site_name}">
                                    <!-- 授权用户列表将通过JavaScript动态生成 -->
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('');
                
                // 为每个系统加载授权用户列表
                systems.forEach(system => {
                    loadAuthorizedUsers(system.site_name);
                });
                
                // 实现复制代码功能
                window.copyCode = function(codeId, button) {
                    const codeElement = document.getElementById(codeId);
                    if (codeElement) {
                        // 获取原始的HTML字符串并解码
                        let codeContent = codeElement.textContent;
                        
                        // 创建临时文本区域用于复制
                        const tempTextArea = document.createElement('textarea');
                        tempTextArea.value = codeContent;
                        document.body.appendChild(tempTextArea);
                        tempTextArea.select();
                        
                        try {
                            document.execCommand('copy');
                            // 显示复制成功状态
                            const originalText = button.innerHTML;
                            button.innerHTML = '<i class="fas fa-check"></i> 已复制';
                            button.classList.add('copied');
                            
                            // 3秒后恢复原始状态
                            setTimeout(() => {
                                button.innerHTML = originalText;
                                button.classList.remove('copied');
                            }, 3000);
                        } catch (err) {
                            console.error('复制失败:', err);
                        } finally {
                            document.body.removeChild(tempTextArea);
                        }
                    }
                };
            }
        } else if (response.status === 401) {
            // 未登录，跳转到登录页面
            window.location.href = '/login.html';
        } else {
            messageDiv.textContent = '获取系统列表失败';
            messageDiv.className = 'error-message';
            messageDiv.style.display = 'block';
        }
    } catch (error) {
        messageDiv.textContent = '网络错误，请稍后重试';
        messageDiv.className = 'error-message';
        messageDiv.style.display = 'block';
    }
}

// 选择进入的监控系统
function selectSystem(siteName) {
    // 将选中的系统信息存储到localStorage
    localStorage.setItem('selectedSiteName', siteName);
    
    // 跳转到监控页面
    window.location.href = '/';
}

// 删除监控系统
function deleteSystem(siteName) {
    // 显示确认对话框
    if (!confirm(`确定要删除系统 "${siteName}" 吗？\n此操作将删除所有监控数据和网站配置，不可恢复。`)) {
        return;
    }
    
    // 显示加载提示
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = '正在删除系统...';
    messageDiv.className = 'info-message';
    messageDiv.style.display = 'block';
    
    // 执行删除操作
    Promise.resolve()
        .then(() => fetch(`/sites/${siteName}`, {
            method: 'DELETE',
            credentials: 'include'  // 包含cookie以便认证
        }))
        .then(response => {
            if (!response.ok) {
                throw new Error(`删除网站记录失败 (${response.status})`);
            }
            return response.json();
        })
        // 删除成功
        .then(result => {
            messageDiv.textContent = `系统 "${siteName}" 删除成功！`;
            messageDiv.className = 'success-message';
            messageDiv.style.display = 'block';
            
            // 刷新页面，重新加载系统列表
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        })
        // 删除失败
        .catch(error => {
            console.error('删除系统失败:', error);
            messageDiv.textContent = `删除系统失败: ${error.message}`;
            messageDiv.className = 'error-message';
            messageDiv.style.display = 'block';
        });
}

// 修改密码相关功能
let passwordModal;
let closeBtn;
let cancelBtn;
let passwordForm;

// 初始化模态窗口元素
function initPasswordModal() {
    passwordModal = document.getElementById('password-modal');
    closeBtn = document.querySelector('.close-btn');
    cancelBtn = document.querySelector('.cancel-btn');
    passwordForm = document.getElementById('password-form');
    
    // 关闭模态窗口的事件监听
    closeBtn.onclick = closeChangePasswordModal;
    cancelBtn.onclick = closeChangePasswordModal;
    
    // 点击模态窗口外部关闭
    window.onclick = function(event) {
        if (event.target == passwordModal) {
            closeChangePasswordModal();
        }
    }
    
    // 处理密码表单提交
    passwordForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(passwordForm);
        const data = Object.fromEntries(formData);
        
        const messageDiv = document.getElementById('password-message');
        messageDiv.style.display = 'none';
        
        try {
            const response = await fetch('/user/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (response.ok) {
                messageDiv.textContent = '密码修改成功！';
                messageDiv.className = 'success-message';
                messageDiv.style.display = 'block';
                
                // 3秒后关闭模态窗口
                setTimeout(() => {
                    closeChangePasswordModal();
                    messageDiv.style.display = 'none';
                    passwordForm.reset();
                }, 2000);
            } else {
                messageDiv.textContent = result.detail || '密码修改失败，请稍后重试';
                messageDiv.className = 'error-message';
                messageDiv.style.display = 'block';
            }
        } catch (error) {
            messageDiv.textContent = '网络错误，请稍后重试';
            messageDiv.className = 'error-message';
            messageDiv.style.display = 'block';
        }
    });
}

// 打开修改密码模态窗口
function openChangePasswordModal() {
    if (!passwordModal) {
        initPasswordModal();
    }
    passwordModal.style.display = 'block';
}

// 关闭修改密码模态窗口
function closeChangePasswordModal() {
    if (passwordModal) {
        passwordModal.style.display = 'none';
        // 清空表单和消息
        const messageDiv = document.getElementById('password-message');
        messageDiv.style.display = 'none';
        passwordForm.reset();
    }
}

// 退出登录
async function logout() {
    // 添加登出确认对话框
    const confirmed = confirm('确定要登出吗？');
    if (!confirmed) {
        return; // 用户取消登出
    }
    
    try {
        // 发送登出请求 (后端已改为GET请求)
        const response = await fetch('/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'  // 包含cookie
        });
        
        if (response.ok) {
            localStorage.removeItem('username');
            // 登出成功，重定向到登录页面
            window.location.href = '/login.html';
        } else {
            console.error('登出失败');
            // 即使失败也跳转到登录页面
            window.location.href = '/login.html';
        }
    } catch (error) {
        console.error('登出错误:', error);
        // 发生错误时跳转到登录页面
        window.location.href = '/login.html';
    }
}



// <!-- 授权管理相关的JavaScript函数 -->
// 加载网站的授权用户列表
async function loadAuthorizedUsers(siteName) {
    try {
        const response = await fetch(`/sites/${siteName}/users`, {
            credentials: 'include'  // 包含cookie以便认证
        });
        
        if (!response.ok) {
            throw new Error(`获取授权用户列表失败 (${response.status})`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            const userListElement = document.getElementById(`authorized-users-${siteName}`);
            userListElement.innerHTML = '';
            
            // 添加创建者信息
            if (result.creator) {
                const creatorItem = document.createElement('div');
                creatorItem.className = 'authorized-user-item creator';
                creatorItem.innerHTML = `
                    <span class="username">${result.creator.username}</span>
                    <span class="full-name">(${result.creator.full_name || result.creator.username})</span>
                    <span class="email">${result.creator.email || ''}</span>
                    <span class="creator-badge">创建者</span>
                `;
                userListElement.appendChild(creatorItem);
            }
            
            // 获取当前登录用户
            const currentUsername = localStorage.getItem('username');
            
            // 添加其他授权用户
            result.users.forEach(user => {
                // 跳过创建者（已经单独显示）
                if (result.creator && user.username === result.creator.username) {
                    return;
                }
                
                const userItem = document.createElement('div');
                userItem.className = 'authorized-user-item';
                
                // 只有当前用户是创建者时，才显示删除按钮
                const removeButton = currentUsername === result.creator.username ? 
                    `<button onclick="removeAuthorizedUser('${siteName}', '${user.username}')" class="remove-btn" title="移除授权">
                        <i class="fas fa-times"></i>
                    </button>` : '';
                
                userItem.innerHTML = `
                    <span class="username">${user.username}</span>
                    <span class="full-name">(${user.full_name || user.username})</span>
                    <span class="email">${user.email || ''}</span>
                    ${removeButton}
                `;
                userListElement.appendChild(userItem);
            });
        } else {
            console.error('获取授权用户列表失败:', result.message);
        }
    } catch (error) {
        console.error('获取授权用户列表出错:', error);
    }
}

// 添加授权用户
async function addAuthorizedUser(siteName) {
    const inputElement = document.getElementById(`add-user-${siteName}`);
    const username = inputElement.value.trim();
    
    if (!username) {
        alert('请输入用户名');
        return;
    }
    
    try {
        const response = await fetch(`/sites/${siteName}/users`, {
            method: 'POST',
            credentials: 'include',  // 包含cookie以便认证
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username: username })
        });
        
        if (!response.ok) {
            throw new Error(`添加授权用户失败 (${response.status})`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            alert(result.message);
            inputElement.value = '';  // 清空输入框
            loadAuthorizedUsers(siteName);  // 重新加载用户列表
        } else {
            alert('添加授权用户失败: ' + (result.message || '未知错误'));
        }
    } catch (error) {
        console.error('添加授权用户出错:', error);
        alert('添加授权用户出错: ' + error.message);
    }
}

// 移除授权用户
async function removeAuthorizedUser(siteName, username) {
    if (!confirm(`确定要移除用户 ${username} 对系统 "${siteName}" 的访问权限吗？`)) {
        return;
    }
    
    try {
        const response = await fetch(`/sites/${siteName}/users/${username}`, {
            method: 'DELETE',
            credentials: 'include'  // 包含cookie以便认证
        });
        
        if (!response.ok) {
            throw new Error(`移除授权用户失败 (${response.status})`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            alert(result.message);
            loadAuthorizedUsers(siteName);  // 重新加载用户列表
        } else {
            alert('移除授权用户失败: ' + (result.message || '未知错误'));
        }
    } catch (error) {
        console.error('移除授权用户出错:', error);
        alert('移除授权用户出错: ' + error.message);
    }
}


