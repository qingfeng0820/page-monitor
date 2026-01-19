// 封装fetch方法，处理401错误
async function apiFetch(url, options = {}) {
    try {
        const response = await fetch(url, options);
        
        // 处理401错误，跳转到登录页面
        if (response.status === 401) {
            localStorage.removeItem('username');
            localStorage.removeItem('user_id');
            window.location.href = 'login.html';
            return Promise.reject(new Error(t('unauthorizedAccess')));
        }
        
        return response;
    } catch (error) {
        console.error(t('apiRequestError'), error);
        throw error;
    }
}