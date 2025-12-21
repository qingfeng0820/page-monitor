// 监控工具类
class PageMonitor {
    // 日志级别定义
    static LOG_LEVELS = {debug: 0, info: 1, warn: 2, error: 3};
    
    constructor(options = {}) {
        try {
            this.logLevel = options.logLevel || "warn"; // debug模式，控制是否打印日志
            // 初始化监控未启用标志
            this.isMonitoringEnabled = true;
            
            // 检查必要参数
            if (!options.system) {
                this.log_warn('System parameter is required. Monitoring will not be started.');
                this.isMonitoringEnabled = false;
            }
            if (!options.apiKey) {
                this.log_warn('API Key parameter is required. Monitoring will not be started.');
                this.isMonitoringEnabled = false;
            }
            
            // 设置apiBaseUrl，如果未提供则尝试自动检测脚本URL
            if (options.apiBaseUrl) {
                this.apiBaseUrl = options.apiBaseUrl;
                this.log_debug(`Using provided apiBaseUrl: ${this.apiBaseUrl}`);
            } else {
                // 尝试自动检测pagemonitor.js的URL
                let detectedApiBaseUrl = '/api';
                try {
                    // 方法1: 首先尝试查找包含pagemonitor关键词的脚本标签
                    const scriptTags = document.querySelectorAll('script[src*="pagemonitor"]');
                    
                    // 如果找到匹配的脚本标签
                    if (scriptTags.length > 0) {
                        for (const script of scriptTags) {
                            try {
                                // 检查script.src是否存在且不为空
                                if (script.src) {
                                    const scriptUrl = new URL(script.src);
                                    // 只接受http://或https://协议
                                    if (scriptUrl.protocol === 'http:' || scriptUrl.protocol === 'https:') {
                                        // 检查URL是否以public/pagemonitor.js或public/pagemonitor.min.js结尾
                                        const pathname = scriptUrl.pathname;
                                        if (pathname.endsWith('public/pagemonitor.js') || pathname.endsWith('public/pagemonitor.min.js')) {
                                            // 提取context path（public之前的部分）
                                            const publicIndex = pathname.lastIndexOf('public/');
                                            let contextPath = publicIndex > 0 ? pathname.substring(0, publicIndex) : '';
                                            
                                            // 确保contextPath和/api之间只有一个斜杠
                                            if (contextPath && contextPath.endsWith('/')) {
                                                contextPath = contextPath.slice(0, -1);
                                            }
                                            
                                            detectedApiBaseUrl = `${scriptUrl.protocol}//${scriptUrl.host}${contextPath}/api`;
                                            this.log_debug(`Detected apiBaseUrl from script tag: ${detectedApiBaseUrl}`);
                                            break;
                                        }
                                    }
                                }
                            } catch (e) {
                                this.log_debug('Error parsing script URL (method 1):', e);
                            }
                        }
                    } 
                    
                    // 注意：不再使用当前页面URL作为回退，因为当前页面可能与脚本服务器不同域
                    // 如果无法从脚本标签检测到URL，将使用默认的'/api'路径
                    if (detectedApiBaseUrl === '/api') {
                        this.log_debug('Could not detect script URL, using default /api path');
                    }
                    
                } catch (e) {
                    this.log_error('Error detecting script URL:', e);
                }
                
                this.apiBaseUrl = detectedApiBaseUrl;
                this.log_debug(`Final apiBaseUrl: ${this.apiBaseUrl}`);
            }
            
            this.system = options.system;
            this.apiKey = options.apiKey;
            this.currentUrl = window.location ? window.location.href : '';
            this.pageTitle = document.title || '';
            this.isSpa = options.isSpa || false;
            this.isTrackDownloads = options.isTrackDownloads || true;
            this.maxPendingItems = options.maxPendingItems || 50; // 最大待处理记录数，默认50条
            this.customEvents = options.customEvents || []; // 自定义事件配置
            // 页面停留时长相关属性
            this.activeTimeThreshold = options.activeTimeThreshold || 600000; // 10分钟无活动视为不活跃
            this.pageEntryTime = Date.now(); // 页面进入时间
            this.pageLastActiveTime = Date.now(); // 页面最后活跃时间
            this.isPageVisible = true; // 页面是否可见
            
            // 初始化监听器数组，用于存储事件监听器引用以便清理
            this.customEventListeners = [];
            this.downloadLinkListeners = [];
            
            // 只有当监控启用时才初始化
            if (this.isMonitoringEnabled) {
                // 安全初始化
                this.init();
                
                // 异步重试，避免阻塞构造函数
                setTimeout(() => this.retryPendingTracking(), 100);
            }
        } catch (error) {
            // 捕获构造函数中的所有错误，确保页面不会因为监控脚本失败而崩溃
            this.log_error('PageMonitor constructor error:', error);
        }
    }
    
    // 统一日志输出方法，根据log_level和配置控制是否打印
    log(log_level, ...args) {
        if (this.logLevel && PageMonitor.LOG_LEVELS[this.logLevel] <= PageMonitor.LOG_LEVELS[log_level]) {
            const logMethod = {
                debug: console.log,
                info: console.info,
                warn: console.warn,
                error: console.error
            }[PageMonitor.LOG_LEVELS[log_level]] || console.log;
            logMethod(...args);
        }
    }

    // 日志输出方法，根据logLevel配置控制是否打印
    log_debug(...args) {
        this.log('debug', ...args);
    }

    // 提示输出方法，根据logLevel配置控制是否打印
    log_info(...args) {
        this.log('info', ...args);
    }
    
    // 警告输出方法，根据logLevel配置控制是否打印
    log_warn(...args) {
        this.log('warn', ...args);
    }
    
    // 错误输出方法，根据logLevel配置控制是否打印
    log_error(...args) {
        this.log('error', ...args);
    }

    init() {
        try {
            this.log_debug(`PageMonitor initialized for: ${this.currentUrl}`);
            
            // 页面加载时发送访问数据（异步，不阻塞）
            if (window.requestAnimationFrame) {
                window.requestAnimationFrame(() => this.trackPageView().catch(err => {
                    this.log_error('PageMonitor trackPageView error:', err);
                }));
            } else {
                setTimeout(() => this.trackPageView().catch(err => {
                    this.log_error('PageMonitor trackPageView error:', err);
                }), 0);
            }
            
            if (this.isTrackDownloads && document && document.addEventListener) { 
                // 监控下载链接点击
                try {
                    this.trackDownloadLinks();
                } catch (error) {
                    this.log_error('PageMonitor trackDownloadLinks error:', error);
                }
            }
            
            // 如果配置了自定义事件，初始化事件监控
            if (this.customEvents && this.customEvents.length > 0) {
                try {
                    this.trackCustomEvents(this.customEvents);
                } catch (error) {
                    this.log_error('PageMonitor trackCustomEvents error:', error);
                }
            }
            
            // 只在SPA模式下设置路由监听
            if (this.isSpa && document && document.addEventListener) {
                try {
                    // 监听页面可见性变化（单页应用场景）
                    document.addEventListener('visibilitychange', () => {
                        try {
                            if (document.visibilityState === 'visible') {
                                // 如果URL发生变化，重新获取
                                if (window.location && this.currentUrl !== window.location.href) {
                                    this.currentUrl = window.location.href;
                                    this.pageTitle = document.title || '';
                                    this.log_debug(`PageMonitor detected URL change to: ${this.currentUrl}`);
                                }
                                this.trackPageView().catch(err => {
                                    this.log_error('PageMonitor trackPageView (visibilitychange) error:', err);
                                });
                            }
                        } catch (error) {
                            this.log_error('PageMonitor visibilitychange error:', error);
                        }
                    });
                    this.setupSPAListener();
                } catch (error) {
                    this.log_error('PageMonitor SPA setup error:', error);
                }
            }
            
            // 初始化页面停留时长监控
            this.initPageDurationTracking();
        } catch (error) {
            this.log_error('PageMonitor init error:', error);
        }
    }
    
