// 国际化配置
const translations = {
    'en': {
        // 通用
        'unauthorizedAccess': 'Unauthorized access',
        'apiRequestError': 'API request error',
        'loading': 'Loading...',
        'error': 'Error',
        'success': 'Success',
        'cancel': 'Cancel',
        'confirm': 'Confirm',
        'save': 'Save',
        'delete': 'Delete',
        'edit': 'Edit',
        'add': 'Add',
        'close': 'Close',
        'yes': 'Yes',
        'no': 'No',
        'back': 'Back',
        'next': 'Next',
        'submit': 'Submit',
        'reset': 'Reset',
        // 系统名称和页面标题
        'systemName': 'Page Monitoring System',
        'systemNameLabel': 'System Name',
        'loginTitle': 'Login - Page Monitoring System',
        'registerTitle': 'Register - Site Monitoring System',
        'dashboardTitle': 'Page Access & Download Monitoring Dashboard',
        'controlTitle': 'Configuration - Site Monitoring System',
        'config': 'Configuration',
        
        // 登录页面
        'login': 'Login',
        'username': 'Username',
        'password': 'Password',
        'loginSuccess': 'Login successful',
        'loginFailed': 'Login failed',
        'enterUsername': 'Please enter username',
        'enterPassword': 'Please enter password',
        
        // 注册页面
        'register': 'Register',
        'registerAccount': 'Sign Up',
        'fullName': 'Full Name',
        'enterFullName': 'Please enter full name',
        'emailOptional': 'Email (Optional)',
        'enterEmail': 'Please enter email',
        'phoneOptional': 'Phone (Optional)',
        'enterPhone': 'Please enter phone number',
        'alreadyHaveAccount': 'Already have an account?',
        'loginNow': 'Login now',
        'confirmPassword': 'Confirm Password',
        'registerSuccess': 'Registration successful! Redirecting to login page...',
        'registerFailed': 'Registration failed, please try again later',
        'passwordMismatch': 'Passwords do not match',
        'atLeastOneContact': 'Please enter at least one contact method (email or phone)',
        'networkError': 'Network error, please try again later',
        'loginError': 'Login error',
        'loadDataFailed': 'Failed to load data',
        'httpError': 'HTTP error ({status})',
        'pageviewDataError': 'Failed to fetch page view data: {status}',
        'downloadDataError': 'Failed to fetch download data: {status}',
        'eventDataError': 'Failed to fetch event data: {status}',
        'durationDataError': 'Failed to fetch duration data: {status}',
        
        // 主页面
        'pageAccessDownloadMonitor': 'Page Access & Download Monitoring',
        'realTimeMonitor': 'Real-Time Monitoring',
        'dashboard': 'Dashboard',
        'monitoring': 'Monitoring',
        'reports': 'Reports',
        'settings': 'Settings',
        'logout': 'Logout',
        'welcome': 'Welcome',
        'welcomeMessage': 'Welcome, {username}',
        'currentSystem': 'Current System:',
        'notSelected': 'Not Selected',
        'currentUser': 'Current User:',
        'notLoggedIn': 'Not Logged In',
        'timeRange': 'Time Range:',
        'today': 'Today',
        'last90Days': 'Last 90 Days',
        'last180Days': 'Last 180 Days',
        'last365Days': 'Last 365 Days',
        'customRange': 'Custom Range',
        'chartTopItems': 'Chart Top Items:',
        'copyCode': 'Copy Code',
        
        // 监控面板
        'pageViews': 'Page Views',
        'uniqueVisitors': 'Unique Visitors',
        'avgTimeOnPage': 'Average Time on Page',
        'bounceRate': 'Bounce Rate',
        'downloads': 'Downloads',
        'events': 'Events',
        'topPages': 'Top Pages',
        'trafficSources': 'Traffic Sources',
        'geographicData': 'Geographic Data',
        
        // 数据处理器
        'processingData': 'Processing data...',
        'noDataAvailable': 'No data available',
        
        // 图表相关
        'time': 'Time',
        'count': 'Count',
        'value': 'Value',
        'percentage': 'Percentage',
        'page': 'Page',
        'source': 'Source',
        'country': 'Country',
        'city': 'City',
        'event': 'Event',
        'file': 'File',
        'allCategories': 'All Categories',
        
        // 控制相关
        'selectDateRange': 'Select Date Range',
        'refreshData': 'Refresh Data',
        'exportData': 'Export Data',
        'customizeView': 'Customize View',
        'last7Days': 'Last 7 Days',
        'last30Days': 'Last 30 Days',
        'thisMonth': 'This Month',
        'lastMonth': 'Last Month',
        'custom': 'Custom',
        
        // 统计卡片
        'totalPageViews': 'Total Page Views',
        'totalDownloads': 'Total Downloads',
        'totalEvents': 'Total Events',
        'uniqueUsers': 'Unique Users',
        'ipAddressSegments': 'IP Address Segments',
        'browserTypes': 'Browser Types',
        'operatingSystems': 'Operating Systems',
        'averagePageTime': 'Average Page Time',
        
        // 系统管理
        'monitorConfig': 'Monitoring Configuration',
        'modifyPassword': 'Change Password',
        'createNewSystem': 'Create New System Monitoring',
        'systemURL': 'System URL',
        'enterSystemName': 'Please enter system name',
        'enterSystemURL': 'Please enter system URL',
        'create': 'Create',
        'currentPassword': 'Current Password',
        'newPassword': 'New Password',
        'confirmNewPassword': 'Confirm New Password',
        'enterCurrentPassword': 'Please enter current password',
        'enterNewPassword': 'Please enter new password',
        'confirmNewPassword': 'Please confirm new password',
        'saveChanges': 'Save Changes',
        'monitorScriptUsage': 'Monitoring Script Usage',
        'basicUsage': 'Basic Usage',
        'autoInitializeFeature': 'autoInitialize Feature',
        'autoInitializeDescription': 'The script automatically initializes monitoring by default, no additional configuration is required. If you need to disable auto-initialization, you can use the following attribute:',
        'supportedDataAttributes': 'Supported data-xxx Attributes',
        'dataSystem': 'data-system: System name (required)',
        'dataApiKey': 'data-api-key: API key (required)',
        'dataApiBaseUrl': 'data-api-base-url: API base URL (default: /api)',
        'dataIsSpa': 'data-is-spa: Whether it is a SPA application (true/false, default: false)',
        'dataIsTrackDownloads': 'data-is-track-downloads: Whether to track downloads (true/false, default: true)',
        'dataMaxPendingItems': 'data-max-pending-items: Maximum number of pending records (default: 50)',
        'dataLogLevel': 'data-log-level: Log level (debug/info/warn/error, default: warn)',
        'dataCustomEvents': 'data-custom-events: Custom event configuration (JSON format)',
        'dataActiveTimeThreshold': 'data-active-time-threshold: Active time threshold (seconds, default: 600 seconds) - Used to calculate dwell time',
        'customEventsConfig': 'Custom Event Configuration',
        'customEventsDescription': 'You can configure custom event monitoring using the data-custom-events attribute:',
        'customEventsConfigNote': 'Configuration Instructions:',
        'selectorLabel': 'selector: CSS selector to match the elements to monitor',
        'eventTypeLabel': 'eventType: Event type (default: click)',
        'propertiesLabel': 'properties: Custom event properties, including:',
        'categoryLabel': 'category: Event category',
        'actionLabel': 'action: Event action',
        'labelLabel': 'label: Event label',
        'manualInitialization': 'Manual Initialization (when autoInitialize is disabled)',
        'vueIntegration': 'Vue Integration Method',
        'vueIntegrationDescription': 'There are two ways to add pagemonitor.js to Vue projects: global import and component-level import. The following describes the integration methods for Vue 2 and Vue 3 respectively.',
        'vue2Integration': 'Vue 2 Integration',
        'vue2GlobalImport': 'Global Import (in main.js)',
        'vue2GlobalImportNote': 'First, download pagemonitor.min.js.',
        'vue2ComponentImport': 'Component-level Import',
        'vue3Integration': 'Vue 3 Integration',
        'vue3GlobalImport': 'Global Import (in main.js)',
        'vue3GlobalImportNote': 'First, download pagemonitor.min.js.',
        'vue3ComponentImport': 'Component-level Import (using <script setup>)',
        'reactIntegration': 'React Integration Method',
        'reactIntegrationDescription': 'There are two ways to add pagemonitor.js to React projects: global import and component-level import.',
        'reactGlobalImport': 'Global Import (in index.js)',
        'reactGlobalImportNote': 'First, download pagemonitor.min.js.',
        'reactComponentImport': 'Component-level Import',
        'systemCreateSuccess': 'System monitoring created successfully!',
        'systemCreateFailed': 'System creation failed, please try again later',
        'noSystemsMonitored': 'You have no systems being monitored',
        'createFirstSystem': 'Please use the form below to create monitoring for your first system',
        'deleteSystem': 'Delete system',
        'confirmDeleteSystem': 'Are you sure you want to delete system "{siteName}"?\nThis action will delete all monitoring data and website configuration, and it cannot be recovered.',
        'deletingSystem': 'Deleting system...',
        'systemDeleteSuccess': 'System "{siteName}" deleted successfully!',
        'systemDeleteFailed': 'Failed to delete system: {errorMessage}',
        'creator': 'Creator',
        'failedToGetSystems': 'Failed to get system list',
        'passwordChangeSuccess': 'Password changed successfully!',
        'passwordChangeFailed': 'Password change failed, please try again later',
        'confirmLogout': 'Are you sure you want to logout?',
        'confirmRemoveUser': 'Are you sure you want to remove user {username} from system "{siteName}"?',
        'copySuccess': 'Copied successfully!',
        'copyFailed': 'Failed to copy: {errorMessage}',
        'addUserSuccess': 'User added successfully',
        'addUserFailed': 'Failed to add user: {errorMessage}',
        'removeUserSuccess': 'User {username} has been removed from system "{siteName}"',
        'removeUserFailed': 'Failed to remove user: {errorMessage}',
        'viewSystem': 'View system',
        'system': 'System',
        'url': 'URL',
        'authorizedUsers': 'Authorized Users',
        'html': 'HTML',
        'vue': 'Vue',
        'react': 'React',
        'embedCode': 'Embed Code',
        'copyCurrentTabCode': 'Copy current tab code',
        'viewMonitoringData': 'View monitoring data >',
        'authorizationManagement': 'Authorization Management',
        'addAuthorizedUser': 'Add authorized user',
        'addUser': 'Add User',
        'removeUser': 'Remove User',
        'userAddedSuccess': 'User added successfully!',
        'userAddedFailed': 'Failed to add user, please try again later',
        'userRemovedSuccess': 'User removed successfully!',
        'userRemovedFailed': 'Failed to remove user, please try again later',
        'selectSystem': 'Select System',
        'viewStatistics': 'View Statistics',
        
        // 页面访问分析
        'pageAccessAnalysis': 'Page Access Analysis',
        'byUrl': 'By URL',
        'byBrowser': 'By Browser',
        'byOs': 'By OS',
        'byDevice': 'By Device',
        'byUser': 'By User',
        'byIp': 'By IP Segment',
        'combinationAnalysis': 'Combination Analysis',
        'bySourcePage': 'By Source Page',
        'trendAnalysis': 'Trend Analysis',
        'pageUrl': 'Page URL',
        'averageTime': 'Average Time',
        'visits': 'Visits',
        
        // 下载分析
        'downloadAnalysis': 'Download Analysis',
        'byFile': 'By File',
        'byDownloadPage': 'By Download Page',
        'fileName': 'File Name',
        'downloadPage': 'Download Page',
        'downloadCount': 'Download Count',
        
        // 事件分析
        'eventAnalysis': 'Event Analysis',
        'byEventType': 'By Event Type',
        'byEventCategory': 'By Event Category',
        'byEventAction': 'By Event Action',
        'byEventLabel': 'By Event Label',
        'bySelector': 'By Selector',
        
        // UI提示
        'dataLoadingFailed': 'Data loading failed',
        'reload': 'Reload',
        'loadingData': 'Loading data...',
        
        // 表格表头
        'pageUrl': 'Page URL',
        'averageStayTime': 'Average Stay Time',
        'visitCount': 'Visit Count',
        'userCount': 'User Count',
        
        // 事件相关
        'eventCategory': 'Event Category',
        'eventAction': 'Event Action',
        'eventCount': 'Event Count',
        'userCount': 'User Count',
        'invalidEventTrendData': 'Invalid event trend data',
        
        // 趋势分析
        'overallTrend': 'Overall Trend',
        'visitTrend': 'Visit Trend',
        'trend': 'Trend',
        
        // 下载趋势
        'totalDownloadTrend': 'Total Download Trend',
        'downloadTrend': 'Download Trend',
        'totalEventTrend': 'Total Event Trend',
        
        // 通用
        'times': 'times',
        'date': 'Date',
        
        // 时间单位
        'minute': 'min',
        'second': 'sec',
        
        // 来源页面
        'directAccess': 'Direct Access',
        'allPagesSourceStats': 'All Pages Source Statistics',
        'pageSourceStats': 'Page "{url}" Source Statistics',
        
        // 选择器相关
        'select': 'Select',
        'selectPageUrl': 'Select Page URL',
        'selector': 'Selector',
                
        // 页脚相关
        'lastUpdated': 'Last updated',
        
        // 选择器相关
        'select': 'Select',
        'selectPageUrl': 'Select Page URL',
        'selector': 'Selector',
    },
    'zh': {
        // 通用
        'unauthorizedAccess': '未授权访问',
        'apiRequestError': 'API请求错误',
        'loading': '加载中...',
        'error': '错误',
        'success': '成功',
        'cancel': '取消',
        'confirm': '确认',
        'save': '保存',
        'delete': '删除',
        'edit': '编辑',
        'add': '添加',
        'close': '关闭',
        'yes': '是',
        'no': '否',
        'back': '返回',
        'next': '下一步',
        'submit': '提交',
        'reset': '重置',
        // 系统名称和页面标题
        'systemName': '页面监控系统',
        'systemNameLabel': '系统名称',
        'loginTitle': '登录 - 页面监控系统',
        'registerTitle': '注册 - 网站监控系统',
        'dashboardTitle': '页面访问与下载监控面板',
        'controlTitle': '配置 - 网站监控系统',
        'config': '配置',
        
        // 登录页面
        'login': '登录',
        'username': '用户名',
        'password': '密码',
        'loginSuccess': '登录成功',
        'loginFailed': '登录失败',
        'enterUsername': '请输入用户名',
        'enterPassword': '请输入密码',
        
        // 注册页面
        'register': '注册',
        'registerAccount': '注册账号',
        'fullName': '姓名',
        'enterFullName': '请输入姓名',
        'emailOptional': '邮箱（选填）',
        'enterEmail': '请输入邮箱',
        'phoneOptional': '手机号（选填）',
        'enterPhone': '请输入手机号',
        'alreadyHaveAccount': '已有账号？',
        'loginNow': '立即登录',
        'confirmPassword': '确认密码',
        'registerSuccess': '注册成功！即将跳转到登录页面...',
        'registerFailed': '注册失败，请稍后重试',
        'passwordMismatch': '两次输入的密码不一致',
        'atLeastOneContact': '邮箱和手机号至少填一个',
        'networkError': '网络错误，请稍后重试',
        'loginError': '登录错误',
        'loadDataFailed': '加载数据失败',
        'httpError': 'HTTP错误 ({status})',
        'pageviewDataError': '页面访问数据获取失败: {status}',
        'downloadDataError': '下载数据获取失败: {status}',
        'eventDataError': '事件数据获取失败: {status}',
        'durationDataError': '页面停留时长数据获取失败: {status}',
        
        // 主页面
        'dashboard': '仪表板',
        'monitoring': '监控',
        'reports': '报告',
        'settings': '设置',
        'logout': '退出登录',
        'welcome': '欢迎',
        'welcomeMessage': '欢迎，{username}',
        
        // 监控面板
        'pageViews': '页面浏览量',
        'uniqueVisitors': '独立访客数',
        'avgTimeOnPage': '平均页面停留时间',
        'bounceRate': '跳出率',
        'downloads': '下载量',
        'events': '事件',
        'topPages': '热门页面',
        'trafficSources': '流量来源',
        'geographicData': '地域数据',
        
        // 主页面
        'pageAccessDownloadMonitor': '页面访问与下载监控面板',
        'realTimeMonitor': '实时监控页面访问情况和下载统计',
        'currentSystem': '当前系统:',
        'notSelected': '未选择',
        'currentUser': '当前用户:',
        'notLoggedIn': '未登录',
        'timeRange': '时间范围:',
        'today': '当天',
        'last7Days': '最近7天',
        'last30Days': '最近30天',
        'last90Days': '最近90天',
        'last180Days': '最近180天',
        'last365Days': '最近365天',
        'customRange': '自定义范围',
        'chartTopItems': '图表Top数:',
        'copyCode': '复制代码',
        'refreshData': '刷新数据',
        
        // 统计卡片
        'totalPageViews': '总页面访问量',
        'totalDownloads': '总下载次数',
        'totalEvents': '总事件数',
        'uniqueUsers': '浏览用户数',
        'ipAddressSegments': 'IP地址段数',
        'browserTypes': '浏览器类型',
        'operatingSystems': '操作系统',
        'averagePageTime': '平均页面停留时间',
        
        // 页面访问分析
        'pageAccessAnalysis': '页面访问分析',
        'byUrl': '按URL',
        'byBrowser': '按浏览器',
        'byOs': '按操作系统',
        'byDevice': '按设备',
        'byUser': '按用户',
        'byIp': '按IP段',
        'combinationAnalysis': '组合分析',
        'bySourcePage': '按来源页面',
        'trendAnalysis': '趋势分析',
        'pageUrl': '页面URL',
        'averageTime': '平均停留时间',
        'visits': '访问次数',
        
        // 下载分析
        'downloadAnalysis': '下载分析',
        'byFile': '按文件',
        'byDownloadPage': '按下载页面',
        'fileName': '文件名',
        'downloadPage': '下载页面',
        'downloadCount': '下载次数',
        
        // 事件分析
        'eventAnalysis': '事件分析',
        'byEventType': '按事件类型',
        'byEventCategory': '按事件类别',
        'byEventAction': '按事件动作',
        'byEventLabel': '按事件标签',
        'bySelector': '按选择器',

        // 页脚相关
        'lastUpdated': '最后更新',
        
        // UI提示
        'confirmLogout': '确定要登出吗？',
        'dataLoadingFailed': '数据加载失败',
        'reload': '重新加载',
        'loadingData': '加载数据中...',
        
        // 表格表头
        'pageUrl': '页面URL',
        'averageStayTime': '平均停留时间',
        'visitCount': '访问次数',
        'userCount': '用户数',
        
        // 事件相关
        'eventCategory': '事件类别',
        'eventAction': '事件动作',
        'eventCount': '事件数量',
        'userCount': '用户数',
        'invalidEventTrendData': '无效的事件趋势数据',
        
        // 趋势分析
        'overallTrend': '总趋势',
        'visitTrend': '访问趋势',
        'trend': '趋势',
        
        // 下载趋势
        'totalDownloadTrend': '总下载趋势',
        'downloadTrend': '下载趋势',
        'totalEventTrend': '总事件趋势',
        
        // 通用
        'times': '次',
        'date': '日期',
        
        // 时间单位
        'minute': '分',
        'second': '秒',
        
        // 来源页面
        'directAccess': '直接访问',
        'allPagesSourceStats': '所有页面的访问来源统计',
        'pageSourceStats': '页面 "{url}" 的访问来源统计',
        
        // 选择器相关
        'select': '选择',
        'selectPageUrl': '选择页面URL',
        'selector': '选择器',
        
        // 选择器相关
        'select': '选择',
        'selectPageUrl': '选择页面URL',
        'selector': '选择器',
        
        // 数据处理器
        'processingData': '处理数据中...',
        'noDataAvailable': '暂无数据',
        
        // 图表相关
        'time': '时间',
        'count': '数量',
        'value': '数值',
        'percentage': '百分比',
        'page': '页面',
        'source': '来源',
        'country': '国家',
        'city': '城市',
        'event': '事件',
        'file': '文件',
        'allCategories': '所有类别',
        
        // 控制相关
        'selectDateRange': '选择日期范围',
        'refreshData': '刷新数据',
        'exportData': '导出数据',
        'customizeView': '自定义视图',
        'last7Days': '最近7天',
        'last30Days': '最近30天',
        'thisMonth': '本月',
        'lastMonth': '上月',
        'custom': '自定义',
        
        // 系统管理
        'monitorConfig': '监控配置',
        'modifyPassword': '修改密码',
        'createNewSystem': '创建新的系统监控',
        'systemNameLabel': '系统名称',
        'systemURL': '系统URL',
        'enterSystemName': '请输入系统名称',
        'enterSystemURL': '请输入网站URL',
        'create': '创建',
        'currentPassword': '当前密码',
        'newPassword': '新密码',
        'confirmNewPassword': '确认新密码',
        'enterCurrentPassword': '请输入当前密码',
        'enterNewPassword': '请输入新密码',
        'confirmNewPassword': '请再次输入新密码',
        'saveChanges': '保存修改',
        'monitorScriptUsage': '监控脚本使用说明',
        'basicUsage': '基本用法',
        'autoInitializeFeature': 'autoInitialize 功能',
        'autoInitializeDescription': '脚本默认会自动初始化监控功能，无需额外配置。如果需要禁用自动初始化，可以使用以下属性：',
        'supportedDataAttributes': '支持的 data-xxx 属性',
        'dataSystem': 'data-system: 系统名称（必填）',
        'dataApiKey': 'data-api-key: API密钥（必填）',
        'dataApiBaseUrl': 'data-api-base-url: API基础URL（默认：/api）',
        'dataIsSpa': 'data-is-spa: 是否为SPA应用（true/false，默认：false）',
        'dataIsTrackDownloads': 'data-is-track-downloads: 是否跟踪下载（true/false，默认：true）',
        'dataMaxPendingItems': 'data-max-pending-items: 最大待处理记录数（默认：50）',
        'dataLogLevel': 'data-log-level: 日志级别（debug/info/warn/error，默认：warn）',
        'dataCustomEvents': 'data-custom-events: 自定义事件配置（JSON格式）',
        'dataActiveTimeThreshold': 'data-active-time-threshold: 活跃时间阈值（秒，默认：600秒） - 用于计算停留时间',
        'customEventsConfig': '自定义事件配置',
        'customEventsDescription': '可以通过 data-custom-events 属性配置自定义事件监控：',
        'customEventsConfigNote': '配置说明：',
        'selectorLabel': 'selector: CSS选择器，用于匹配要监控的元素',
        'eventTypeLabel': 'eventType: 事件类型（默认：click）',
        'propertiesLabel': 'properties: 自定义事件属性，包含：',
        'categoryLabel': 'category: 事件类别',
        'actionLabel': 'action: 事件动作',
        'labelLabel': 'label: 事件标签',
        'manualInitialization': '手动初始化（当禁用autoInitialize时）',
        'vueIntegration': 'Vue 集成方法',
        'vueIntegrationDescription': '将 pagemonitor.js 添加到 Vue 项目中有两种方式：全局引入和组件级引入。以下分别介绍 Vue 2 和 Vue 3 的集成方法。',
        'vue2Integration': 'Vue 2 集成',
        'vue2GlobalImport': '全局引入（在 main.js 中）',
        'vue2GlobalImportNote': '需要先下载 pagemonitor.min.js。',
        'vue2ComponentImport': '组件级引入',
        'vue3Integration': 'Vue 3 集成',
        'vue3GlobalImport': '全局引入（在 main.js 中）',
        'vue3GlobalImportNote': '需要先下载 pagemonitor.min.js。',
        'vue3ComponentImport': '组件级引入（使用 <script setup>）',
        'reactIntegration': 'React 集成方法',
        'reactIntegrationDescription': '将 pagemonitor.js 添加到 React 项目中有两种方式：全局引入和组件级引入。',
        'reactGlobalImport': '全局引入（在 index.js 中）',
        'reactGlobalImportNote': '需要先下载 pagemonitor.min.js。',
        'reactComponentImport': '组件级引入',
        'systemCreateSuccess': '系统监控创建成功！',
        'systemCreateFailed': '系统创建失败，请稍后重试',
        'noSystemsMonitored': '您还没有任何系统在监控',
        'createFirstSystem': '请使用下方的表单创建您的第一个系统的监控',
        'deleteSystem': '删除系统',
        'confirmDeleteSystem': '确定要删除系统 "{siteName}" 吗？\n此操作将删除所有监控数据和网站配置，不可恢复。',
        'deletingSystem': '正在删除系统...',
        'systemDeleteSuccess': '系统 "{siteName}" 删除成功！',
        'systemDeleteFailed': '删除系统失败: {errorMessage}',
        'creator': '创建者',
        'failedToGetSystems': '获取系统列表失败',
        'passwordChangeSuccess': '密码修改成功！',
        'passwordChangeFailed': '密码修改失败，请稍后重试',
        'confirmLogout': '确定要登出吗？',
        'confirmRemoveUser': '确定要移除用户 {username} 对系统 "{siteName}" 的访问权限吗？',
        'copySuccess': '复制成功！',
        'copyFailed': '复制失败: {errorMessage}',
        'addUserSuccess': '添加用户成功',
        'addUserFailed': '添加用户失败: {errorMessage}',
        'removeUserSuccess': '已从系统 "{siteName}" 移除用户 {username}',
        'removeUserFailed': '移除用户失败: {errorMessage}',
        'viewSystem': '查看系统',
        'system': '系统',
        'url': 'URL',
        'authorizedUsers': '授权用户',
        'html': 'HTML',
        'vue': 'Vue',
        'react': 'React',
        'embedCode': '嵌入代码',
        'copyCurrentTabCode': '复制当前标签页代码',
        'viewMonitoringData': '查看监控数据 >',
        'authorizationManagement': '授权管理',
        'addAuthorizedUser': '添加授权用户',
        'addUser': '添加用户',
        'removeUser': '移除用户',
        'userAddedSuccess': '用户添加成功！',
        'userAddedFailed': '添加用户失败，请稍后重试',
        'userRemovedSuccess': '用户移除成功！',
        'userRemovedFailed': '移除用户失败，请稍后重试',
        'selectSystem': '选择系统',
        'viewStatistics': '查看统计数据'
    }
};

