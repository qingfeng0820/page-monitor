// UI操作相关函数

// 显示加载状态
function showLoadingState() {
    const statValues = document.querySelectorAll('.stat-value');
    statValues.forEach(value => {
        value.innerHTML = '<div class="spinner" style="width:20px;height:20px;"></div>';
    });
}

// 显示错误状态
function showErrorState(message) {
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        const content = card.querySelector('.chart-container, .data-table');
        if (content) {
            const errorHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div>${t('dataLoadFailed')}</div>
                    <div style="font-size: 0.9rem; margin-top: 10px;">${message}</div>
                    <button onclick="loadData()" class="refresh-btn" style="margin-top: 15px;">
                        <i class="fas fa-redo"></i> ${t('reload')}
                    </button>
                </div>
            `;
            content.innerHTML = errorHTML;
        }
    });
}

// 设置标签切换
function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            const parentCard = this.closest('.card');
            
            // 只在当前卡片内切换，不影响其他卡片
            const cardTabs = parentCard.querySelectorAll('.tab');
            const cardContents = parentCard.querySelectorAll('.dimension-content');
            
            // 移除当前卡片内所有active类
            cardTabs.forEach(t => t.classList.remove('active'));
            cardContents.forEach(c => c.classList.remove('active'));
            
            // 添加active类到当前标签和内容
            this.classList.add('active');
            const targetContent = parentCard.querySelector(`#${tabId}`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
            
            // 重新渲染图表（如果需要）
            if (tabId === 'urls' && urlChart) {
                urlChart.update();
            } else if (tabId === 'browsers' && browserChart) {
                browserChart.update();
            } else if (tabId === 'os' && osChart) {
                osChart.update();
            } else if (tabId === 'devices' && deviceChart) {
                deviceChart.update();
            } else if (tabId === 'users' && userChart) {
                userChart.update();
            } else if (tabId === 'ips' && ipChart) {
                ipChart.update();
            } else if (tabId === 'combinations' && combinationChart) {
                combinationChart.update();
            } else if (tabId === 'sources' && window.urlSourceChart) {
                window.urlSourceChart.update();
            } else if (tabId === 'downloadFiles' && downloadFileChart) {
                downloadFileChart.update();
            } else if (tabId === 'downloadSources' && downloadSourceChart) {
                downloadSourceChart.update();
            } else if (tabId === 'downloadUsers' && downloadUserChart) {
                downloadUserChart.update();
            } else if (tabId === 'downloadIPs' && downloadIpChart) {
                downloadIpChart.update();
            } else if (tabId === 'eventTypes' && eventTypeChart) {
                eventTypeChart.update();
            } else if (tabId === 'eventCategories' && eventCategoryChart) {
                eventCategoryChart.update();
            } else if (tabId === 'eventActions' && eventActionChart) {
                eventActionChart.update();
            } else if (tabId === 'eventLabels' && eventLabelChart) {
                eventLabelChart.update();
            } else if (tabId === 'eventSelectors' && eventSelectorChart) {
                eventSelectorChart.update();
            } else if (tabId === 'eventUsers' && eventUserChart) {
                eventUserChart.update();
            } else if (tabId === 'eventIPs' && eventIpChart) {
                eventIpChart.update();
            } else if (tabId === 'eventCombinations' && eventCombinationChart) {
                eventCombinationChart.update();
            }
        });
    });
}

// 设置卡片最大化/还原功能
function setupMaximizeCards() {
    const maximizeBtns = document.querySelectorAll('.maximize-btn');
    maximizeBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const cardId = this.getAttribute('data-card');
            const card = document.getElementById(cardId);
            
            if (card) {
                // 检查是否已经最大化
                const isMaximized = card.classList.contains('maximized');
                
                if (isMaximized) {
                    // 还原卡片
                    card.classList.remove('maximized');
                    // 触发图表重绘以适应新尺寸
                    resizeChartsInCard(card);
                } else {
                    // 最大化卡片
                    card.classList.add('maximized');
                    // 触发图表重绘以适应新尺寸
                    resizeChartsInCard(card);
                }
            }
        });
    });
}

// 调整卡片内所有图表的大小
function resizeChartsInCard(card) {
    // 延迟一点时间，确保DOM尺寸已经更新
    setTimeout(() => {
        // 获取卡片内的所有图表容器
        const chartContainers = card.querySelectorAll('.chart-container canvas');
        chartContainers.forEach(canvas => {
            // 获取图表实例
            const chart = Chart.getChart(canvas);
            if (chart) {
                chart.resize();
            }
        });
    }, 100);
}

// UI功能已经在main.js中初始化
// 此文件中的函数将由main.js调用