    // 销毁方法，用于清理资源
    destroy() {
        try {
            // 标记监控已停止
            this.isMonitoringEnabled = false;
            
            // 清理定时器
            if (this.pageActivityTimer) {
                clearInterval(this.pageActivityTimer);
                this.pageActivityTimer = null;
            }
            
            // 清理popstate事件监听器
            if (this.popstateListener) {
                window.removeEventListener('popstate', this.popstateListener);
                this.popstateListener = null;
            }
            
            // 清理各种事件监听器
            // 注意：由于我们没有存储事件处理函数的引用，只能通过removeEventListener移除已知的事件
            // 对于动态添加的事件监听器，需要在添加时存储引用以便清理
            
            // 清理自定义事件监听器
            if (this.customEventListeners) {
                this.customEventListeners.forEach(listener => {
                    if (listener.element && listener.type && listener.callback) {
                        listener.element.removeEventListener(listener.type, listener.callback);
                    }
                });
                this.customEventListeners = [];
            }
            
            // 清理下载链接监听器
            if (this.downloadLinkListeners) {
                this.downloadLinkListeners.forEach(listener => {
                    if (listener.element && listener.callback) {
                        listener.element.removeEventListener('click', listener.callback);
                    }
                });
                this.downloadLinkListeners = [];
            }
            
            this.log_info('PageMonitor destroyed successfully.');
        } catch (error) {
            this.log_error('PageMonitor destroy error:', error);
        }
    }
    

    // ==================== 客户端信息获取 ============== 
    // 获取访问技术信息（包含当前URL）
    getTechnologyInfo() {
        try {
            // 安全获取navigator对象
            const ua = navigator ? navigator.userAgent || '' : '';
            const connection = navigator && navigator.connection ? navigator.connection : {};
            
            // 验证关键信息是否可用
            if (!ua || !this.currentUrl) {
                this.log_error('关键信息缺失，无法生成有效技术信息');
                return null;
            }
            
            const techInfo = {
                userAgent: ua,
                browser: this.detectBrowser(ua),
                os: this.detectOS(ua),
                device: this.detectDevice(ua),
                screen: this.getScreenInfo(),
                language: navigator ? navigator.language || '' : '',
                connectionType: connection.effectiveType || 'unknown',
                timestamp: new Date().toISOString(),
                url: this.currentUrl, // 使用当前URL
                pageTitle: this.pageTitle, // 添加页面标题
                referrer: document ? document.referrer || '' : '',
                pathname: window.location ? window.location.pathname || '' : '',
                hostname: window.location ? window.location.hostname || '' : '',
                userFingerprint: this.generateUserFingerprint() // 添加用户指纹
            };
            
            // 验证数据完整性
            if (techInfo.browser === 'Unknown' && techInfo.os === 'Unknown' && techInfo.device === 'Unknown') {
                this.log_error('无法获取基本客户端信息，浏览器/OS/设备检测全部失败');
                return null;
            }
            
            return techInfo;
        } catch (error) {
            this.log_error('获取技术信息失败:', error);
            // 发生错误时返回null，不发送包含未知值的数据
            return null;
        }
    }

    // 安全获取屏幕信息
    getScreenInfo() {
        try {
            if (typeof screen === 'object') {
                return `${screen.width || 0}x${screen.height || 0}`;
            }
            return 'unknown';
        } catch (error) {
            this.log_error('获取屏幕信息失败:', error);
            return 'unknown';
        }
    }

    // 检测浏览器
    detectBrowser(ua) {
        try {
            if (typeof ua !== 'string') return 'Unknown';
            
            if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
            if (ua.includes('Firefox')) return 'Firefox';
            if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
            if (ua.includes('Edg')) return 'Edge';
            if (ua.includes('MSIE') || ua.includes('Trident/')) return 'IE';
            return 'Other';
        } catch (error) {
            this.log_error('检测浏览器失败:', error);
            return 'Unknown';
        }
    }

    // 检测操作系统
    detectOS(ua) {
        try {
            if (typeof ua !== 'string') return 'Unknown';

            if (ua.includes('Android')) return 'Android';
            if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
            if (ua.includes('Windows')) return 'Windows';
            if (ua.includes('Mac')) return 'MacOS';
            if (ua.includes('Linux')) return 'Linux';

            return 'Unknown';
        } catch (error) {
            this.log_error('检测操作系统失败:', error);
            return 'Unknown';
        }
    }


    // 检测设备类型
    detectDevice(ua) {
        try {
            if (typeof ua !== 'string') return 'Unknown';
            
            if (/(tablet|ipad|playbook|silk)|(android(?!.*mobile))/i.test(ua)) {
                return 'Tablet';
            }
            if (/Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
                return 'Mobile';
            }
            return 'Desktop';
        } catch (error) {
            this.log_error('检测设备类型失败:', error);
            return 'Unknown';
        }
    }
    