// 获取当前语言
function getCurrentLanguage() {
    return localStorage.getItem('language') || 'zh'; // 默认中文
}

// 更新页面翻译
function updateTranslations() {
    // 更新所有带有data-i18n属性的元素
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        element.textContent = t(key);
        
        // 更新placeholder属性
        if (element.hasAttribute('data-i18n-placeholder')) {
            const placeholderKey = element.getAttribute('data-i18n-placeholder');
            element.setAttribute('placeholder', t(placeholderKey));
        }
        
        // 更新title属性
        if (element.hasAttribute('data-i18n-title')) {
            const titleKey = element.getAttribute('data-i18n-title');
            element.setAttribute('title', t(titleKey));
        }
        
        // 更新alt属性
        if (element.hasAttribute('data-i18n-alt')) {
            const altKey = element.getAttribute('data-i18n-alt');
            element.setAttribute('alt', t(altKey));
        }
    });
    
    // 专门处理只有data-i18n-placeholder属性的元素（如输入框）
    document.querySelectorAll('[data-i18n-placeholder]:not([data-i18n])').forEach(element => {
        const placeholderKey = element.getAttribute('data-i18n-placeholder');
        element.setAttribute('placeholder', t(placeholderKey));
    });
    
    // 专门处理只有data-i18n-title属性的元素（如按钮）
    document.querySelectorAll('[data-i18n-title]:not([data-i18n])').forEach(element => {
        const titleKey = element.getAttribute('data-i18n-title');
        element.setAttribute('title', t(titleKey));
    });
    
    // 更新页面标题
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        // 根据当前页面URL选择不同的标题翻译键
        const path = window.location.pathname;
        let titleKey = 'dashboardTitle'; // 默认仪表板页面
        
        if (path.includes('login.html')) {
            titleKey = 'loginTitle';
        } else if (path.includes('register.html')) {
            titleKey = 'registerTitle';
        } else if (path.includes('control.html')) {
            titleKey = 'controlTitle';
        }
        
        pageTitle.textContent = t(titleKey);
    }
    
    // 触发自定义事件，让其他脚本可以响应语言变化
    document.dispatchEvent(new Event('languageChanged'));
    
    // 重新设置当前系统和当前用户信息
    setTimeout(() => {
        // 首先从URL参数获取system参数
        const urlParams = new URLSearchParams(window.location.search);
        let systemParam = urlParams.get('system');
        
        // 如果URL中没有system参数，则从localStorage获取
        if (!systemParam) {
            systemParam = localStorage.getItem('selectedSiteName');
        }
        
        const currentSystemNameElement = document.getElementById('currentSystemName');
        if (currentSystemNameElement) {
            currentSystemNameElement.textContent = systemParam || t('notSelected');
        }

        const username = localStorage.getItem('username');
        const usernameElement = document.getElementById('username');
        if (username && usernameElement) {
            usernameElement.textContent = username;
        }
    }, 0);
}

