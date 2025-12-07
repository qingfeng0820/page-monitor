// 事件图表渲染相关函数

// 渲染事件图表
function renderEventCharts(eventData) {
    // 事件类型图表
    const eventTypeCtx = document.getElementById('eventTypeChart').getContext('2d');
    const eventTypeLabels = Object.keys(eventData.byType || {});
    const eventTypeData = Object.values(eventData.byType || {});
    
    if (eventTypeChart) eventTypeChart.destroy();
    eventTypeChart = new Chart(eventTypeCtx, {
        type: 'pie',
        data: {
            labels: eventTypeLabels,
            datasets: [{
                data: eventTypeData,
                backgroundColor: [
                    '#4361ee', '#4cc9f0', '#3a0ca3', '#7209b7', '#f72585'
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

    // 事件类别图表
    const eventCategoryCtx = document.getElementById('eventCategoryChart').getContext('2d');
    const eventCategoryLabels = Object.keys(eventData.byCategory || {});
    const eventCategoryData = Object.values(eventData.byCategory || {});
    
    if (eventCategoryChart) eventCategoryChart.destroy();
    eventCategoryChart = new Chart(eventCategoryCtx, {
        type: 'pie',
        data: {
            labels: eventCategoryLabels,
            datasets: [{
                data: eventCategoryData,
                backgroundColor: [
                    '#4361ee', '#4cc9f0', '#3a0ca3', '#7209b7', '#f72585'
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

    // 事件动作图表
    const eventActionCtx = document.getElementById('eventActionChart').getContext('2d');
    const eventActionLabels = Object.keys(eventData.byAction || {});
    const eventActionData = Object.values(eventData.byAction || {});
    
    if (eventActionChart) eventActionChart.destroy();
    eventActionChart = new Chart(eventActionCtx, {
        type: 'pie',
        data: {
            labels: eventActionLabels,
            datasets: [{
                data: eventActionData,
                backgroundColor: [
                    '#4361ee', '#4cc9f0', '#3a0ca3', '#7209b7', '#f72585'
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

    // 事件标签图表
    const eventLabelCtx = document.getElementById('eventLabelChart').getContext('2d');
    const eventLabelLabels = Object.keys(eventData.byLabel || {});
    const eventLabelData = Object.values(eventData.byLabel || {});
    
    if (eventLabelChart) eventLabelChart.destroy();
    eventLabelChart = new Chart(eventLabelCtx, {
        type: 'pie',
        data: {
            labels: eventLabelLabels,
            datasets: [{
                data: eventLabelData,
                backgroundColor: [
                    '#4361ee', '#4cc9f0', '#3a0ca3', '#7209b7', '#f72585'
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

    // 选择器图表
    const eventSelectorCtx = document.getElementById('eventSelectorChart').getContext('2d');
    const eventSelectorLabels = Object.keys(eventData.bySelector || {});
    const eventSelectorData = Object.values(eventData.bySelector || {});
    
    if (eventSelectorChart) eventSelectorChart.destroy();
    eventSelectorChart = new Chart(eventSelectorCtx, {
        type: 'pie',
        data: {
            labels: eventSelectorLabels,
            datasets: [{
                data: eventSelectorData,
                backgroundColor: [
                    '#4361ee', '#4cc9f0', '#3a0ca3', '#7209b7', '#f72585'
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

    // 组合分析图表
    const eventCombinationCtx = document.getElementById('eventCombinationChart').getContext('2d');
    
    // 准备组合分析数据
    const comboLabels = [];
    const comboData = [];
    const comboColors = [];
    
    // 使用byCategoryAndAction数据创建组合数据
    if (eventData.byCategoryAndAction) {
        for (const [category, actions] of Object.entries(eventData.byCategoryAndAction)) {
            for (const [action, count] of Object.entries(actions)) {
                comboLabels.push(`${category} - ${action}`);
                comboData.push(count);
                comboColors.push(`hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`);
            }
        }
    }
    
    // 如果没有组合数据，创建一个默认的提示
    if (comboData.length === 0) {
        comboLabels.push('暂无组合数据');
        comboData.push(1);
        comboColors.push('#cccccc');
    }
    
    if (eventCombinationChart) eventCombinationChart.destroy();
    eventCombinationChart = new Chart(eventCombinationCtx, {
        type: 'bar',
        data: {
            labels: comboLabels,
            datasets: [{
                label: '事件次数',
                data: comboData,
                backgroundColor: comboColors,
                borderWidth: 1
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
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });

    // 事件用户图表
    const eventUserCtx = document.getElementById('eventUserChart').getContext('2d');
    let eventUserLabels = [];
    let eventUserData = [];
    
    // 检查是否有用户统计数据（API没有返回byUser字段，使用byUser代替）
    if (eventData.byUser && Object.keys(eventData.byUser).length > 0) {
        // 获取前10个最活跃的用户（出于隐私和性能考虑）
        const userEntries = Object.entries(eventData.byUser)
            .sort(([,a], [,b]) => b - a);
        
        eventUserLabels = userEntries.map(([id]) => {
            return id;
        });
        eventUserData = userEntries.map(([, count]) => count);
    } else {
        eventUserLabels = ['暂无用户数据'];
        eventUserData = [1];
    }
    
    if (eventUserChart) eventUserChart.destroy();
    eventUserChart = new Chart(eventUserCtx, {
        type: 'bar',
        data: {
            labels: eventUserLabels,
            datasets: [{
                label: '事件次数',
                data: eventUserData,
                backgroundColor: '#9d4edd',
                borderColor: '#7209b7',
                borderWidth: 1
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
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });

    // 事件IP图表
    const eventIpCtx = document.getElementById('eventIpChart').getContext('2d');
    let eventIpLabels = [];
    let eventIpData = [];
    
    // 检查是否有IP统计数据
    if (eventData.byIPPrefix && Object.keys(eventData.byIPPrefix).length > 0) {
        // 获取前10个最活跃的IP前缀（出于隐私和性能考虑）
        const ipEntries = Object.entries(eventData.byIPPrefix)
            .sort(([,a], [,b]) => b - a);
        
        eventIpLabels = ipEntries.map(([ip]) => ip);
        eventIpData = ipEntries.map(([, count]) => count);
    } else {
        eventIpLabels = ['暂无IP数据'];
        eventIpData = [1];
    }
    
    if (eventIpChart) eventIpChart.destroy();
    eventIpChart = new Chart(eventIpCtx, {
        type: 'bar',
        data: {
            labels: eventIpLabels.map(ip => ip.length > 20 ? ip.substring(0, 20) + '...' : ip),
            datasets: [{
                label: '事件次数',
                data: eventIpData,
                backgroundColor: '#f72585',
                borderColor: '#c7174f',
                borderWidth: 1
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
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// 渲染事件趋势图
function renderEventTrendChart(eventData) {
    if (!eventData || !eventData.trendData) {
        console.error('无效的事件趋势数据');
        return;
    }

    const ctx = document.getElementById('eventTrendChart').getContext('2d');
    const trendData = eventData.trendData;
    
    // 准备数据
    const labels = trendData.map(item => item.date);
    const totalData = trendData.map(item => item.total);
    const uniqueUsersData = trendData.map(item => item.uniqueUsers);

    // 销毁旧图表实例
    if (eventTrendChart && typeof eventTrendChart.destroy === 'function') {
        eventTrendChart.destroy();
    }

    // 创建新图表
    eventTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '总事件数',
                    data: totalData,
                    borderColor: '#4361ee',
                    backgroundColor: 'rgba(67, 97, 238, 0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: '用户数',
                    data: uniqueUsersData,
                    borderColor: '#f72585',
                    backgroundColor: 'rgba(247, 37, 133, 0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y'
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