    // 生成用户指纹
    // 优化的用户指纹生成方法
    // 收集稳定、精确且能区分不同用户的客户端特征
    generateUserFingerprint() {
        try {
            const components = [];
            
            // ================ 稳定的浏览器和系统信息 ================
            if (navigator) {
                // 核心浏览器标识 - 非常稳定
                components.push(navigator.userAgent || 'unknown_ua');
                components.push(navigator.platform || 'unknown_platform');
                components.push(navigator.vendor || 'unknown_vendor');
                components.push(navigator.vendorSub || 'unknown_vendor_sub');
                components.push(navigator.product || 'unknown_product');
                components.push(navigator.productSub || 'unknown_product_sub');
                
                // 语言设置 - 稳定且有区分度
                components.push(JSON.stringify(navigator.languages || [navigator.language || 'unknown_lang']));
                
                // 硬件相关信息 - 稳定
                try {
                    components.push(navigator.hardwareConcurrency?.toString() || 'unknown_hw');
                } catch (e) {
                    components.push('error_hw');
                }
                try {
                    components.push(navigator.maxTouchPoints?.toString() || '0_touch');
                } catch (e) {
                    components.push('error_touch');
                }
            }
            
            // ================ 显示相关信息 ================
            try {
                if (typeof screen === 'object') {
                    // 屏幕尺寸和深度 - 非常稳定
                    components.push(screen.width?.toString() || '0');
                    components.push(screen.height?.toString() || '0');
                    components.push(screen.colorDepth?.toString() || '0');
                    components.push(screen.pixelDepth?.toString() || '0');
                }
            } catch (e) {
                components.push('screen_error');
            }
            
            try {
                // 设备像素比 - 稳定
                components.push(window.devicePixelRatio?.toString() || '1');
            } catch (e) {
                components.push('dpr_error');
            }
            
            try {
                // 视口尺寸 - 相对稳定
                components.push(window.innerWidth?.toString() || '0');
                components.push(window.innerHeight?.toString() || '0');
            } catch (e) {
                components.push('viewport_error');
            }
            
            // ================ 时区和时间信息 ================
            try {
                // 时区偏移 - 非常稳定
                components.push((new Date()).getTimezoneOffset().toString());
            } catch (e) {
                components.push('tz_error');
            }
            
            try {
                // 时区名称 - 稳定
                components.push(Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown_tz');
            } catch (e) {
                components.push('intl_tz_error');
            }
            
            // ================ 浏览器功能和API支持 ================
            // 存储API支持 - 稳定
            try {
                components.push(Boolean(localStorage).toString());
            } catch (e) {
                components.push('localStorage_disabled');
            }
            try {
                components.push(Boolean(sessionStorage).toString());
            } catch (e) {
                components.push('sessionStorage_disabled');
            }
            try {
                components.push(Boolean(indexedDB).toString());
            } catch (e) {
                components.push('indexedDB_disabled');
            }
            try {
                components.push(Boolean(navigator.storage).toString());
            } catch (e) {
                components.push('storage_api_disabled');
            }
            
            // 其他稳定API支持
            try {
                components.push(Boolean(navigator.serviceWorker).toString());
            } catch (e) {
                components.push('service_worker_disabled');
            }
            try {
                components.push(Boolean(navigator.permissions).toString());
            } catch (e) {
                components.push('permissions_api_disabled');
            }
            try {
                components.push(Boolean(navigator.geolocation).toString());
            } catch (e) {
                components.push('geolocation_disabled');
            }
            
            // ================ 网络信息 ================
            try {
                if (navigator.connection) {
                    // 连接类型 - 相对稳定
                    components.push(navigator.connection.effectiveType || 'unknown_conn');
                    components.push(navigator.connection.type || 'unknown_conn_type');
                }
            } catch (e) {
                components.push('conn_error');
            }
            
            // ================ 轻量级Canvas指纹 ================
            // 简化的Canvas渲染，减少性能消耗但保持区分度
            try {
                if (typeof document === 'object' && typeof document.createElement === 'function') {
                    const canvas = document.createElement('canvas');
                    canvas.width = 120;
                    canvas.height = 40;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        // 简单但独特的渲染模式
                        ctx.fillStyle = '#f0f0f0';
                        ctx.fillRect(0, 0, 120, 40);
                        ctx.fillStyle = '#2c3e50';
                        ctx.font = '14px Arial';
                        ctx.textBaseline = 'top';
                        ctx.fillText('BrowserFP', 10, 10);
                        
                        // 添加一些几何图形增加独特性
                        ctx.beginPath();
                        ctx.strokeStyle = '#3498db';
                        ctx.lineWidth = 2;
                        ctx.arc(80, 25, 10, 0, Math.PI * 2);
                        ctx.stroke();
                        
                        components.push(canvas.toDataURL());
                    }
                }
            } catch (e) {
                components.push('canvas_error');
            }
            
            // ================ 优化的字体检测 ================
            // 测试更多常用字体，使用更可靠的检测方法
            try {
                if (typeof document === 'object' && typeof document.createElement === 'function' && document.body) {
                    const testElement = document.createElement('div');
                    testElement.style.position = 'absolute';
                    testElement.style.left = '-9999px';
                    testElement.style.fontSize = '24px';
                    testElement.style.width = 'auto';
                    testElement.style.height = 'auto';
                    testElement.style.lineHeight = '1';
                    testElement.style.visibility = 'hidden';
                    testElement.textContent = 'The quick brown fox jumps over the lazy dog';
                    
                    const fontDetectTimeout = setTimeout(() => {
                        try {
                            if (document.body.contains(testElement)) {
                                document.body.removeChild(testElement);
                            }
                        } catch (cleanupError) {
                            // 忽略清理错误
                        }
                    }, 1500);
                    
                    try {
                        document.body.appendChild(testElement);
                        
                        // 基准字体宽度
                        testElement.style.fontFamily = 'monospace';
                        
                        // 扩展的常用字体列表
                        const testFonts = [
                            'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Georgia',
                            'Verdana', 'Tahoma', 'Impact', 'Comic Sans MS', 'Trebuchet MS',
                            'Arial Black', 'Bookman Old Style', 'Century Gothic', 'Garamond',
                            'Lucida Console', 'Lucida Sans Unicode', 'Palatino Linotype'
                        ];
                        
                        const fontMetrics = [];
                        for (const font of testFonts) {
                            try {
                                testElement.style.fontFamily = `'${font}', monospace`;
                                const width = testElement.offsetWidth;
                                fontMetrics.push(`${font}:${width}`);
                            } catch (singleFontError) {
                                fontMetrics.push(`${font}:error`);
                            }
                        }
                        
                        components.push(fontMetrics.join(','));
                        
                        clearTimeout(fontDetectTimeout);
                        document.body.removeChild(testElement);
                    } catch (fontTestError) {
                        components.push('font_test_error');
                        clearTimeout(fontDetectTimeout);
                        if (document.body.contains(testElement)) {
                            document.body.removeChild(testElement);
                        }
                    }
                }
            } catch (e) {
                components.push('font_error');
            }
            
            // ================ 生成指纹哈希 ================
            // 使用增强的哈希算法替代简单的hashCode
            return this.generateStrongHash(components.join('|'));
        } catch (error) {
            this.log_error('生成用户指纹失败:', error);
            // 降级方案：使用随机ID + localStorage持久化
            try {
                if (typeof localStorage !== 'undefined') {
                    let fallbackId = localStorage.getItem('pageMonitor_fallback_id');
                    if (!fallbackId) {
                        fallbackId = 'fallback_' + this.generateStrongHash(Math.random().toString() + Date.now()) + '_' + Date.now();
                        try {
                            localStorage.setItem('pageMonitor_fallback_id', fallbackId);
                        } catch (storageError) {
                            this.log_error('存储fallback ID失败:', storageError);
                            // 最终降级：仅使用随机ID，不持久化
                            fallbackId = 'temp_' + this.generateStrongHash(Math.random().toString());
                        }
                    }
                    return fallbackId;
                }
            } catch (fallbackError) {
                this.log_error('生成fallback ID失败:', fallbackError);
            }
            
            // 终极降级：返回基于时间戳的ID
            return 'ultimate_' + Date.now() + '_' + this.generateStrongHash(Math.random().toString());
        }
    }
    
