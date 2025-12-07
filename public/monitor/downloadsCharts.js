// 下载图表渲染相关函数

// 模块级变量，用于存储下载趋势图表实例
let downloadTrendChart;

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

// 渲染下载趋势图（整合总趋势和文件趋势）
function renderDownloadTrendChart(downloadData) {
    if (!downloadData || !downloadData.trendData) {
        console.error('无效的下载趋势数据');
        return;
    }

    const ctx = document.getElementById('downloadTrendChart').getContext('2d');
    const trendData = downloadData.trendData;
    const fileSelector = document.getElementById('fileSelector');
    
    // 准备数据
    const labels = trendData.map(item => item.date);
    
    // 收集所有文件的趋势数据，包含下载次数和用户数
    const fileTrendMap = new Map(); // 存储每个文件的完整数据
    const fileCountTrendMap = new Map(); // 仅存储下载次数，用于排序
    
    trendData.forEach(item => {
        if (item.byFile) {
            Object.entries(item.byFile).forEach(([file, data]) => {
                // 初始化文件数据结构
                if (!fileTrendMap.has(file)) {
                    fileTrendMap.set(file, {
                        countData: Array(labels.length).fill(0),
                        userData: Array(labels.length).fill(0)
                    });
                }
                
                const fileData = fileTrendMap.get(file);
                const index = labels.indexOf(item.date);
                if (index !== -1) {
                    fileData.countData[index] = data.count;
                    fileData.userData[index] = data.uniqueUsers;
                }
                
                // 更新用于排序的下载次数数据
                if (!fileCountTrendMap.has(file)) {
                    fileCountTrendMap.set(file, Array(labels.length).fill(0));
                }
                const countData = fileCountTrendMap.get(file);
                if (index !== -1) {
                    countData[index] = data.count;
                }
            });
        }
    });
    
    // 按总下载量排序文件
    const sortedFiles = Array.from(fileCountTrendMap.entries())
        .sort(([, a], [, b]) => {
            const totalA = a.reduce((sum, val) => sum + val, 0);
            const totalB = b.reduce((sum, val) => sum + val, 0);
            return totalB - totalA;
        });
    
    // 初始化下拉选择框
    fileSelector.innerHTML = `
        <option value="total">总趋势</option>
    `;
    
    // 添加文件选项
    sortedFiles.forEach(([file]) => {
        const option = document.createElement('option');
        option.value = file;
        option.textContent = file;
        fileSelector.appendChild(option);
    });
    
    // 创建图表渲染函数
    const renderChart = (selectedValue) => {
        let datasets = [];
        let chartTitle = '';
        
        // 根据选择的值获取对应的数据
        let countData, userData;
        if (selectedValue === 'total') {
            // 总的趋势：显示所有文件的总下载次数和用户数
            countData = trendData.map(item => item.total);
            userData = trendData.map(item => item.uniqueUsers);
            chartTitle = '总下载趋势';
        } else {
            // 特定文件趋势
            const fileData = fileTrendMap.get(selectedValue);
            if (fileData) {
                countData = fileData.countData;
                userData = fileData.userData;
                chartTitle = `${selectedValue} 下载趋势`;
            } else {
                // 如果文件数据不存在，使用空数组
                countData = [];
                userData = [];
            }
        }
        
        // 构建datasets（使用统一的配置，只有数据来源不同）
        datasets = [
            {
                label: '下载次数',
                data: countData,
                borderColor: '#4bb543',
                backgroundColor: 'rgba(75, 181, 67, 0.1)',
                tension: 0.4,
                fill: true
            },
            {
                label: '下载用户数',
                data: userData,
                borderColor: '#9d4edd',
                backgroundColor: 'rgba(157, 78, 221, 0.1)',
                tension: 0.4,
                fill: true
            }
        ];

        // 销毁旧图表实例
        if (downloadTrendChart && typeof downloadTrendChart.destroy === 'function') {
            downloadTrendChart.destroy();
        }

        // 创建新图表
        downloadTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
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
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            maxWidth: 250,
                            font: {
                                size: 11
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: chartTitle
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    };
    
    // 初始渲染
    renderChart('total');
    
    // 添加下拉选择框事件监听
    fileSelector.addEventListener('change', (e) => {
        renderChart(e.target.value);
    });
}