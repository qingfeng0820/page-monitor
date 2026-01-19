// 数据处理相关函数

// 初始化时间范围选择器
function initDateRangeSelector() {
    const presetRange = document.getElementById('presetRange');
    const customDateRange = document.querySelector('.custom-date-range');
    
    // 设置今天的日期为结束日期
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('endDate').value = today;
    
    // 默认选择30天
    updateDateRange(30);
    
    // 默认隐藏自定义范围
    customDateRange.style.display = 'none';
    
    // 监听预设范围变化
    presetRange.addEventListener('change', function() {
        if (this.value === 'custom') {
            customDateRange.style.display = 'inline-flex';
        } else {
            customDateRange.style.display = 'none';
            updateDateRange(parseInt(this.value));
        }
    });
    
    // 绑定刷新按钮事件
    document.getElementById('refreshBtn').addEventListener('click', loadData);
}

// 监听语言切换事件
document.addEventListener('languageChanged', function() {
    // 重新加载数据以更新所有国际化文本，包括时间单位
    loadData();
});

// 更新日期范围
function updateDateRange(days) {
    const today = new Date();
    const pastDate = new Date(today);
    pastDate.setDate(today.getDate() - days);
    
    const formatDate = (date) => {
        return date.toISOString().split('T')[0];
    };
    
    document.getElementById('startDate').value = formatDate(pastDate);
    document.getElementById('endDate').value = formatDate(today);
}

// 获取当前选择的日期范围
function getSelectedDateRange() {
    const presetRange = document.getElementById('presetRange');
    
    if (presetRange.value !== 'custom') {
        const days = parseInt(presetRange.value);
        const today = new Date();
        const pastDate = new Date(today);
        pastDate.setDate(today.getDate() - days);
        
        return {
            startDate: pastDate.toISOString().split('T')[0],
            endDate: today.toISOString().split('T')[0]
        };
    } else {
        return {
            startDate: document.getElementById('startDate').value,
            endDate: document.getElementById('endDate').value
        };
    }
}

// 加载数据
async function loadData() {
    try {
        // 显示加载状态
        showLoadingState();
        
        // 获取选中的日期范围
        const { startDate, endDate } = getSelectedDateRange();
        
        // 获取选中的结果数量限制
        const limit = document.getElementById('resultLimit').value;
        
        // 构建查询参数
        const queryParams = new URLSearchParams();
        if (startDate) queryParams.append('start_date', startDate);
        if (endDate) queryParams.append('end_date', endDate);
        if (limit) queryParams.append('limit', limit);

        // 获取system参数
        const urlParams = new URLSearchParams(window.location.search)
        let systemParam = urlParams.get('system')
        if (!systemParam) {
            systemParam = localStorage.getItem('selectedSiteName');
        }
        try {
            const response = await apiFetch('sites');
            if (response.ok) {
                const systems = await response.json();
                const systemNames = systems.map(s => s.site_name);
                
                // 如果有systemParam且它存在于系统列表中，直接使用
                if (systemParam && systemNames.includes(systemParam)) {
                    queryParams.append('system', systemParam);
                    localStorage.setItem('selectedSiteName', systemParam);
                } else {
                    // systemParam不存在或无效，根据系统数量处理
                    if (systems.length === 1) {
                        // 如果只有一个系统，直接使用
                        systemParam = systems[0].site_name;
                        queryParams.append('system', systemParam);
                        localStorage.setItem('selectedSiteName', systemParam);
                    } else {
                        localStorage.removeItem('selectedSiteName');
                        // 如果没有系统或有多个系统，跳转到control.html页面
                        window.location.href = 'control.html';
                        return; // 终止后续代码执行
                    }
                }
            } else {
                console.error('获取系统列表失败:', response.status);
                return;
            }
        } catch (error) {
            console.error('获取系统列表失败:', error);
            return;
        }

        const currentSystemNameElement = document.getElementById('currentSystemName');
        if (currentSystemNameElement) {
            currentSystemNameElement.textContent = systemParam || '未选择';
        }

        const username = localStorage.getItem('username');
        const usernameElement = document.getElementById('username');
        if (username && usernameElement) {
            // 只显示用户名本身，不显示欢迎语
            usernameElement.textContent = username;
        }
        
        // 构建API URL（使用相对路径，确保在Docker容器内正常工作）
        const apiBaseUrl = 'api/stats';
        const pageviewUrl = `${apiBaseUrl}/pageview?${queryParams.toString()}`;
        const downloadUrl = `${apiBaseUrl}/downloads?${queryParams.toString()}`;
        const eventUrl = `${apiBaseUrl}/events?${queryParams.toString()}`;
        const durationUrl = `${apiBaseUrl}/duration?${queryParams.toString()}`;

        // 并行获取页面访问、下载、事件和停留时长数据
        const [pageviewResponse, downloadResponse, eventResponse, durationResponse] = await Promise.all([
            apiFetch(pageviewUrl),
            apiFetch(downloadUrl),
            apiFetch(eventUrl),
            apiFetch(durationUrl)
        ]);
        
        // 检查响应状态
        if (!pageviewResponse.ok) {
            // 确保 t 函数存在
            const errorMessage = typeof t === 'function' ? t('pageviewDataError', { status: pageviewResponse.status }) : `Failed to fetch page view data: ${pageviewResponse.status}`;
            throw new Error(errorMessage);
        }
        if (!downloadResponse.ok) {
            // 确保 t 函数存在
            const errorMessage = typeof t === 'function' ? t('downloadDataError', { status: downloadResponse.status }) : `Failed to fetch download data: ${downloadResponse.status}`;
            throw new Error(errorMessage);
        }
        if (!eventResponse.ok) {
            // 确保 t 函数存在
            const errorMessage = typeof t === 'function' ? t('eventDataError', { status: eventResponse.status }) : `Failed to fetch event data: ${eventResponse.status}`;
            throw new Error(errorMessage);
        }
        if (!durationResponse.ok) {
            // 确保 t 函数存在
            const errorMessage = typeof t === 'function' ? t('durationDataError', { status: durationResponse.status }) : `Failed to fetch duration data: ${durationResponse.status}`;
            throw new Error(errorMessage);
        }
        
        // 解析JSON数据
        const pageviewData = await pageviewResponse.json();
        const downloadData = await downloadResponse.json();
        const eventData = await eventResponse.json();
        const durationData = await durationResponse.json();
        
        // 更新UI - 使用从API获取的真实数据
        updateOverview(pageviewData, downloadData, eventData, durationData);
        renderCharts(pageviewData, downloadData, eventData, durationData);
        updatePageviewTable(pageviewData, durationData);
        updateDownloadTable(downloadData);
        updateEventTable(eventData);
        
        // 更新最后更新时间
        document.getElementById('lastUpdate').textContent = new Date().toLocaleString();
        
    } catch (error) {
        // 确保 t 函数存在
        const errorMessage = typeof t === 'function' ? t('loadDataFailed') : 'Failed to load data';
        console.error(errorMessage, error);
        showErrorState(error.message);
    }
}

