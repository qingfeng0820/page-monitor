// 主入口文件

// 图表实例
let urlChart, browserChart, osChart, deviceChart, combinationChart, userChart, ipChart;
let downloadFileChart, downloadSourceChart, downloadUserChart, downloadIpChart;
let eventTypeChart, eventCategoryChart, eventActionChart, eventLabelChart, eventSelectorChart, eventCombinationChart, eventUserChart, eventIpChart;

// 初始化函数
document.addEventListener('DOMContentLoaded', function() {


    // 初始化时间范围选择器
    initDateRangeSelector();
    
    // 加载数据
    loadData();
    
    // 设置标签切换
    setupTabs();
    
    // 设置卡片最大化功能
    setupMaximizeCards();
    
    // 设置登出功能
    setupLogout();
    
    // 设置配置按钮功能
    setupConfig();
});

// 登出功能
function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            // 添加登出确认对话框
            const confirmed = confirm('确定要登出吗？');
            if (!confirmed) {
                return; // 用户取消登出
            }

            try {
                // 发送登出请求 (后端已改为GET请求)
                const response = await fetch('logout', {
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
                }
            } catch (error) {
                console.error('登出错误:', error);
            }
        });
    }
}

// 配置按钮功能
function setupConfig() {
    const configBtn = document.getElementById('configBtn');
    if (configBtn) {
        configBtn.addEventListener('click', () => {
            console.log('配置按钮被点击');
            // 跳转到control.html页面进行脚本拷贝
            window.location.href = 'control.html';
        });
    }
}