    // 增强的哈希生成方法（基于MurmurHash3算法变体，同步、高性能、低碰撞率）
    generateStrongHash(input) {
        if (typeof input !== 'string' || input.length === 0) {
            return '00000000';
        }
        
        // 实现改进的MurmurHash3算法（32位变体）
        let hash = 0;
        let c1 = 0xcc9e2d51;
        let c2 = 0x1b873593;
        let r1 = 15;
        let r2 = 13;
        let m = 5;
        let n = 0xe6546b64;
        
        let i = 0;
        while (i < input.length) {
            // 处理4字节块
            let k = 0;
            for (let j = 0; j < 4 && i < input.length; j++, i++) {
                k |= input.charCodeAt(i) << (j * 8);
            }
            
            // 应用MurmurHash3算法
            k = Math.imul(k, c1);
            k = (k << r1) | (k >>> (32 - r1)); // 循环左移
            k = Math.imul(k, c2);
            
            hash ^= k;
            hash = (hash << r2) | (hash >>> (32 - r2));
            hash = Math.imul(hash, m) + n;
        }
        
        // 处理剩余字节
        hash ^= input.length;
        
        // 最终混合
        hash ^= hash >>> 16;
        hash = Math.imul(hash, 0x85ebca6b);
        hash ^= hash >>> 13;
        hash = Math.imul(hash, 0xc2b2ae35);
        hash ^= hash >>> 16;
        
        // 转换为无符号32位整数并转换为十六进制
        let unsignedHash = hash >>> 0;
        let hex = unsignedHash.toString(16);
        return hex.padStart(8, '0');
    }

    // ================== 跟踪页面访问数据 ==================
    async trackPageView() {
        try {
            const techInfo = this.getTechnologyInfo();
            
            // 检查techInfo是否为空，如果为空则不发送数据
            if (!techInfo) {
                this.log_warn('Skipping page view tracking: No valid technology information available');
                return false;
            }
            
            this.log_debug(`Tracking page view: ${techInfo.url}`);
            const success = await this.sendToServer('/track/pageview', "pageview", techInfo);
            
            if (success) {
                this.log_debug(`Page view tracked successfully for: ${techInfo.url}`);
            } else {
                this.log_warn('Failed to track page view, server returned error');
            }
            
            return success;
        } catch (error) {
            this.log_error('Page view tracking error:', error);
            return false;
        }
    }


