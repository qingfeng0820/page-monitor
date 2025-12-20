// 封装fetch方法，处理401错误
async function apiFetch(url, options = {}) {
    try {
        const response = await fetch(url, options);
        
        // 处理401错误，跳转到登录页面
        if (response.status === 401) {
            localStorage.removeItem('username');
            localStorage.removeItem('user_id');
            window.location.href = 'login.html';
            return Promise.reject(new Error('未授权访问'));
        }
        
        return response;
    } catch (error) {
        console.error('API请求错误:', error);
        throw error;
    }
}
