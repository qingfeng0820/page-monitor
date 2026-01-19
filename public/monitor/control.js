// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', async function() {
    // 获取用户名
    const username = localStorage.getItem('username');
    if (username) {
        document.getElementById('username').textContent = t('welcomeMessage', { username: username });
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
            const response = await apiFetch('sites', {
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
                messageDiv.textContent = t('systemCreateSuccess');
                messageDiv.className = 'success-message';
                messageDiv.style.display = 'block';
                
                // 清空表单
                createForm.reset();
                
                // 重新加载系统列表
                await fetchSystems();
            } else {
                messageDiv.textContent = result.detail || t('systemCreateFailed');
                messageDiv.className = 'error-message';
                messageDiv.style.display = 'block';
            }
        } catch (error) {
            messageDiv.textContent = t('networkError');
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
        const response = await apiFetch('sites');
        
        if (response.ok) {
            const systems = await response.json();
            
            if (systems.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-box-open"></i>
                        <h3 data-i18n="noSystemsMonitored">${t('noSystemsMonitored')}</h3>
                        <p data-i18n="createFirstSystem">${t('createFirstSystem')}</p>
                    </div>
                `;
            } else {
                // 获取当前用户名
                const username = localStorage.getItem('username');
                
                container.innerHTML = systems.map(system => `
                    <div class="system-card" data-system-name="${system.site_name}">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <h2 style="cursor: pointer; color: var(--primary-color);" onclick="selectSystem('${system.site_name}');"><i class="fas fa-globe"></i> ${system.site_name}</h2>
                            ${username === system.creator ? `<button class="delete-btn" onclick="deleteSystem('${system.site_name}');" data-i18n-title="deleteSystem" title="${t('deleteSystem')}">
                                <i class="fas fa-trash"></i>
                            </button>` : ''}
                        </div>
                        <div class="system-url">${system.site_url}</div>
                        <div class="api-key">
                            <div style="display: flex; align-items: bottom; justify-content: space-between; margin-bottom: 2px;">
                                <div style="display: flex; align-items: center; gap: 10px; height: 24px;">
                                    <span class="api-key-label" style="margin: 0; padding: 0; line-height: 24px;" data-i18n="embedCode">${t('embedCode')}</span>
                                    <button class="copy-btn" onclick="copyCode('code-html-${system.site_name}', this);" data-i18n-title="copyCurrentTabCode" title="${t('copyCurrentTabCode')}" style="padding: 3px 8px; font-size: 12px; height: 20px; line-height: 16px; margin: 0;">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                </div>
                                <div class="code-tabs" style="font-size: 11px; background: rgba(255, 255, 255, 0.1); padding: 2px; border-radius: 15px;">
                                    <button class="tab-btn active" onclick="switchTab('${system.site_name}', 'html');" style="padding: 3px 12px; border-radius: 12px;" data-i18n="html">${t('html')}</button>
                                    <button class="tab-btn" onclick="switchTab('${system.site_name}', 'vue');" style="padding: 3px 12px; border-radius: 12px;" data-i18n="vue">${t('vue')}</button>
                                    <button class="tab-btn" onclick="switchTab('${system.site_name}', 'react');" style="padding: 3px 12px; border-radius: 12px;" data-i18n="react">${t('react')}</button>
                                </div>
                            </div>
                            <!-- HTML代码 -->
                            <div id="tab-html-${system.site_name}" class="tab-content active">
                                <pre><code id="code-html-${system.site_name}">&lt;script src="${window.location.origin}${window.location.pathname.replace('control.html', '')}public/pagemonitor.min.js" data-system="${system.site_name}" data-api-key="${system.api_key}"&gt;&lt;/script&gt;</code></pre>
                            </div>
                            <!-- Vue代码 -->
                            <div id="tab-vue-${system.site_name}" class="tab-content">
                                <pre><code id="code-vue-${system.site_name}">&lt;template&gt;
  &lt;div&gt;你的Vue组件&lt;/div&gt;
&lt;/template&gt;

&lt;script setup&gt;
import { onMounted, onUnmounted } from 'vue';

// TypeScript类型声明（在TypeScript环境下需要放开下面的类型声明注释）
/*
interface PageMonitorOptions {
  system: string;
  apiKey: string;
  isSPA: boolean;
  isTrackDownloads: boolean;
}

declare global {
  interface Window {
    pageMonitorInstance?: any;
    _pageMonitorScript?: HTMLScriptElement;
    PageMonitor?: new (options: PageMonitorOptions) => any;
  }
  var PageMonitor: new (options: PageMonitorOptions) => any;
}
*/

onMounted(() => {
  // 动态加载并初始化 pagemonitor.js
  const script = document.createElement('script');
  script.src = '${window.location.origin}${window.location.pathname.replace('control.html', '')}public/pagemonitor.min.js';
  script.onload = () => {
    // 确保通过window对象访问PageMonitor类
    if (typeof window.PageMonitor !== 'undefined') {
      window.pageMonitorInstance = new window.PageMonitor({
        system: '${system.site_name}',
        apiKey: '${system.api_key}',
        isSPA: true,
        isTrackDownloads: true
      });
    } else {
      console.error('PageMonitor class not found in window object. Make sure the script loaded correctly.');
    }
  };
  script.onerror = () => {
    console.error('Failed to load pagemonitor.js script.');
  };
  document.body.appendChild(script);
  
  // 将script元素保存到window对象，以便在onUnmounted中访问
  window._pageMonitorScript = script;
});

onUnmounted(() => {
  // 组件销毁前的清理工作
  if (window.pageMonitorInstance) {
    // 如果PageMonitor有destroy方法，调用它
    if (typeof window.pageMonitorInstance.destroy === 'function') {
      window.pageMonitorInstance.destroy();
    }
    // 删除全局实例
    delete window.pageMonitorInstance;
  }
  
  // 移除动态创建的script元素
  if (window._pageMonitorScript) {
    document.body.removeChild(window._pageMonitorScript);
    delete window._pageMonitorScript;
  }
});
&lt;/script setup&gt;</code></pre>
                            </div>
                            <!-- React代码 -->
                            <div id="tab-react-${system.site_name}" class="tab-content">
                                <pre><code id="code-react-${system.site_name}">import React, { useEffect } from 'react';

// TypeScript类型声明（在TypeScript环境下需要放开下面的类型声明注释）
/*
interface PageMonitorOptions {
  system: string;
  apiKey: string;
  isSPA: boolean;
  isTrackDownloads: boolean;
}

declare global {
  interface Window {
    pageMonitorInstance?: any;
    _pageMonitorScript?: HTMLScriptElement;
  }
  var PageMonitor: new (options: PageMonitorOptions) => any;
}
*/

function App() {
  useEffect(() => {
    // 动态加载并初始化 pagemonitor.js
    const script = document.createElement('script');
    script.src = '${window.location.origin}${window.location.pathname.replace('control.html', '')}public/pagemonitor.min.js';
    script.onload = () => {
      // 确保通过window对象访问PageMonitor类
      if (typeof window.PageMonitor !== 'undefined') {
        window.pageMonitorInstance = new window.PageMonitor({
          system: '${system.site_name}',
          apiKey: '${system.api_key}',
          isSPA: true,
          isTrackDownloads: true
        });
      } else {
        console.error('PageMonitor class not found in window object. Make sure the script loaded correctly.');
      }
    };
    script.onerror = () => {
      console.error('Failed to load pagemonitor.js script.');
    };
    document.body.appendChild(script);
    
    // 将script元素保存到window对象，以便在清理时访问
    window._pageMonitorScript = script;
    
    return () => {
      // 清理PageMonitor实例
      if (window.pageMonitorInstance) {
        if (typeof window.pageMonitorInstance.destroy === 'function') {
          window.pageMonitorInstance.destroy();
        }
        delete window.pageMonitorInstance;
      }
      // 移除script元素
      if (window._pageMonitorScript) {
        document.body.removeChild(window._pageMonitorScript);
        delete window._pageMonitorScript;
      }
    };
  }, []);
  
  return &lt;div&gt;React 应用&lt;/div&gt;;
}

export default App;</code></pre>
                            </div>
                        </div>
                        <div style="text-align: right; color: var(--primary-color); font-size: 14px; cursor: pointer;" onclick="selectSystem('${system.site_name}');">
                            <i class="fas fa-chart-line"></i> <span data-i18n="viewMonitoringData">${t('viewMonitoringData')}</span>
                        </div>
                        <div class="authorization-section">
                            <h3><i class="fas fa-user-shield"></i> <span data-i18n="authorizationManagement">${t('authorizationManagement')}</span></h3>
                            <div class="authorization-controls">
                                <div style="display: flex; margin-bottom: 15px;">
                                    <input type="text" id="add-user-${system.site_name}" data-i18n-placeholder="enterUsername" placeholder="${t('enterUsername')}" style="flex: 1; padding: 8px; margin-right: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;">
                                    <button onclick="addAuthorizedUser('${system.site_name}')" class="action-btn" style="padding: 8px 16px; background-color: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;" data-i18n-title="addAuthorizedUser" title="${t('addAuthorizedUser')}">
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
                            button.innerHTML = '<i class="fas fa-check"></i> ' + t('copySuccess');
                            button.classList.add('copied');
                            
                            // 3秒后恢复原始状态
                            setTimeout(() => {
                                button.innerHTML = originalText;
                                button.classList.remove('copied');
                            }, 3000);
                        } catch (err) {
                            console.error(t('copyFailed', { errorMessage: err.message }));
                        } finally {
                            document.body.removeChild(tempTextArea);
                        }
                    }
                };
                
                // Tab切换函数
                window.switchTab = function(siteName, tabType) {
                    // 移除所有Tab按钮的active类
                    const tabButtons = document.querySelectorAll(`[onclick="switchTab('${siteName}', 'html');"], [onclick="switchTab('${siteName}', 'vue');"], [onclick="switchTab('${siteName}', 'react');"]`);
                    tabButtons.forEach(btn => btn.classList.remove('active'));
                    
                    // 移除所有Tab内容的active类
                    const tabContents = document.querySelectorAll(`#tab-html-${siteName}, #tab-vue-${siteName}, #tab-react-${siteName}`);
                    tabContents.forEach(content => content.classList.remove('active'));
                    
                    // 添加当前Tab按钮和内容的active类
                    const activeBtn = document.querySelector(`[onclick="switchTab('${siteName}', '${tabType}');"]`);
                    const activeContent = document.getElementById(`tab-${tabType}-${siteName}`);
                    if (activeBtn) activeBtn.classList.add('active');
                    if (activeContent) activeContent.classList.add('active');
                    
                    // 更新复制按钮的onclick事件，使其复制当前选中标签页的代码
                    const systemCard = document.querySelector(`[data-system-name="${siteName}"]`);
                    if (systemCard) {
                        const copyBtn = systemCard.querySelector('.copy-btn');
                        if (copyBtn) {
                            copyBtn.onclick = function() {
                                copyCode(`code-${tabType}-${siteName}`, this);
                            };
                        }
                    }
                };
            }
        } else if (response.status === 401) {
            // 未登录，跳转到登录页面
            window.location.href = 'login.html';
        } else {
            messageDiv.textContent = t('failedToGetSystems');
            messageDiv.className = 'error-message';
            messageDiv.style.display = 'block';
        }
    } catch (error) {
        messageDiv.textContent = t('networkError');
        messageDiv.className = 'error-message';
        messageDiv.style.display = 'block';
    }
}