    // ================== 跟踪下载点击数据 ==================
    trackDownloadLinks() {
        if (!document || !document.addEventListener) return;
        
        // Helper method to check if a URL is a download URL
        const isDownloadUrl = (url) => {
            if (!url) return false;
            const urlLower = url.toLowerCase();
            return /\.(pdf|zip|exe|tar\.gz|tar|gz|rar|7z|dmg|pkg|deb|rpm|apk|jar|war|msi|bin|sh|doc|docx|xls|xlsx|ppt|pptx|txt|csv|mp4|mp3|avi|mov|wmv|flv|wav|png|jpg|jpeg|gif|bmp|psd|ai|eps|sketch|fig|xd|iso|img|dll|sys|drv|ocx|cab|zipx)$/i.test(urlLower) ||
                   urlLower.includes('/download/') ||
                   urlLower.includes('/downloads/');
        };
        
        // Helper method to extract URL from button's onclick attribute
        const extractUrlFromOnclick = (onclick) => {
            if (!onclick) return null;
            const onclickStr = onclick.toString();
            // Match window.open('url') or window.location.href = 'url'
            const openMatch = onclickStr.match(/window\.open\(['"]([^'"]+)['"]/i);
            const locationMatch = onclickStr.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/i);
            const locationAssignMatch = onclickStr.match(/window\.location\.assign\(['"]([^'"]+)['"]/i);
            
            return openMatch?.[1] || locationMatch?.[1] || locationAssignMatch?.[1] || null;
        };
        
        const downloadLinkListener = (e) => {
            try {
                let originalHref = null;
                let element = null;
                let fileName = null;
                let linkText = '';
                let isDownload = false;
                
                // Check for anchor links first
                const link = e.target ? e.target.closest('a') : null;
                if (link && link.href) {
                    originalHref = link.href;
                    element = link;
                    linkText = link.textContent ? link.textContent.trim() : '';
                    fileName = link.download || this.getFileNameFromUrl(originalHref);
                    
                    const hrefLower = originalHref.toLowerCase();
                    isDownload = link.hasAttribute('download') || 
                                isDownloadUrl(originalHref) ||
                                (linkText.toLowerCase().includes('download')) ||
                                (link.getAttribute('class') && link.getAttribute('class')?.toLowerCase().includes('download'));
                }
                // Check for buttons
                else {
                    const button = e.target ? e.target.closest('button, input[type="button"], input[type="submit"]') : null;
                    if (button) {
                        const isDataDownloadButton = button.hasAttribute('data-is-download') && 
                                                   button.getAttribute('data-is-download') !== 'false';
                        if (isDataDownloadButton) {
                            linkText = button.textContent ? button.textContent.trim() : 
                                    button.getAttribute('value') || '';
                            
                            // Try to extract URL from data attributes
                            originalHref = button.getAttribute('data-download-url') ||
                                        button.getAttribute('data-href') ||
                                        button.getAttribute('href') ||
                                        button.getAttribute('data-url');
                            
                            // Try to extract URL from onclick attribute if no data attributes
                            if (!originalHref) {
                                originalHref = extractUrlFromOnclick(button.getAttribute('onclick'));
                                
                                // If still no URL, try to extract any URL patterns from onclick
                                if (!originalHref) {
                                    const onclickAttr = button.getAttribute('onclick');
                                    if (onclickAttr) {
                                        const urlPattern = /https?:\/\/[^\s'"]+|\/[^\s'"]+/g;
                                        const matches = onclickAttr.match(urlPattern);
                                        if (matches && matches.length > 0) {
                                            originalHref = matches[0];
                                        }
                                    }
                                }
                            }
                            
                            // Check if URL is a download URL
                            const hasDownloadUrl = originalHref && isDownloadUrl(originalHref);
                            
                            if (isDataDownloadButton || hasDownloadUrl) {
                                element = button;
                                isDownload = true;
                                
                                // Set fileName based on available information, with fallbacks
                                fileName = button.getAttribute('data-filename') || 
                                        (originalHref ? this.getFileNameFromUrl(originalHref) : linkText) ||
                                        button.getAttribute('data-download-name') ||
                                        'download_from_button';
                            }
                        }
                    }
                }
                
                // 只有当元素是下载元素时才进行跟踪和处理
                // 对于按钮，即使没有直接URL但明显是下载按钮也应该跟踪
                if (element && isDownload) {
                    // 获取技术信息
                    const techInfo = this.getTechnologyInfo();
                        
                    // 如果技术信息有效，进行跟踪
                    if (techInfo) {
                        try {
                            const downloadInfo = {
                                ...techInfo,
                                downloadUrl: originalHref,
                                fileName: fileName,
                                linkText: linkText,
                                sourcePage: this.currentUrl, // 记录下载来源页面
                                elementType: element.tagName.toLowerCase(), // 记录是链接还是按钮
                            };
                               
                            this.log_debug(`Tracking download: ${downloadInfo.fileName} from ${downloadInfo.sourcePage}`);
                               
                            // 只有当我们能够从按钮中提取到URL时，才阻止默认行为并手动触发下载
                            const hasValidUrl = originalHref && (typeof originalHref === 'string') && originalHref.length > 0;
                            
                            if (hasValidUrl) {
                                // 阻止默认行为
                                e.preventDefault();
                            }
                               
                            // 发送跟踪请求（使用setTimeout确保不会阻塞UI）
                            setTimeout(() => {
                                this.sendToServer('/track/download', "download", downloadInfo).then(success => {
                                    if (success) {
                                        // 跟踪成功后实际下载
                                        this.log_debug(`Download tracking successful, proceeding with download: ${originalHref}`);
                                    } else {
                                        // 即使跟踪失败也允许下载，但记录警告
                                        this.log_warn('Download tracking failed, but allowing download to proceed');
                                    }
                                       
                                    // 只有当我们有URL时才手动执行下载
                                    if (hasValidUrl) {
                                        try {
                                            // 使用window.open确保在所有浏览器中都能正常下载
                                            const downloadWindow = window.open(originalHref, '_self');
                                            // 如果window.open失败，尝试其他方式
                                            if (!downloadWindow) {
                                                window.location.href = originalHref;
                                            }
                                        } catch (downloadError) {
                                            this.log_error('Download execution error:', downloadError);
                                            // 最后的降级方案：创建临时链接并点击
                                            try {
                                                const tempLink = document.createElement('a');
                                                tempLink.href = originalHref;
                                                tempLink.target = '_self';
                                                if (element.hasAttribute('download')) {
                                                    tempLink.download = element.getAttribute('download');
                                                }
                                                tempLink.style.display = 'none';
                                                document.body.appendChild(tempLink);
                                                tempLink.click();
                                                document.body.removeChild(tempLink);
                                            } catch (finalError) {
                                                this.log_error('Final download fallback error:', finalError);
                                            }
                                        }
                                    }
                                }).catch(trackingError => {
                                    this.log_error('Download tracking promise error:', trackingError);
                                    // Promise出错时，如果有URL则尝试下载
                                    if (hasValidUrl) {
                                        try {
                                            window.location.href = originalHref;
                                        } catch (fallbackError) {
                                            this.log_error('Fallback download error:', fallbackError);
                                        }
                                    }
                                });
                            }, 0);
                        } catch (infoError) {
                            this.log_error('Download info generation error:', infoError);
                            // 生成信息失败时，如果有URL则直接下载
                            if (originalHref) {
                                window.location.href = originalHref;
                            }
                        }
                    } else {
                        // 如果技术信息无效，记录警告但不阻止下载
                        this.log_warn('Skipping download tracking: No valid technology information available');
                        // 不阻止默认行为，直接执行下载
                    }
                }
            } catch (clickError) {
                this.log_error('Download click handler error:', clickError);
                // 捕获所有错误，确保不会影响页面其他功能
            }
        };
    
    // 添加事件监听器
    document.addEventListener('click', downloadLinkListener);
    
    // 存储监听器引用，以便后续清理
    this.downloadLinkListeners.push({
        element: document,
        callback: downloadLinkListener
    });
}

    // 从URL中提取文件名
    getFileNameFromUrl(url) {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            return pathname.substring(pathname.lastIndexOf('/') + 1) || 'unknown';
        } catch {
            return 'unknown';
        }
    }

    
    // ================== 发送数据 ==================

    async sendToServer(endpoint, type, data) {
        try {
            // 检查数据是否存在
            if (!data) {
                this.log_warn('No data provided to sendToServer');
                return false;
            }
            
            // 检查数据中是否包含关键信息
            if (!data.timestamp || !data.url || !data.userAgent) {
                this.log_warn('Missing critical information in data, skipping sendToServer', {
                    missingTimestamp: !data.timestamp,
                    missingUrl: !data.url,
                    missingUserAgent: !data.userAgent
                });
                return false;
            }
            
//            // 检查数据中是否有"unknown"值
//            const hasUnknownValues = Object.values(data).some(value =>
//                typeof value === 'string' && value.toLowerCase() === 'unknown'
//            );
//
//            if (hasUnknownValues) {
//                this.log_warn('Data contains "unknown" values, skipping sendToServer');
//                return false;
//            }
            // 安全构建URL，确保apiBaseUrl末尾和endpoint开头只有一个斜杠
            let apiBaseUrl = this.apiBaseUrl;
            let endpointPath = endpoint;
            
            // 移除apiBaseUrl末尾的斜杠
            if (apiBaseUrl.endsWith('/')) {
                apiBaseUrl = apiBaseUrl.slice(0, -1);
            }
            
            // 确保endpointPath以斜杠开头
            if (!endpointPath.startsWith('/')) {
                endpointPath = `/${endpointPath}`;
            }
            
            const url = `${apiBaseUrl}${endpointPath}`;
            return this.doSend(url, type, data);
        } catch (error) {
            // 捕获所有错误，包括网络错误和超时
            this.log_error('发送失败:', error);
            // 使用setTimeout确保fallback操作不会阻塞主线程
            setTimeout(() => {
                try {
                    this.fallbackTracking(type, data);
                } catch (fallbackError) {
                    this.log_error('Fallback tracking failed:', fallbackError);
                }
            }, 0);
            return false;
        }
    }

    async doSend(url, type, data) {
        // 规则1：页面卸载事件强制使用sendBeacon
        const isUnloadEvent = type === 'page_unload' || type === 'beforeunload';
        
        if (isUnloadEvent) {
            return this.trySendBeacon(url, data);
        }
        
        // 规则2：普通事件，优先尝试sendBeacon（不阻塞）
        // sendBeacon在后台发送，不影响用户体验
        const beaconSuccess = this.trySendBeacon(url, data);
        if (beaconSuccess) return true;
        
        // 规则3：sendBeacon失败，使用fetch（带超时）
        return await this.fetchWithTimeout(url, data);
    }

    trySendBeacon(url, data) {
        // 检查sendBeacon是否可用
        if (typeof navigator.sendBeacon !== 'function') {
            this.log_debug(`sendBeacon不可用`);
            return false;
        }
        const dataWithApiKeyAndSystem = {
            ...data,
            system: this.system,
            apiKey: this.apiKey
        };
        let body;
        try {
            body = JSON.stringify(dataWithApiKeyAndSystem);
        } catch (jsonError) {
            this.log_error('JSON序列化失败:', jsonError);
            return false;
        }
        const blob = new Blob([body], {type: 'application/json'});
        try {
            return  navigator.sendBeacon(url, blob);
        } catch (beaconError) {
            this.log_error(`sendBeacon异常:`, beaconError);
            return false;
        }
    }

    async fetchWithTimeout(url, data) {
        if (typeof fetch !== 'function') {
            this.log_warn('Fetch API not available, using fallback tracking');
            throw new Error('Fetch API not available');
        }
        // 添加system到数据中
        const dataWithSystem = {
            ...data,
            system: this.system
        };
        // 安全序列化数据
        let body;
        try {
            body = JSON.stringify(dataWithSystem);
        } catch (jsonError) {
            this.log_error('JSON序列化失败:', jsonError);
            return false;
        }
        const headers = {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey
        };
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 固定5秒超时
            
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: body,
                signal: controller.signal,
                // 不设置优先级，让浏览器自动管理
                // priority: 'low'
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return true;
        } catch (error) {
            if (error.name === 'AbortError') {
                this.log_warn('fetch请求超时 (5s)');
            } else {
                this.log_error('fetch请求失败:', error);
            }
            throw error;
        }
    }