// 渲染所有图表
function renderCharts(pageviewData, downloadData, eventData, durationData) {
    renderPageviewCharts(pageviewData, durationData);
    renderDownloadCharts(downloadData);
    renderEventCharts(eventData);
    
    // 渲染趋势图
    if (typeof renderPageviewTrendChart === 'function') {
        renderPageviewTrendChart(pageviewData, durationData);
    }
    if (typeof renderDownloadTrendChart === 'function') {
        renderDownloadTrendChart(downloadData);
    }
    if (typeof renderEventTrendChart === 'function') {
        renderEventTrendChart(eventData);
    }
}

// 更新概览数据
function updateOverview(pageviewData, downloadData, eventData, durationData) {
    // 计算总访问量（使用API直接返回的totalViews字段）
    const totalViews = pageviewData.totalViews || 0;
    document.getElementById('totalViews').textContent = totalViews;
    
    // 计算总下载量（使用API直接返回的totalDownloads字段或从byFile计算）
    const totalDownloads = downloadData.totalDownloads || 
        (downloadData.byFile ? Object.values(downloadData.byFile).reduce((sum, count) => sum + count, 0) : 0);
    document.getElementById('totalDownloads').textContent = totalDownloads;
    
    // 浏览器类型数
    document.getElementById('browserTypes').textContent = pageviewData.browsers ? 
        Object.keys(pageviewData.browsers).length : 0;
    
    // 操作系统类型数
    document.getElementById('osTypes').textContent = pageviewData.os ? 
        Object.keys(pageviewData.os).length : 0;
    
    // 总事件数（使用API直接返回的totalEvents字段）
    const totalEvents = eventData.totalEvents || 0;
    document.getElementById('totalEvents').textContent = totalEvents;
    
    // 添加浏览用户数
    const uniqueUsers = pageviewData.uniqueUsers || 0;
    document.getElementById('uniqueUsers').textContent = uniqueUsers;
    
    // 计算IP地址数（从byIPPrefix获取）
    const ipCount = Object.keys(pageviewData.byIPPrefix || {}).length;
    document.getElementById('ipAddresses').textContent = ipCount;
    
    // 计算平均页面停留时间
    if (durationData && durationData.totalDuration && durationData.totalSessions) {
        const totalDuration = durationData.totalDuration;
        const totalVisits = durationData.totalSessions;
        const avgDurationSeconds = totalDuration / totalVisits;
        
        // 格式化显示：如果超过60秒，显示为分:秒格式，去掉没用的0
        let formattedDuration;
        if (avgDurationSeconds < 60) {
            formattedDuration = `${parseFloat(avgDurationSeconds.toFixed(2))}${typeof t === 'function' ? t('second') : '秒'}`;
        } else {
            const minutes = Math.floor(avgDurationSeconds / 60);
            const seconds = avgDurationSeconds % 60;
            formattedDuration = `${minutes}${typeof t === 'function' ? t('minute') : '分'}${parseFloat(seconds.toFixed(2))}${typeof t === 'function' ? t('second') : '秒'}`;
        }
        
        document.getElementById('avgDuration').textContent = formattedDuration;
    } else {
        document.getElementById('avgDuration').textContent = '0秒';
    }
}

