// 页面访问图表渲染相关函数

// 渲染页面访问图表
function renderPageviewCharts(pageviewData, durationData) {
    // URL访问图表 - 修改tooltip配置
    const urlCtx = document.getElementById('urlChart').getContext('2d');
    const urls = pageviewData.urls || {};
    const urlLabels = Object.keys(urls);
    const urlData = Object.values(urls);
    
    // 获取页面停留时长数据
    const urlDurations = durationData ? durationData.byUrl || {} : {};
    const urlDurationCounts = durationData ? (durationData.byUrl ? durationData.byUrl.count || {} : {}) : {};
    const durationDataArray = urlLabels.map(url => {
        // 计算平均停留时长
        if (urlDurations[url] && urlDurationCounts[url] && urlDurationCounts[url] > 0) {
            return parseFloat((urlDurations[url] / urlDurationCounts[url]).toFixed(2));
        }
        return 0;
    });
    
    // 获取用户数数据
    const urlUsers = pageviewData.byUrlAndUser || {};
    const uniqueUsersData = urlLabels.map(url => {
        return urlUsers[url] ? Object.keys(urlUsers[url]).length : 0;
    });
    
    if (urlChart) urlChart.destroy();
    urlChart = new Chart(urlCtx, {
        type: 'bar',
        data: {
            labels: urlLabels.map(url => url.length > 30 ? url.substring(0, 30) + '...' : url),
            datasets: [{
                label: '访问次数',
                data: urlData,
                backgroundColor: '#4361ee',
                borderColor: '#3a0ca3',
                borderWidth: 1,
                yAxisID: 'y',
                order: 2
            }, {
                label: '浏览用户数',
                data: uniqueUsersData,
                backgroundColor: '#f72585',
                borderColor: '#3a0ca3',
                borderWidth: 1,
                yAxisID: 'y',
                order: 2
            }, {
                label: '平均停留时间(秒)',
                data: durationDataArray,
                backgroundColor: '#4cc9f0',
                borderColor: '#3a0ca3',
                borderWidth: 1,
                type: 'line',
                yAxisID: 'y1',
                order: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    },
                    title: {
                        display: true,
                        text: '访问次数'
                    }
                },
                y1: {
                    beginAtZero: true,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false
                    },
                    title: {
                        display: true,
                        text: '平均停留时间(秒)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        title: function(tooltipItems) {
                            const index = tooltipItems[0].dataIndex;
                            return urlLabels[index]; // 这里显示完整URL
                        }
                    }
                }
            }
        }
    });

    // 浏览器分布图表
    const browserCtx = document.getElementById('browserChart').getContext('2d');
    const browsers = pageviewData.browsers || {};
    const browserLabels = Object.keys(browsers);
    const browserData = Object.values(browsers);
    const browserColors = browserLabels.map(browser => getBrowserColor(browser));
    
    if (browserChart) browserChart.destroy();
    browserChart = new Chart(browserCtx, {
        type: 'doughnut',
        data: {
            labels: browserLabels,
            datasets: [{
                data: browserData,
                backgroundColor: browserColors.length > 0 ? browserColors : ['#4361ee', '#4cc9f0', '#3a0ca3', '#7209b7', '#f72585'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right'
                }
            }
        }
    });

    // 操作系统分布图表
    const osCtx = document.getElementById('osChart').getContext('2d');
    const os = pageviewData.os || {};
    const osLabels = Object.keys(os);
    const osData = Object.values(os);
    
    if (osChart) osChart.destroy();
    osChart = new Chart(osCtx, {
        type: 'pie',
        data: {
            labels: osLabels,
            datasets: [{
                data: osData,
                backgroundColor: [
                    '#4361ee', '#4cc9f0', '#3a0ca3', '#7209b7', '#f72585', '#38b000'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right'
                }
            }
        }
    });

    // 设备分布图表
    const deviceCtx = document.getElementById('deviceChart').getContext('2d');
    const devices = pageviewData.devices || {}; // 使用正确的API返回字段名
    const deviceLabels = Object.keys(devices);
    const deviceData = Object.values(devices);
    
    if (deviceChart) deviceChart.destroy();
    deviceChart = new Chart(deviceCtx, {
        type: 'polarArea',
        data: {
            labels: deviceLabels.length > 0 ? deviceLabels : ['暂无设备数据'],
            datasets: [{
                data: deviceData.length > 0 ? deviceData : [1],
                backgroundColor: [
                    'rgba(67, 97, 238, 0.7)',
                    'rgba(76, 201, 240, 0.7)',
                    'rgba(58, 12, 163, 0.7)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right'
                }
            }
        }
    });

    // 用户图表 - 添加错误处理和调试信息
    try {
        const userCtx = document.getElementById('userChart').getContext('2d');
        let userLabels = [];
        let userData = [];
        let avgDurationData = [];
        
        // 检查是否有用户统计数据
        if (pageviewData.byUser && typeof pageviewData.byUser === 'object' && Object.keys(pageviewData.byUser).length > 0) {
            // 获取前10个最活跃的用户（出于隐私和性能考虑）
            const userEntries = Object.entries(pageviewData.byUser)
                .sort(([,a], [,b]) => b - a);
            
            userLabels = userEntries.map(([id]) => {
                return id;
            });
            userData = userEntries.map(([, count]) => count);
            
            // 获取用户平均停留时间数据
            const userDurations = durationData ? durationData.byUser || {} : {};
            const userDurationCounts = durationData ? (durationData.byUser ? durationData.byUser.count || {} : {}) : {};
            avgDurationData = userEntries.map(([id]) => {
                if (userDurations[id] && userDurationCounts[id] && userDurationCounts[id] > 0) {
                    return parseFloat((userDurations[id] / userDurationCounts[id]).toFixed(2));
                }
                return 0;
            });
        } else {
            userLabels = ['暂无用户数据'];
            userData = [1];
            avgDurationData = [0];
        }
        
        if (userChart) userChart.destroy();
        
        // 确保Canvas元素有效
        if (userCtx) {
            userChart = new Chart(userCtx, {
                type: 'bar',
                data: {
                    labels: userLabels,
                    datasets: [{
                        label: '访问次数',
                        data: userData,
                        backgroundColor: '#9d4edd',
                        borderColor: '#7209b7',
                        borderWidth: 1,
                        yAxisID: 'y',
                        order: 2
                    }, {
                        label: '平均停留时间(秒)',
                        data: avgDurationData,
                        backgroundColor: '#4cc9f0',
                        borderColor: '#3a0ca3',
                        borderWidth: 1,
                        type: 'line',
                        yAxisID: 'y1',
                        order: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1,
                                precision: 0
                            },
                            title: {
                                display: true,
                                text: '访问次数'
                            }
                        },
                        y1: {
                            beginAtZero: true,
                            position: 'right',
                            grid: {
                                drawOnChartArea: false
                            },
                            title: {
                                display: true,
                                text: '平均停留时间(秒)'
                            }
                        },
                        x: {
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top'
                        },
                        tooltip: {
                            callbacks: {
                                title: function(tooltipItems) {
                                    const index = tooltipItems[0].dataIndex;
                                    return `用户 ${userLabels[index]}`;
                                }
                            }
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error creating user chart:', error);
        // 显示错误信息在图表容器中
        const userChartContainer = document.getElementById('userChart').parentElement;
        userChartContainer.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><div>用户图表加载失败</div><div style="font-size: 0.9rem; margin-top: 10px;">${error.message}</div></div>`;
    }

    // IP图表 - 添加错误处理和调试信息
    try {
        const ipCtx = document.getElementById('ipChart').getContext('2d');
        let ipLabels = [];
        let ipData = [];
        let uniqueUsersData = [];
        let avgDurationData = [];
        
        // 检查是否有IP统计数据
        if (pageviewData.byIPPrefix && typeof pageviewData.byIPPrefix === 'object' && Object.keys(pageviewData.byIPPrefix).length > 0) {
            // 获取前10个最活跃的IP前缀（出于隐私和性能考虑）
            const ipEntries = Object.entries(pageviewData.byIPPrefix)
                .sort(([,a], [,b]) => b - a);
            
            ipLabels = ipEntries.map(([ip]) => ip);
            ipData = ipEntries.map(([, count]) => count);
            
            // 获取IP浏览用户数数据
            const ipUniqueUsers = pageviewData.byIPPrefixUniqueUsers || {};
            uniqueUsersData = ipEntries.map(([ip]) => {
                return ipUniqueUsers[ip] || 0;
            });
            
            // 获取IP平均停留时间数据
            const ipDurations = durationData ? durationData.byIPPrefix || {} : {};
            const ipDurationCounts = durationData ? (durationData.byIPPrefix ? durationData.byIPPrefix.count || {} : {}) : {};
            avgDurationData = ipEntries.map(([ip]) => {
                if (ipDurations[ip] && ipDurationCounts[ip] && ipDurationCounts[ip] > 0) {
                    return parseFloat((ipDurations[ip] / ipDurationCounts[ip]).toFixed(2));
                }
                return 0;
            });
        } else {
            ipLabels = ['暂无IP数据'];
            ipData = [1];
            uniqueUsersData = [0];
            avgDurationData = [0];
        }
        
        if (ipChart) ipChart.destroy();
        
        // 确保Canvas元素有效
        if (ipCtx) {
            ipChart = new Chart(ipCtx, {
                type: 'bar',
                data: {
                    labels: ipLabels.map(ip => ip.length > 20 ? ip.substring(0, 20) + '...' : ip),
                    datasets: [{
                        label: '访问次数',
                        data: ipData,
                        backgroundColor: '#4361ee',
                        borderColor: '#3a0ca3',
                        borderWidth: 1,
                        yAxisID: 'y',
                        order: 2
                    }, {
                        label: '浏览用户数',
                        data: uniqueUsersData,
                        backgroundColor: '#f72585',
                        borderColor: '#3a0ca3',
                        borderWidth: 1,
                        yAxisID: 'y',
                        order: 2
                    }, {
                        label: '平均停留时间(秒)',
                        data: avgDurationData,
                        backgroundColor: '#4cc9f0',
                        borderColor: '#3a0ca3',
                        borderWidth: 1,
                        type: 'line',
                        yAxisID: 'y1',
                        order: 1 
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1,
                                precision: 0
                            },
                            title: {
                                display: true,
                                text: '访问次数'
                            }
                        },
                        y1: {
                            beginAtZero: true,
                            position: 'right',
                            grid: {
                                drawOnChartArea: false
                            },
                            title: {
                                display: true,
                                text: '平均停留时间(秒)'
                            }
                        },
                        x: {
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top'
                        },
                        tooltip: {
                            callbacks: {
                                title: function(tooltipItems) {
                                    const index = tooltipItems[0].dataIndex;
                                    return ipLabels[index]; // 显示完整IP
                                }
                            }
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error creating IP chart:', error);
        // 显示错误信息在图表容器中
        const ipChartContainer = document.getElementById('ipChart').parentElement;
        ipChartContainer.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><div>IP图表加载失败</div><div style="font-size: 0.9rem; margin-top: 10px;">${error.message}</div></div>`;
    }

    // 组合分析图表 - 组合浏览器和操作系统（同时展示访问次数和唯一用户数）
    try {
        const combinationCtx = document.getElementById('combinationChart').getContext('2d');
        
        // 使用浏览器和操作系统的组合数据
        const browserAndOS = pageviewData.browserAndOS || {};
        // 使用API返回的浏览器和操作系统唯一用户数数据
        const browserAndOSUniqueUsers = pageviewData.browserAndOSUniqueUsers || {};
        
        // 获取所有浏览器和操作系统
        const browsers = Object.keys(browserAndOS); // 最多显示5个浏览器
        const uniqueOS = new Set();
        
        browsers.forEach(browser => {
            Object.keys(browserAndOS[browser]).forEach(os => uniqueOS.add(os));
        });
        const osList = Array.from(uniqueOS); // 最多显示3个操作系统
        
        // 准备双指标数据
        const labels = browsers;
        const datasets = [];
        
        // 添加访问次数数据集（与URL图一致的颜色）
        osList.forEach(os => {
            const data = browsers.map(browser => {
                return browserAndOS[browser]?.[os] || 0;
            });
            
            datasets.push({
                label: `${os} - 访问次数`,
                data: data,
                backgroundColor: '#4361ee', // 与URL图一致的背景色
                borderColor: '#3a0ca3', // 与URL图一致的边框色
                borderWidth: 1, // 与URL图一致的边框宽度
                yAxisID: 'y', // 关联到唯一的Y轴
                stack: '访问次数', // 同一操作系统的数据堆叠
                order: 2 // 与URL图一致的图层顺序
            });
        });
        
        // 添加唯一用户数数据集（与URL图一致的颜色）
        osList.forEach(os => {
            const userData = browsers.map(browser => {
                // 直接使用API返回的唯一用户数
                return browserAndOSUniqueUsers[browser]?.[os] || 0;
            });
            
            datasets.push({
                label: `${os} - 浏览用户数`,
                data: userData,
                backgroundColor: '#f72585', // 与URL图一致的背景色
                borderColor: '#3a0ca3', // 与URL图一致的边框色
                borderWidth: 1, // 与URL图一致的边框宽度
                fill: true, // 启用填充
                yAxisID: 'y', // 关联到同一Y轴
                stack: '浏览用户数', // 同一操作系统的数据堆叠
                order: 2 // 与URL图一致的图层顺序
            });
        });
        
        // 添加平均停留时长数据集（与URL图完全一致的配置）
        if (durationData && durationData.byBrowserAndOS) {
            const browserAndOSDurations = durationData.byBrowserAndOS || {};
            
            osList.forEach(os => {
                const avgDurationData = browsers.map(browser => {
                    // 计算平均停留时长
                    const totalDuration = browserAndOSDurations[browser]?.[os] || 0;
                    const count = browserAndOSDurations?.["count"][browser]?.[os] || 0;
                    
                    if (count > 0) {
                        // 计算平均值，保留两位小数，不显示末尾的0
                        const avg = totalDuration / count;
                        return parseFloat(avg.toFixed(2));
                    }
                    return 0;
                });
                
                datasets.push({
                    label: `${os} - 平均停留时间(秒)`,
                    data: avgDurationData,
                    backgroundColor: '#4cc9f0', // 与URL图完全一致的背景色
                    borderColor: '#3a0ca3', // 与URL图完全一致的边框色
                    borderWidth: 1, // 与URL图完全一致的边框宽度
                    type: 'line', // 与URL图一致的图表类型
                    yAxisID: 'y1', // 与URL图一致的Y轴配置
                    order: 1 // 与URL图一致的图层顺序
                });
            });
        }
        
        if (combinationChart) combinationChart.destroy();
        
        // 确保Canvas元素有效
        if (combinationCtx) {
            combinationChart = new Chart(combinationCtx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            },
                            title: {
                                display: true,
                                text: '访问次数'
                            }
                        },
                        y1: {
                            beginAtZero: true,
                            position: 'right',
                            grid: {
                                drawOnChartArea: false
                            },
                            title: {
                                display: true,
                                text: '平均停留时间(秒)'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top'
                        },
                        tooltip: {
                            callbacks: {
                                title: function(tooltipItems) {
                                    const index = tooltipItems[0].dataIndex;
                                    return labels[index]; // 显示完整浏览器名称
                                }
                            }
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error creating combination chart:', error);
        // 显示错误信息在图表容器中
        const combinationChartContainer = document.getElementById('combinationChart').parentElement;
        combinationChartContainer.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><div>组合分析图表加载失败</div><div style="font-size: 0.9rem; margin-top: 10px;">${error.message}</div></div>`;
    }
}

// 获取浏览器对应的颜色
function getBrowserColor(browser) {
    const colorMap = {
        'Chrome': '#4285f4',
        'Firefox': '#ff9800',
        'Safari': '#4cd964',
        'Edge': '#0078d7',
        'IE': '#0072c6',
        'Opera': '#ff1b2d',
        'Other': '#ff3b30'
    };
    return colorMap[browser] || '#6c757d';
}

// 渲染页面访问趋势图
function renderPageviewTrendChart(pageviewData, durationData) {
    if (!pageviewData || !pageviewData.trendData) {
        console.error('无效的页面访问趋势数据');
        return;
    }

    const ctx = document.getElementById('pageviewTrendChart').getContext('2d');
    const pageviewTrendData = pageviewData.trendData;
    const durationTrendData = durationData ? durationData.trendData : [];
    
    // 准备数据
    const labels = pageviewTrendData.map(item => item.date);
    const totalData = pageviewTrendData.map(item => item.total);
    const uniqueUsersData = pageviewTrendData.map(item => item.uniqueUsers);
    
    // 计算每天的平均停留时间
    // 创建日期到停留时长数据的映射，便于快速查找
    const durationMap = new Map();
    durationTrendData.forEach(durationItem => {
        durationMap.set(durationItem.date, durationItem);
    });
    
    // 对每个页面访问日期，查找对应的停留时长数据
    const avgDurationData = pageviewTrendData.map(pageviewItem => {
        const date = pageviewItem.date;
        const durationItem = durationMap.get(date);
        
        if (durationItem && durationItem.count > 0) {
            return parseFloat((durationItem.total / durationItem.count).toFixed(2));
        }
        return 0;
    });

    // 销毁旧图表实例
    if (pageviewTrendChart && typeof pageviewTrendChart.destroy === 'function') {
        pageviewTrendChart.destroy();
    }

    // 创建新图表
    pageviewTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '总访问量',
                    data: totalData,
                    borderColor: '#4361ee',
                    backgroundColor: 'rgba(67, 97, 238, 0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: '浏览用户数',
                    data: uniqueUsersData,
                    borderColor: '#f72585',
                    backgroundColor: 'rgba(247, 37, 133, 0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: '平均停留时间(秒)',
                    data: avgDurationData,
                    borderColor: '#4cc9f0',
                    backgroundColor: 'rgba(76, 201, 240, 0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y1' // 使用第二个Y轴
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: '日期'
                    }
                },
                y: {
                    beginAtZero: true,
                    display: true,
                    title: {
                        display: true,
                        text: '数量'
                    }
                },
                y1: {
                    beginAtZero: true,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false
                    },
                    display: true,
                    title: {
                        display: true,
                        text: '平均停留时间(秒)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y;
                            }
                            return label;
                        }
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}