// 下载图表渲染相关函数

// 渲染下载图表
function renderDownloadCharts(downloadData) {
    // 按文件下载图表
    const downloadFileCtx = document.getElementById('downloadFileChart').getContext('2d');
    // 使用正确的数据结构 byFile 而不是 files
    const fileLabels = Object.keys(downloadData.byFile || {});
    const fileData = Object.values(downloadData.byFile || {});
    
    if (downloadFileChart) downloadFileChart.destroy();
    downloadFileChart = new Chart(downloadFileCtx, {
        type: 'bar',
        data: {
            labels: fileLabels.map(file => file.length > 30 ? file.substring(0, 30) + '...' : file),
            datasets: [{
                label: '下载次数',
                data: fileData,
                backgroundColor: '#4bb543',
                borderColor: '#3a8c35',
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
                },
                tooltip: {
                    callbacks: {
                        title: function(tooltipItems) {
                            const index = tooltipItems[0].dataIndex;
                            return fileLabels[index]; // 显示完整文件名
                        }
                    }
                }
            }
        }
    });

    // 下载来源图表
    const downloadSourceCtx = document.getElementById('downloadSourceChart').getContext('2d');
    // 使用正确的数据结构 bySourcePage 而不是 referrers
    const sourceLabels = Object.keys(downloadData.bySourcePage || {});
    const sourceData = Object.values(downloadData.bySourcePage || {});
    
    if (downloadSourceChart) downloadSourceChart.destroy();
    downloadSourceChart = new Chart(downloadSourceCtx, {
        type: 'pie',
        data: {
            labels: sourceLabels.map(label => label.length > 20 ? label.substring(0, 20) + '...' : label),
            datasets: [{
                data: sourceData,
                backgroundColor: [
                    '#4bb543', '#3a8c35', '#2a6c25', '#1a4c15'
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
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = sourceLabels[context.dataIndex] || context.label;
                            const value = context.parsed;
                            return `${label}: ${value}次`;
                        }
                    }
                }
            }
        }
    });

    // 下载用户图表 - 添加错误处理和调试信息
    try {
        const downloadUserCtx = document.getElementById('downloadUserChart').getContext('2d');
        let downloadUserLabels = [];
        let downloadUserData = [];
        
        // 检查是否有用户统计数据（API没有返回byUser字段，使用byUser代替）
        if (downloadData.byUser && typeof downloadData.byUser === 'object' && Object.keys(downloadData.byUser).length > 0) {
            // 获取前10个下载最活跃的用户（出于隐私和性能考虑）
            const userEntries = Object.entries(downloadData.byUser)
                .sort(([,a], [,b]) => b - a);
            
            downloadUserLabels = userEntries.map(([id]) => {
                return id;
            });
            downloadUserData = userEntries.map(([, count]) => count);
        } else {
            downloadUserLabels = ['暂无用户数据'];
            downloadUserData = [1];
        }
        
        if (downloadUserChart) downloadUserChart.destroy();
        
        // 确保Canvas元素有效
        if (downloadUserCtx) {
            downloadUserChart = new Chart(downloadUserCtx, {
                type: 'bar',
                data: {
                    labels: downloadUserLabels,
                    datasets: [{
                        label: '下载次数',
                        data: downloadUserData,
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
                                stepSize: 1,
                                precision: 0
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
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                title: function(tooltipItems) {
                                    const index = tooltipItems[0].dataIndex;
                                    return `用户 ${downloadUserLabels[index]}`;
                                }
                            }
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error creating download user chart:', error);
        // 显示错误信息在图表容器中
        const downloadUserChartContainer = document.getElementById('downloadUserChart').parentElement;
        downloadUserChartContainer.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><div>下载用户图表加载失败</div><div style="font-size: 0.9rem; margin-top: 10px;">${error.message}</div></div>`;
    }

    // 下载IP图表 - 添加错误处理和调试信息
    try {
        const downloadIpCtx = document.getElementById('downloadIpChart').getContext('2d');
        let downloadIpLabels = [];
        let downloadIpData = [];
        
        // 检查是否有IP统计数据
        if (downloadData.byIPPrefix && typeof downloadData.byIPPrefix === 'object' && Object.keys(downloadData.byIPPrefix).length > 0) {
            // 获取前10个下载最活跃的IP前缀（出于隐私和性能考虑）
            const ipEntries = Object.entries(downloadData.byIPPrefix)
                .sort(([,a], [,b]) => b - a);
                            
            downloadIpLabels = ipEntries.map(([ip]) => ip);
            downloadIpData = ipEntries.map(([, count]) => count);
        } else {
            downloadIpLabels = ['暂无IP数据'];
            downloadIpData = [1];
        }
        
        if (downloadIpChart) downloadIpChart.destroy();
        
        // 确保Canvas元素有效
        if (downloadIpCtx) {
            downloadIpChart = new Chart(downloadIpCtx, {
                type: 'bar',
                data: {
                    labels: downloadIpLabels.map(ip => ip.length > 20 ? ip.substring(0, 20) + '...' : ip),
                    datasets: [{
                        label: '下载次数',
                        data: downloadIpData,
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
                                stepSize: 1,
                                precision: 0
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
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                title: function(tooltipItems) {
                                    const index = tooltipItems[0].dataIndex;
                                    return downloadIpLabels[index]; // 显示完整IP
                                }
                            }
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error creating download IP chart:', error);
        // 显示错误信息在图表容器中
        const downloadIpChartContainer = document.getElementById('downloadIpChart').parentElement;
        downloadIpChartContainer.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><div>下载IP图表加载失败</div><div style="font-size: 0.9rem; margin-top: 10px;">${error.message}</div></div>`;
    }
}

// 渲染下载趋势图
function renderDownloadTrendChart(downloadData) {
    if (!downloadData || !downloadData.trendData) {
        console.error('无效的下载趋势数据');
        return;
    }

    const ctx = document.getElementById('downloadTrendChart').getContext('2d');
    const trendData = downloadData.trendData;
    
    // 准备数据
    const labels = trendData.map(item => item.date);
    const totalData = trendData.map(item => item.total);
    const uniqueUsersData = trendData.map(item => item.uniqueUsers);

    // 销毁旧图表实例
    if (downloadTrendChart && typeof downloadTrendChart.destroy === 'function') {
        downloadTrendChart.destroy();
    }

    // 创建新图表
    downloadTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '总下载量',
                    data: totalData,
                    borderColor: '#4bb543',
                    backgroundColor: 'rgba(75, 181, 67, 0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: '下载用户数',
                    data: uniqueUsersData,
                    borderColor: '#9d4edd',
                    backgroundColor: 'rgba(157, 78, 221, 0.1)',
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