// 更新下载表格 - 添加用户和IP统计信息
function updateDownloadTable(downloadData) {
    const tableBody = document.getElementById('downloadTable');
    
    // 更新表头 - 添加用户数和IP数列
    tableBody.innerHTML = '';
    
    // 使用byFile数据结构而不是downloads数组
    const downloads = downloadData.byFile || {};
    const fileAndSourcePages = downloadData.byFileAndSource || {};
    const fileAndUser = downloadData.byFileUniqueUsers || {};
    
    // 转换数据格式以匹配原表格结构
    const downloadArray = Object.keys(downloads).map(file => ({
        fileName: file,
        totalDownloads: downloads[file] || 0,
        sourcePages: fileAndSourcePages[file] || 0,
        uniqueUsers: fileAndUser[file] || 0
    }));
    
    // 按下载次数降序排序
    // downloadArray.sort((a, b) => b.totalDownloads - a.totalDownloads);
    
    downloadArray.forEach(download => {
        const row = document.createElement('tr');
        
        // 文件名
        const fileNameCell = document.createElement('td');
        fileNameCell.textContent = download.fileName;
        
        // 来源页面 - 添加tooltip
        const sourceCell = document.createElement('td');
        const sourcePages = Object.keys(download.sourcePages);
        sourceCell.innerHTML = sourcePages.map(page => 
            `<div class="badge badge-primary" title="${page}">${page.length > 30 ? page.substring(0, 30) + '...' : page}</div>`
        ).join(' ');

        // 下载次数
        const countCell = document.createElement('td');
        countCell.innerHTML = `<span class="badge badge-primary">${download.totalDownloads}</span>`;

        // 用户数
        const usersCell = document.createElement('td');
        const userCount = download.uniqueUsers || 0;
        usersCell.innerHTML = `<span class="badge badge-success">${userCount}</span>`;
        
        row.appendChild(fileNameCell);
        row.appendChild(sourceCell);
        row.appendChild(countCell);
        row.appendChild(usersCell);
        
        tableBody.appendChild(row);
    });
}

// 更新页面访问表格
function updatePageviewTable(pageviewData, durationData) {
    const tableBody = document.getElementById('pageViewTable');
    
    // 清空表格内容
    tableBody.innerHTML = '';
    
    // 获取页面URL数据和用户数据
    const urls = pageviewData.urls || {};
    const urlUsers = pageviewData.byUrlAndUser || {};
    const urlDurations = durationData ? durationData.byUrl || {} : {};
    
    // 转换数据格式以匹配表格结构
    const pageViewArray = Object.keys(urls).map(url => {
        // 计算平均停留时长
        let avgDuration = 0;
        if (urlDurations[url] && urlDurations.count && urlDurations.count[url] > 0) {
            avgDuration = urlDurations[url] / urlDurations.count[url];
        }
        
        return {
            url: url,
            totalViews: urls[url] || 0,
            uniqueUsers: urlUsers[url] ? Object.keys(urlUsers[url]).length : 0,
            avgDuration: avgDuration
        };
    });
    
    // 按访问次数排序
    // pageViewArray.sort((a, b) => b.totalViews - a.totalViews);
    
    pageViewArray.forEach(pageView => {
        const row = document.createElement('tr');
        
        // 页面URL - 添加tooltip
        const urlCell = document.createElement('td');
        urlCell.innerHTML = `<div class="badge badge-success" title="${pageView.url}">${pageView.url.length > 50 ? pageView.url.substring(0, 50) + '...' : pageView.url}</div>`;
        
        // 平均停留时间
        const durationCell = document.createElement('td');
        let formattedDuration;
        if (pageView.avgDuration < 60) {
            formattedDuration = `${parseFloat(pageView.avgDuration.toFixed(2))}${typeof t === 'function' ? t('second') : '秒'}`;
        } else {
            const minutes = Math.floor(pageView.avgDuration / 60);
            const seconds = pageView.avgDuration % 60;
            formattedDuration = `${minutes}${typeof t === 'function' ? t('minute') : '分'}${parseFloat(seconds.toFixed(2))}${typeof t === 'function' ? t('second') : '秒'}`;
        }
        durationCell.innerHTML = `<span class="badge badge-info">${formattedDuration}</span>`;

        // 访问次数
        const countCell = document.createElement('td');
        countCell.innerHTML = `<span class="badge badge-primary">${pageView.totalViews}</span>`;
        
        // 用户数
        const usersCell = document.createElement('td');
        usersCell.innerHTML = `<span class="badge badge-success">${pageView.uniqueUsers}</span>`;
        
        row.appendChild(urlCell);
        row.appendChild(durationCell);
        row.appendChild(countCell);
        row.appendChild(usersCell);
        
        tableBody.appendChild(row);
    });
}