// 切换语言
function setLanguage(lang) {
    if (translations[lang]) {
        localStorage.setItem('language', lang);
        updateTranslations();
        return true;
    }
    return false;
}

// 翻译函数
function t(key, interpolations) {
    const lang = getCurrentLanguage();
    // 确保能正确获取对应语言的翻译，如果当前语言没有则尝试英文
    const translation = translations[lang] && translations[lang][key] ? translations[lang][key] : (translations['en'][key] || key);
    
    // 处理插值
    if (interpolations && typeof interpolations === 'object') {
        return Object.keys(interpolations).reduce((result, key) => {
            // 同时支持单大括号和双大括号语法
            return result.replace(new RegExp(`\{\{${key}\}\}`, 'g'), interpolations[key])
                        .replace(new RegExp(`\{${key}\}`, 'g'), interpolations[key]);
        }, translation);
    }
    
    return translation;
}

// 将 t 函数添加到全局作用域，确保在所有文件中都能访问
if (typeof window !== 'undefined') {
    window.t = t;
    // 同时添加 i18n 对象，确保 ui.js 和 main.js 中的 i18n.t 调用也能正常工作
    window.i18n = {
        t: t,
        getCurrentLanguage: getCurrentLanguage,
        setLanguage: setLanguage,
        updateTranslations: updateTranslations,
        initLanguageSelector: initLanguageSelector,
        translations: translations
    };
}

// 初始化语言选择器
function initLanguageSelector() {
    const languageSelector = document.getElementById('language');
    if (languageSelector) {
        const currentLang = getCurrentLanguage();
        languageSelector.value = currentLang;
        
        // 更新页面翻译
        updateTranslations();
    }
}

// 页面加载时初始化
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', initLanguageSelector);
}

// 导出函数（如果需要模块化使用）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { t, getCurrentLanguage, setLanguage, updateTranslations, initLanguageSelector, translations };
}