// 选择进入的监控系统
function selectSystem(siteName) {
    // 将选中的系统信息存储到localStorage
    localStorage.setItem('selectedSiteName', siteName);
    
    // 跳转到监控页面
    window.location.href = './';
}

// 删除监控系统
function deleteSystem(siteName) {
    // 显示确认对话框
    if (!confirm(t('confirmDeleteSystem', { siteName: siteName }))) {
        return;
    }
    
    // 显示加载提示
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = t('deletingSystem');
    messageDiv.className = 'info-message';
    messageDiv.style.display = 'block';
    
    // 执行删除操作
    Promise.resolve()
        .then(() => apiFetch(`sites/${siteName}`, {
            method: 'DELETE',
            credentials: 'include'  // 包含cookie以便认证
        }))
        .then(response => {
            if (!response.ok) {
            throw new Error(t('httpError', { status: response.status }));
        }
            return response.json();
        })
        // 删除成功
        .then(result => {
            messageDiv.textContent = t('systemDeleteSuccess', { siteName: siteName });
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
            messageDiv.textContent = t('systemDeleteFailed', { errorMessage: error.message });
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
            const response = await apiFetch('user/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (response.ok) {
                messageDiv.textContent = t('passwordChangeSuccess');
                messageDiv.className = 'success-message';
                messageDiv.style.display = 'block';
                
                // 3秒后关闭模态窗口
                setTimeout(() => {
                    closeChangePasswordModal();
                    messageDiv.style.display = 'none';
                    passwordForm.reset();
                }, 2000);
            } else {
                messageDiv.textContent = result.detail || t('passwordChangeFailed');
                messageDiv.className = 'error-message';
                messageDiv.style.display = 'block';
            }
        } catch (error) {
            messageDiv.textContent = t('networkError');
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
    const confirmed = confirm(t('confirmLogout'));
    if (!confirmed) {
        return; // 用户取消登出
    }
    
    try {
        // 发送登出请求 (后端已改为GET请求)
        const response = await apiFetch('logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'  // 包含cookie
        });
        
        if (response.ok) {
            localStorage.removeItem('username');
            // 登出成功，重定向到登录页面
            window.location.href = 'login.html';
        } else {
            console.error('登出失败');
            // 即使失败也跳转到登录页面
            window.location.href = 'login.html';
        }
    } catch (error) {
        console.error('登出错误:', error);
        // 发生错误时跳转到登录页面
        window.location.href = 'login.html';
    }
}



// <!-- 授权管理相关的JavaScript函数 -->
// 加载网站的授权用户列表
async function loadAuthorizedUsers(siteName) {
    try {
        const response = await apiFetch(`sites/${siteName}/users`, {
            credentials: 'include'  // 包含cookie以便认证
        });
        
        if (!response.ok) {
            throw new Error(t('httpError', { status: response.status }));
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
                    <span class="creator-badge" data-i18n="creator">${t('creator')}</span>
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
                    `<button onclick="removeAuthorizedUser('${siteName}', '${user.username}')" class="remove-btn" data-i18n-title="removeUser" title="${t('removeUser')}">
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
        alert(t('enterUsername'));
        return;
    }
    
    try {
        const response = await apiFetch(`sites/${siteName}/users`, {
            method: 'POST',
            credentials: 'include',  // 包含cookie以便认证
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username: username })
        });
        
        if (!response.ok) {
            throw new Error(t('httpError', { status: response.status }));
        }
        
        const result = await response.json();
        
        if (result.success) {
            alert(t('addUserSuccess'));
            inputElement.value = '';  // 清空输入框
            loadAuthorizedUsers(siteName);  // 重新加载用户列表
        } else {
            alert(t('addUserFailed', { errorMessage: result.message || '未知错误' }));
        }
    } catch (error) {
        console.error('添加授权用户出错:', error);
        alert(t('addUserFailed', { errorMessage: error.message || '未知错误' }));
    }
}

// 移除授权用户
async function removeAuthorizedUser(siteName, username) {
    if (!confirm(t('confirmRemoveUser', { username: username, siteName: siteName }))) {
        return;
    }
    
    try {
        const response = await apiFetch(`sites/${siteName}/users/${username}`, {
            method: 'DELETE',
            credentials: 'include'  // 包含cookie以便认证
        });
        
        if (!response.ok) {
            throw new Error(t('httpError', { status: response.status }));
        }
        
        const result = await response.json();
        
        if (result.success) {
            alert(t('removeUserSuccess', { username: username, siteName: siteName }));
            loadAuthorizedUsers(siteName);  // 重新加载用户列表
        } else {
            alert(t('removeUserFailed', { errorMessage: result.message || '未知错误' }));
        }
    } catch (error) {
        console.error('移除授权用户出错:', error);
        alert(t('removeUserFailed', { errorMessage: error.message || '未知错误' }));
    }
}

// 监听语言变化事件，重新加载系统列表以更新动态内容的翻译
// document.addEventListener('languageChanged', async function() {
//     await fetchSystems();
// });