    // =================== 降级处理 =================
    // 降级跟踪方案
    fallbackTracking(type, data) {
        try {
            this.log_warn(`Using fallback tracking for ${type}`);
            
            // 检查localStorage是否可用
            if (typeof localStorage === 'undefined') {
                this.log_warn('localStorage not available, cannot store fallback tracking data');
                return;
            }
            
            // 使用localStorage暂存跟踪数据，添加安全检查
            const key = `pending_tracking_${type}`;
            let pending = [];
            
            try {
                // 安全获取现有数据
                const stored = localStorage.getItem(key);
                if (stored) {
                    pending = JSON.parse(stored);
                }
                if (!Array.isArray(pending)) {
                    pending = [];
                }
            } catch (parseError) {
                this.log_error('解析存储数据失败:', parseError);
                pending = [];
            }
            
            try {
                // 添加新数据
                pending.push({...data, timestamp: new Date().toISOString()});
                
                // 只保留最近配置的记录数
                const trimmedPending = pending.slice(-this.maxPendingItems);
                
                // 安全存储数据
                localStorage.setItem(key, JSON.stringify(trimmedPending));
            } catch (storageError) {
                this.log_error('存储数据失败:', storageError);
                // 可能是localStorage已满，尝试清除部分数据
                try {
                    // 清除最旧的一半数据
                    const halfMax = Math.floor(this.maxPendingItems / 2);
                    const cleanedPending = pending.slice(-halfMax);
                    localStorage.setItem(key, JSON.stringify(cleanedPending));
                    // 再次尝试添加新数据
                    cleanedPending.push({...data, timestamp: new Date().toISOString()});
                    localStorage.setItem(key, JSON.stringify(cleanedPending));
                } catch (cleanError) {
                    this.log_error('清理存储数据失败:', cleanError);
                    // 最终降级：不存储数据，仅记录日志
                }
            }
            
            // 尝试稍后重新发送，使用随机延迟避免服务器压力
            const delay = 30000 + Math.random() * 30000; // 30-60秒随机延迟
            setTimeout(() => {
                try {
                    this.retryPendingTracking();
                } catch (retryError) {
                    this.log_error('重试跟踪失败:', retryError);
                }
            }, delay);
        } catch (error) {
            // 捕获所有错误，确保不会影响主页面
            this.log_error('Fallback tracking unexpected error:', error);
        }
    }