// 更新事件表格
function updateEventTable(eventData) {
    const tableBody = document.getElementById('eventTable');
    tableBody.innerHTML = '';
    
    // 从byCategoryAndAction中提取数据
    const eventEntries = [];
    
    const byCategoryAndActionAndUser = eventData.byCategoryAndActionAndUser || {};
    
    // 添加类别和动作的组合数据
    if (eventData.byCategoryAndAction) {
        for (const [category, actions] of Object.entries(eventData.byCategoryAndAction)) {
            for (const [action, count] of Object.entries(actions)) {
                // 计算该类别和动作组合的唯一用户数
                let userCount = 0;
                if (byCategoryAndActionAndUser[category] && byCategoryAndActionAndUser[category][action]) {
                    userCount = Object.keys(byCategoryAndActionAndUser[category][action]).length;
                }
                
                eventEntries.push({
                    category: category,
                    action: action,
                    count: count,
                    userCount: userCount
                });
            }
        }
    }
    
    // 如果没有组合数据，添加类别和动作的单独统计
    if (eventEntries.length === 0) {
        // 添加按类别统计的数据
        if (eventData.byCategory) {
            for (const [category, count] of Object.entries(eventData.byCategory)) {
                // 计算该类别的唯一用户数
                let userCount = 0;
                if (byCategoryAndActionAndUser[category]) {
                    userCount = new Set();
                    for (const [action, users] of Object.entries(byCategoryAndActionAndUser[category])) {
                        Object.keys(users).forEach(user => userCount.add(user));
                    }
                    userCount = userCount.size;
                }
                
                eventEntries.push({
                    category: category,
                    action: '总计',
                    count: count,
                    userCount: userCount
                });
            }
        }
        
        // 添加按动作统计的数据
        if (eventData.byAction) {
            for (const [action, count] of Object.entries(eventData.byAction)) {
                // 计算该动作的唯一用户数
                let userCount = 0;
                const usersSet = new Set();
                for (const [category, actions] of Object.entries(byCategoryAndActionAndUser)) {
                    if (actions[action]) {
                        Object.keys(actions[action]).forEach(user => usersSet.add(user));
                    }
                }
                userCount = usersSet.size;
                
                eventEntries.push({
                    category: t('allCategories'),
                    action: action,
                    count: count,
                    userCount: userCount
                });
            }
        }
    }

    // 按次数排序
    // eventEntries.sort((a, b) => b.count - a.count);
    
    eventEntries.forEach(event => {
        const row = document.createElement('tr');
        
        // 事件类别
        const categoryCell = document.createElement('td');
        categoryCell.textContent = event.category;
        
        // 事件动作
        const actionCell = document.createElement('td');
        actionCell.textContent = event.action;
        
        // 次数
        const countCell = document.createElement('td');
        countCell.innerHTML = `<span class="badge badge-primary">${event.count}</span>`;
        
        // 用户数
        const userCountCell = document.createElement('td');
        userCountCell.innerHTML = `<span class="badge badge-success">${event.userCount}</span>`;
        
        row.appendChild(categoryCell);
        row.appendChild(actionCell);
        row.appendChild(countCell);
        row.appendChild(userCountCell);
        
        tableBody.appendChild(row);
    });
}