    // 重试挂起的跟踪请求
    async retryPendingTracking() {
        try {
            // 检查localStorage是否可用
            if (typeof localStorage === 'undefined') {
                this.log_warn('localStorage not available, cannot retry pending tracking');
                return;
            }
            
            const types = ['pageview', 'download', 'event'];
            
            for (const type of types) {
                try {
                    const key = `pending_tracking_${type}`;
                    let pending = [];
                    
                    // 安全获取待处理数据
                    try {
                        const stored = localStorage.getItem(key);
                        if (stored) {
                            pending = JSON.parse(stored);
                        }
                        if (!Array.isArray(pending)) {
                            pending = [];
                            // 清除无效数据
                            localStorage.setItem(key, JSON.stringify(pending));
                        }
                    } catch (parseError) {
                        this.log_error(`解析${type}待处理数据失败:`, parseError);
                        // 清除无效数据
                        localStorage.setItem(key, JSON.stringify([]));
                        continue;
                    }
                    
                    if (pending.length === 0) continue;
                    
                    this.log_debug(`Retrying ${pending.length} pending ${type} tracking requests`);
                    
                    const successItems = [];
                    
                    // 批量处理，避免一次性发送过多请求
                    const batchSize = 5;
                    for (let i = 0; i < pending.length; i += batchSize) {
                        const batch = pending.slice(i, i + batchSize);
                        
                        // 使用Promise.allSettled确保所有请求都完成，不会因为某个请求失败而中断
                        const batchResults = await Promise.allSettled(
                            batch.map(item => this.sendToServer(`/track/${type}`, type, item))
                        );
                        
                        // 收集成功的项目
                        batchResults.forEach((result, index) => {
                            if (result.status === 'fulfilled' && result.value) {
                                successItems.push(batch[index]);
                            }
                        });
                        
                        // 批次之间添加延迟，避免服务器压力
                        if (i + batchSize < pending.length) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                    
                    // 移除已成功发送的项目
                    if (successItems.length > 0) {
                        try {
                            const remaining = pending.filter(item => 
                                !successItems.some(success => success.timestamp === item.timestamp)
                            );
                            localStorage.setItem(key, JSON.stringify(remaining));
                            this.log_debug(`Successfully retried ${successItems.length} ${type} requests`);
                        } catch (storageError) {
                            this.log_error(`更新${type}待处理数据失败:`, storageError);
                        }
                    }
                } catch (typeError) {
                    this.log_error(`处理${type}类型跟踪重试失败:`, typeError);
                    // 继续处理下一种类型，不中断整个重试过程
                    continue;
                }
            }
        } catch (error) {
            // 捕获所有错误，确保不会影响主页面
            this.log_error('重试跟踪请求失败:', error);
        }
    }


    // ========== 监控SPA  =============
    // 设置单页应用路由监听
    setupSPAListener() {
        try {
            // 检查history和window对象是否可用
            if (typeof history !== 'object' || typeof window !== 'object') {
                this.log_warn('History API or window not available, SPA tracking disabled');
                return;
            }
            
            // 安全保存原始方法
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;

            // 重写pushState方法
            history.pushState = (...args) => {
                try {
                    originalPushState.apply(history, args);
                    // 使用setTimeout确保路由变化完成后再处理
                    setTimeout(() => this.handleRouteChange(), 0);
                } catch (error) {
                    this.log_error('PushState error:', error);
                    // 即使出错也要调用原始方法
                    try {
                        originalPushState.apply(history, args);
                    } catch (originalError) {
                        this.log_error('Original pushState also failed:', originalError);
                    }
                }
            };

            // 重写replaceState方法
            history.replaceState = (...args) => {
                try {
                    originalReplaceState.apply(history, args);
                    // 使用setTimeout确保路由变化完成后再处理
                    setTimeout(() => this.handleRouteChange(), 0);
                } catch (error) {
                    this.log_error('ReplaceState error:', error);
                    // 即使出错也要调用原始方法
                    try {
                        originalReplaceState.apply(history, args);
                    } catch (originalError) {
                        this.log_error('Original replaceState also failed:', originalError);
                    }
                }
            };

            // 监听popstate事件（浏览器前进后退）
            this.popstateListener = () => {
                try {
                    this.handleRouteChange();
                } catch (error) {
                    this.log_error('Popstate error:', error);
                }
            };
            window.addEventListener('popstate', this.popstateListener);
        } catch (error) {
            this.log_error('Setup SPA listener error:', error);
        }
    }

    // ========== 页面停留时长监控  =============
    // 初始化页面停留时长监控
    initPageDurationTracking() {
        try {
            if (typeof window !== 'object' || typeof document !== 'object') {
                this.log_warn('Window or document not available, page duration tracking disabled');
                return;
            }
            
            // 监听页面可见性变化
            document.addEventListener('visibilitychange', () => {
                try {
                    const wasVisible = this.isPageVisible;
                    this.isPageVisible = document.visibilityState === 'visible';
                    
                    if (this.isPageVisible) {
                        // 页面从不可见变为可见，重置页面进入时间
                        if (!wasVisible) {
                            this.pageEntryTime = Date.now();
                            this.log_debug('Page became visible, resetting entry time');
                        }
                        this.updatePageActivity();
                    } else {
                        // 页面变为不可见，发送当前停留时长
                        this.trackPageDuration();
                    }
                } catch (error) {
                    this.log_error('Visibilitychange event error:', error);
                }
            });
            
            // 监听页面离开事件
            window.addEventListener('beforeunload', () => {
                try {
                    // 发送页面停留时长
                    this.trackPageDuration();
                } catch (error) {
                    this.log_error('Beforeunload event error:', error);
                }
            });
            
            // 监听用户交互事件，更新活跃时间
            const activityEvents = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
            activityEvents.forEach(eventType => {
                window.addEventListener(eventType, () => {
                    try {
                        this.updatePageActivity();
                    } catch (error) {
                        this.log_error(`${eventType} event error:`, error);
                    }
                }, { passive: true });
            });
            
            // 设置定时器，定期检查页面活跃状态
            this.pageActivityTimer = setInterval(() => {
                try {
                    this.checkPageActivity();
                } catch (error) {
                    this.log_error('Activity check interval error:', error);
                }
            }, this.activeTimeThreshold);
            
            this.log_debug('Page duration tracking initialized');
        } catch (error) {
            this.log_error('Init page duration tracking error:', error);
        }
    }
    
    // 更新页面活跃状态
    updatePageActivity() {
        this.pageLastActiveTime = Date.now();
    }
    
    // 检查页面活跃状态
    checkPageActivity() {
        if (this.isPageVisible && Date.now() - this.pageLastActiveTime > this.activeTimeThreshold * 2) {
            // 超过阈值时间未活跃，发送当前停留时长
            this.trackPageDuration();
        }
    }
    
    // 发送页面停留时长数据
    trackPageDuration() {
        try {
            const currentTime = Date.now();
            const duration = currentTime - this.pageEntryTime;
            
            // 只发送有意义的时长（至少1秒）
            if (duration < 1000) {
                return;
            }
            
            // 获取技术信息
            const techInfo = this.getTechnologyInfo();
            if (!techInfo) {
                this.log_warn('Skipping page duration tracking: No valid technology information available');
                return;
            }
            
            const durationData = {
                ...techInfo,
                duration: Math.round(duration / 1000), // 转换为秒
                entryTime: new Date(this.pageEntryTime).toISOString(),
                exitTime: new Date(currentTime).toISOString(),
                isPageVisible: this.isPageVisible
            };
            
            this.log_debug(`Tracking page duration: ${durationData.duration}s for ${durationData.url}`);
            
            // 异步发送数据，不阻塞主线程
            setTimeout(() => {
                this.sendToServer('/track/duration', 'duration', durationData).catch(err => {
                    this.log_error('Send page duration error:', err);
                });
            }, 0);
            
            // 重置页面进入时间和活跃时间（如果页面仍然可见）
            if (this.isPageVisible) {
                this.pageEntryTime = currentTime;
                this.pageLastActiveTime = currentTime;
                this.log_debug('Resetting entry and active times for continued visible but inactive page');
            }
        } catch (error) {
            this.log_error('Track page duration error:', error);
        }
    }
    
    // 处理路由变化
    handleRouteChange() {
        try {
            // 检查window和document对象是否可用
            if (typeof window !== 'object' || typeof document !== 'object') {
                this.log_warn('Window or document not available, cannot handle route change');
                return;
            }
            
            const newUrl = window.location ? window.location.href : '';
            const newTitle = document.title || '';
            
            // 只有当URL确实发生变化时才跟踪
            if (newUrl && newUrl !== this.currentUrl) {
                this.log_debug(`PageMonitor detected route change from ${this.currentUrl} to ${newUrl}`);
                
                // 在路由变化前发送当前页面停留时长
                this.trackPageDuration();
                
                this.currentUrl = newUrl;
                this.pageTitle = newTitle;
                
                // 重置页面进入时间
                this.pageEntryTime = Date.now();
                this.pageLastActiveTime = Date.now();
                
                // 延迟跟踪以确保新页面已加载完成
                setTimeout(() => {
                    try {
                        this.trackPageView();
                    } catch (error) {
                        this.log_error('Track page view on route change error:', error);
                    }
                }, 100);
            }
        } catch (error) {
            this.log_error('Handle route change error:', error);
        }
    }

    // =================== 自定义事件监控 ===================
    trackCustomEvents(selectors) {
        try {
            // 先检查技术信息是否可用
            const techInfo = this.getTechnologyInfo();
            if (!techInfo) {
                this.log_warn('Skipping custom events setup: No valid technology information available');
                return;
            }
            
            // 检查document和selectors是否可用
            if (typeof document !== 'object' || typeof document.addEventListener !== 'function' || !Array.isArray(selectors)) {
                this.log_warn('Document or selectors not available, custom event tracking disabled');
                return;
            }
            
            selectors.forEach((selectorConfig, index) => {
                try {
                    const { selector, eventType = 'click', properties = {} } =
                        typeof selectorConfig === 'string'
                            ? { selector: selectorConfig }
                            : selectorConfig;
                    
                    // 验证必需参数
                    if (!selector || typeof eventType !== 'string') {
                        this.log_warn(`Invalid selector configuration at index ${index}`);
                        return;
                    }
                    
                    // 创建事件监听器函数
                    const customEventListener = (e) => {
                        try {
                            if (e && e.target && (e.target.matches?.(selector) || e.target.closest?.(selector))) {
                                this.trackCustomEvent(e.target, selector, eventType, properties);
                            }
                        } catch (eventError) {
                            this.log_error('Custom event listener error:', eventError);
                        }
                    };
                    
                    // 添加事件监听器
                    document.addEventListener(eventType, customEventListener);
                    
                    // 存储监听器引用，以便后续清理
                    this.customEventListeners.push({
                        element: document,
                        type: eventType,
                        callback: customEventListener
                    });
                } catch (configError) {
                    this.log_error(`Error processing selector config at index ${index}:`, configError);
                    // 继续处理下一个选择器
                }
            });
        } catch (error) {
            this.log_error('Track custom events error:', error);
        }
    }

    trackCustomEvent(element, selector, eventType, customProperties) {
        try {
            // 获取技术信息并检查是否有效
            const techInfo = this.getTechnologyInfo();
            
            // 如果技术信息无效，直接返回，不发送数据
            if (!techInfo) {
                this.log_warn('Skipping custom event tracking: No valid technology information available');
                return;
            }
            
            // 安全构建事件信息
            const eventInfo = {
                ...techInfo,
                eventType: eventType || 'unknown',
                eventCategory: customProperties?.category || 'engagement',
                eventAction: customProperties?.action || 'click',
                eventLabel: customProperties?.label || selector,
                selector: selector,
                elementText: element?.textContent ? element.textContent.trim().substring(0, 100) : '',
                customProperties: customProperties || {},
                timestamp: new Date().toISOString()
            };

            this.log_debug('Custom Event:', eventInfo);
            
            // 异步发送，不阻塞主线程
            setTimeout(() => {
                this.sendToServer('/track/event', 'event', eventInfo).catch(err => {
                    this.log_error('Send custom event error:', err);
                });
            }, 0);
        } catch (error) {
            this.log_error('Track custom event error:', error);
        }
    }


    // ======================= custom methods =======================

    // 手动更新当前URL（供外部调用）
    updateCurrentUrl(url = null, title = null) {
        const newUrl = url || window.location.href;
        const newTitle = title || document.title;
        
        // 只有当URL确实发生变化时才更新和跟踪
        if (newUrl !== this.currentUrl) {
            this.currentUrl = newUrl;
            this.pageTitle = newTitle;
            this.log_debug(`PageMonitor URL updated to: ${this.currentUrl}`);
            this.trackPageView();
        }
    }    

    // 获取当前监控状态
    getStatus() {
        return {
            currentUrl: this.currentUrl,
            pageTitle: this.pageTitle,
            apiBaseUrl: this.apiBaseUrl,
            pendingTrackings: {
                pageview: JSON.parse(localStorage.getItem('pending_tracking_pageview') || '[]').length,
                download: JSON.parse(localStorage.getItem('pending_tracking_download') || '[]').length,
                event: JSON.parse(localStorage.getItem('pending_tracking_event') || '[]').length
            }
        };
    }
}


// 安全的模块导出包装
(function() {
    try {
        // ===================== 模块导出 ==========================
        // 导出供其他模块使用
        if (typeof window !== 'undefined') {
            window.PageMonitor = PageMonitor;
        }

        // 如果是在模块环境中
        if (typeof module !== 'undefined' && module.exports) {
            module.exports = PageMonitor;
        }

        // ===================== 自动初始化 ==========================
        // 从URL参数解析配置并自动创建PageMonitor实例
        function autoInitialize() {
            try {
                // 检查是否是通过script标签引入的
                const scriptTags = document.querySelectorAll('script[src*="pagemonitor.js"], script[src*="pagemonitor.min.js"]');
                let targetScript = null;
                
                // 找到当前正在执行的脚本标签
                for (const script of scriptTags) {
                    try {
                        if (script.readyState === 'loading' || script.getAttribute('data-auto-init') !== 'false') {
                            targetScript = script;
                            break;
                        }
                    } catch (e) {
                        this.log_error('Error checking script tag:', e);
                    }
                }
                
                if (!targetScript) return;
                
                // 从脚本URL解析参数
                const scriptUrl = new URL(targetScript.src);
                const params = scriptUrl.searchParams;
                
                // 从data-*属性中获取配置
                const dataConfig = {};
                for (const attr of targetScript.attributes) {
                    try {
                        if (attr.name.startsWith('data-')) {
                            const key = attr.name.replace('data-', '').replace(/-([a-z])/g, (m, w) => w.toUpperCase());
                            let value = attr.value;
                            
                            // 转换类型
                            if (value === 'true') value = true;
                            else if (value === 'false') value = false;
                            else if (!isNaN(value) && value !== '') value = Number(value);
                            
                            dataConfig[key] = value;
                        }
                    } catch (e) {
                        this.log_error('Error processing data attribute:', e);
                    }
                }
                
                // 合并URL参数和data-*属性，data-*属性优先级更高
                const config = {};
                
                // 处理URL参数
                if (params.has('apiBaseUrl')) {
                    config.apiBaseUrl = params.get('apiBaseUrl');
                } else if (scriptUrl.protocol === 'http:' || scriptUrl.protocol === 'https:') {
                    // 默认使用脚本所在服务器的地址，并考虑context path
                    const pathname = scriptUrl.pathname;
                    // 提取context path（public之前的部分）
                    const publicIndex = pathname.lastIndexOf('public/');
                    let contextPath = publicIndex > 0 ? pathname.substring(0, publicIndex) : '';
                    
                    // 确保contextPath和/api之间只有一个斜杠
                    if (contextPath && contextPath.endsWith('/')) {
                        contextPath = contextPath.slice(0, -1);
                    }
                    
                    config.apiBaseUrl = `${scriptUrl.protocol}//${scriptUrl.host}${contextPath}/api`;
                }
                // 添加对system和apiKey的支持
                if (params.has('system')) config.system = params.get('system');
                if (params.has('apiKey')) config.apiKey = params.get('apiKey');
                if (params.has('isSpa')) config.isSpa = params.get('isSpa') === 'true';
                if (params.has('isTrackDownloads')) config.isTrackDownloads = params.get('isTrackDownloads') === 'true';
                if (params.has('maxPendingItems')) {
                    try {
                        config.maxPendingItems = Number(params.get('maxPendingItems'));
                    } catch (e) {
                        this.log_warn('Invalid maxPendingItems in URL params:', e);
                    }
                }
                if (params.has('activeTimeThreshold')) {
                    try {
                        config.activeTimeThreshold = Number(params.get('activeTimeThreshold'));
                    } catch (e) {
                        this.log_warn('Invalid activeTimeThreshold in URL params:', e);
                    }
                }
                if (params.has('logLevel')) config.logLevel = params.get('logLevel');
                if (params.has('customEvents')) {
                    try {
                        config.customEvents = JSON.parse(params.get('customEvents'));
                    } catch (e) {
                        this.log_warn('Failed to parse customEvents from URL params:', e);
                    }
                }
                
                // 合并data-*属性（优先级更高）
                Object.assign(config, dataConfig);
                
                // 特殊处理data-custom-events属性（如果存在的话）
                if (dataConfig.customEvents && typeof dataConfig.customEvents === 'string') {
                    try {
                        config.customEvents = JSON.parse(dataConfig.customEvents);
                    } catch (e) {
                        this.log_error('Failed to parse customEvents from data attribute:', e);
                    }
                }
                
                // 创建全局实例
                window.pageMonitorInstance = new PageMonitor(config);
            } catch (error) {
                this.log_error('PageMonitor autoInitialize error:', error);
            }
        }

        // 当DOM加载完成后自动初始化
        if (typeof document !== 'undefined') {
            try {
                if (!document.body) {
                    // DOM尚未加载完成，等待DOMContentLoaded事件
                    document.addEventListener('DOMContentLoaded', () => {
                        try {
                            autoInitialize();
                        } catch (domReadyError) {
                            console.error('PageMonitor DOMContentLoaded initialization error:', domReadyError);
                        }
                    });
                } else {
                    // DOM已加载完成，直接初始化
                    setTimeout(() => {
                        try {
                            autoInitialize();
                        } catch (directInitError) {
                            this.log_error('PageMonitor direct initialization error:', directInitError);
                        }
                    }, 0);
                }
            } catch (initCheckError) {
                this.log_error('PageMonitor initialization check error:', initCheckError);
            }
        }
    } catch (exportError) {
        // 终极错误捕获，确保脚本不会影响页面
        if (typeof console !== 'undefined' && console.error) {
            console.error('PageMonitor module export and initialization error:', exportError);
        }
    }
})();