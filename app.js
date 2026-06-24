// 全局变量
let map = null;
let markers = [];
let houseData = [];
let filteredListings = [];
let activeMarker = null;
let aiOverlay = null;

// 筛选状态
const filterState = {
    keyword: '',
    price: 'all',
    subway: 'all',
    ai: 'all',
    district: 'all',
    aiFilter: 'all'  // AI 智能筛选
};

// AI 筛选权重配置
const aiFilterWeights = {
    all: { mrt: 0.2, budget: 0.2, solo: 0.2, family: 0.2, cbd: 0.2 },
    mrt: { mrt: 0.6, budget: 0.1, solo: 0.1, family: 0.1, cbd: 0.1 },
    budget: { mrt: 0.15, budget: 0.5, solo: 0.15, family: 0.1, cbd: 0.1 },
    solo: { mrt: 0.2, budget: 0.2, solo: 0.4, family: 0.05, cbd: 0.15 },
    family: { mrt: 0.1, budget: 0.2, solo: 0.05, family: 0.5, cbd: 0.15 },
    cbd: { mrt: 0.2, budget: 0.1, solo: 0.15, family: 0.1, cbd: 0.45 }
};

// AI 筛选推荐语
const aiFilterLabels = {
    all: '综合推荐',
    mrt: '地铁沿线推荐',
    budget: '预算友好推荐',
    solo: '独居首选推荐',
    family: '家庭宜居推荐',
    cbd: 'CBD可达推荐'
};

// 计算动态 AI 评分
function calculateDynamicScore(house, filterType) {
    const factors = house.aiFactors || { mrt: 5, budget: 5, solo: 5, family: 5, cbd: 5 };
    const weights = aiFilterWeights[filterType] || aiFilterWeights.all;
    
    const score = (
        factors.mrt * weights.mrt +
        factors.budget * weights.budget +
        factors.solo * weights.solo +
        factors.family * weights.family +
        factors.cbd * weights.cbd
    ) * 10;
    
    return Math.round(score);
}

// 初始化地图
function initMap() {
    map = new AMap.Map('map', {
        center: [120.62, 31.32],
        zoom: 12,
        viewMode: '2D'
    });
}

// 加载房源数据
async function loadHouseData() {
    try {
        const response = await fetch('geo_data.json');
        houseData = await response.json();
        applyFilters();
    } catch (error) {
        console.error('加载房源数据失败:', error);
    }
}

// 渲染房源列表
function renderHouseList() {
    const houseList = document.getElementById('houseList');
    const resultCount = document.getElementById('resultCount');
    houseList.innerHTML = '';

    const total = filteredListings.length;
    resultCount.textContent = total > 0
        ? `${total} 个房源`
        : '无房源';

    if (total === 0) {
        houseList.innerHTML = `
            <div class="empty-state fade-in-empty">
                <div class="empty-icon">🔍</div>
                <div class="empty-text">暂无符合条件的房源</div>
                <div class="empty-subtext">试试调整筛选条件或搜索其他区域</div>
            </div>
        `;
        return;
    }

    filteredListings.forEach((house, index) => {
        const lat = house['latitude'];
        const lng = house['longitude'];

        if (!lat || !lng) return;

        const card = document.createElement('div');
        card.className = 'house-card';
        card.dataset.index = index;

        const dynamicScore = calculateDynamicScore(house, filterState.aiFilter);
        const filterLabel = aiFilterLabels[filterState.aiFilter];
        const isTopMatch = index === 0;
        
        const tags = house['tags'] || [];
        const tagsHtml = tags.map(tag => `<span class="tag">${tag}</span>`).join('');

        // AI Score Badge HTML
        const scoreBadgeHtml = `
            <div class="ai-score-badge-card">
                <span class="ai-score-label-card">AI</span>
                <span class="ai-score-value-card">${dynamicScore}</span>
            </div>
        `;

        card.innerHTML = `
            <div class="house-card-header">
            <div class="house-name-row">
                <div class="house-name">
                ${house['房源名称'] || '暂无名称'}
                </div>
                ${isTopMatch ? `
                <span class="best-match-badge">
                推荐房源
                </span>
                ` : ''}
                </div>
                ${scoreBadgeHtml}
            </div>
            <div class="house-price">¥${house['价格'] || '暂无价格'}</div>
            <div class="house-address">📍 ${house['地址'] || '暂无地址'}</div>
            <div class="tags-container">
                ${tagsHtml || '<span class="tag">暂无标签</span>'}
            </div>
        `;

        card.addEventListener('click', () => {
            setActiveCard(index);
            flyToMarker(index);
            updateAiOverlay(index, dynamicScore);
        });

        houseList.appendChild(card);
    });
}

// 设置活动卡片
function setActiveCard(index) {
    document.querySelectorAll('.house-card').forEach(c => c.classList.remove('active'));
    const card = document.querySelector(`.house-card[data-index="${index}"]`);
    if (card) {
        card.classList.add('active');
    }
}

// 飞到指定 Marker
function flyToMarker(index) {
    const marker = markers[index];
    if (!marker) return;

    const position = marker.getPosition();

    if (activeMarker && activeMarker !== marker) {
        resetMarkerStyle(activeMarker);
    }

    highlightMarker(marker);
    activeMarker = marker;

    // 点击卡片聚焦，显示小区名字与地理锚点
    map.setZoomAndCenter(14.5, position);
}

// 高亮 Marker
function highlightMarker(marker) {
    const content = marker.getContent();
    if (content) {
        content.classList.add('active');
    }
}

// 重置 Marker 样式
function resetMarkerStyle(marker) {
    if (!marker) return;
    const content = marker.getContent();
    if (content) {
        content.classList.remove('active');
    }
}

// 在地图上添加标记
function addMarkersToMap() {
    markers.forEach(marker => map.remove(marker));
    markers = [];
    activeMarker = null;

    filteredListings.forEach((house, index) => {
        const lat = house['latitude'];
        const lng = house['longitude'];
        if (!lat || !lng) return;

        const isBestMatch = index === 0;
        const markerContent = document.createElement('div');
        markerContent.className = isBestMatch ? 'map-marker best-match' : 'map-marker';

        // 添加 AI Pulse Ring
        const ring = document.createElement('div');
        ring.className = 'map-marker-ring';
        markerContent.appendChild(ring);

        const marker = new AMap.Marker({
            position: [lng, lat],
            map: map,
            title: house['房源名称'],
            content: markerContent,
            zIndex: 200
        });

        marker.houseIndex = index;
        markers[index] = marker;

        marker.on('click', (e) => {
            if (activeMarker && activeMarker !== marker) {
                resetMarkerStyle(activeMarker);
            }

            highlightMarker(marker);
            activeMarker = marker;

            const dynamicScore = calculateDynamicScore(house, filterState.aiFilter);
            setActiveCard(index);
            updateAiOverlay(index, dynamicScore);

            const card = document.querySelector(`.house-card[data-index="${index}"]`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            
            // 点击卡片聚焦，显示小区名字与地理锚点
            map.setZoomAndCenter(14.5, [lng, lat]);
        });
    });
}

/**
 * 应用所有筛选条件
 */
function applyFilters() {
    filteredListings = houseData.filter(house => {
        if (filterState.keyword) {
            const lowerKeyword = filterState.keyword.toLowerCase();
            const title = (house['房源名称'] || '').toLowerCase();
            const address = (house['地址'] || '').toLowerCase();
            const tags = (house['tags'] || []).map(t => t.toLowerCase()).join(' ');
            if (!title.includes(lowerKeyword) &&
                !address.includes(lowerKeyword) &&
                !tags.includes(lowerKeyword)) {
                return false;
            }
        }

        if (filterState.price !== 'all') {
            const price = house['price'] || 0;
            switch (filterState.price) {
                case '0-1000':
                    if (price >= 1000) return false;
                    break;
                case '1000-2000':
                    if (price < 1000 || price > 2000) return false;
                    break;
                case '2000+':
                    if (price <= 2000) return false;
                    break;
            }
        }

        if (filterState.subway !== 'all') {
            const distance = house['distance_subway'] || 9999;
            const maxDistance = parseInt(filterState.subway);
            if (distance > maxDistance) return false;
        }

        if (filterState.ai === 'recommended') {
            if (!house['is_ai_recommended']) return false;
        }

        if (filterState.district !== 'all') {
            if (house['district'] !== filterState.district) return false;
        }

        return true;
    });

    // 根据 AI 筛选重新排序 - 始终按 dynamicScore 降序排列
    filteredListings.sort((a, b) => {
        const scoreA = calculateDynamicScore(a, filterState.aiFilter);
        const scoreB = calculateDynamicScore(b, filterState.aiFilter);
        return scoreB - scoreA;
    });

    activeMarker = null;
    hideAiOverlay();
    renderHouseList();
    addMarkersToMap();
    
    // 地图根据房源数量自动 fitView
    const visibleMarkers = markers.filter(m => m.visible !== false);
    if (visibleMarkers.length > 0) {
        map.setFitView(
            visibleMarkers,
            false,
            [120, 120, 120, 420]
        );
        // 限制最高 zoom，确保能看到周边环境
        const currentZoom = map.getZoom();
        // 单房源默认14，看区域上下文
        if (visibleMarkers.length === 1 && currentZoom > 14) {
            map.setZoom(14);
        }
        // 其余情况保持原逻辑
        else if (currentZoom > 15) {
            map.setZoom(15);
        }
    }
}

// 初始化筛选器
function initFilters() {
    const filterOptions = document.querySelectorAll('.filter-options');
    
    filterOptions.forEach(container => {
        const filterType = container.dataset.filter;
        const buttons = container.querySelectorAll('.filter-btn');
        
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filterState[filterType] = btn.dataset.value;
                applyFilters();
            });
        });
    });
}

// 初始化 AI 智能筛选 Chips
function initAiFilterChips() {
    const chips = document.querySelectorAll('.ai-chip');
    
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            const filterType = chip.dataset.filter;
            
            // 移除同级 active 状态
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            
            // 添加分析动画
            chip.classList.add('analyzing');
            setTimeout(() => chip.classList.remove('analyzing'), 600);
            
            // 更新筛选状态
            filterState.aiFilter = filterType;
            
            // 应用筛选
            applyFilters();
        });
    });
}

// 搜索功能
function initSearch() {
    const searchInput = document.getElementById('searchInput');

    searchInput.addEventListener('input', () => {
        filterState.keyword = searchInput.value.trim();
        applyFilters();
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            filterState.keyword = searchInput.value.trim();
            applyFilters();
        }
    });
}

// 显示 AI 浮层
function showAiOverlay() {
    if (aiOverlay) {
        aiOverlay.classList.add('visible');
    }
}

// 隐藏 AI 浮层
function hideAiOverlay() {
    if (aiOverlay) {
        aiOverlay.classList.remove('visible');
    }
}

// 关闭 AI 浮层（供HTML按钮调用）
function closeAiOverlay() {
    hideAiOverlay();
}

// 更新 AI 浮层内容
function updateAiOverlay(index, dynamicScore) {
    const house = filteredListings[index];
    if (!house || !house.analysis) return;

    const analysis = house.analysis;
    const reasoningDot = document.getElementById('reasoningDot');
    
    // 重置动画状态
    resetAiOverlayAnimation();
    
    // 更新内容
    document.getElementById('aiPropertyName').textContent = house['房源名称'] || '未知房源';
    document.getElementById('aiRentRange').textContent = `¥${analysis.rentRange || '--'} / 月`;
    
    // 显示 reasoning dot - 先重置状态再启动动画
    reasoningDot.classList.remove('idle');
    reasoningDot.classList.remove('active');
    
    void reasoningDot.offsetWidth;
    
    reasoningDot.classList.add('active');
    
    // 2秒后进入 idle 状态
    setTimeout(() => {
        reasoningDot.classList.remove('active');
        reasoningDot.classList.add('idle');
    }, 2000);
    
    // 显示浮层
    showAiOverlay();
    
    // 延迟添加动画类，实现推理流效果
    setTimeout(() => {
        // 推荐原因 section - 180ms
        const analysisSection = document.querySelector('.ai-analysis-section');
        const analysisLabel = analysisSection.querySelector('.ai-section-label');
        const analysisText = analysisSection.querySelector('.ai-analysis-text');
        
        analysisText.textContent = analysis.summary || '暂无分析';
        
        analysisLabel.classList.add('reasoning-item');
        analysisLabel.style.animationName = 'reasoningFadeIn';
        analysisLabel.classList.add('reasoning-delay-180');
        
        analysisText.classList.add('reasoning-item');
        analysisText.style.animationName = 'reasoningFadeIn';
        analysisText.classList.add('reasoning-delay-260');
        
        // 匹配依据 section - 520ms
        const prosSection = document.querySelector('.ai-pros');
        const prosLabel = prosSection.querySelector('.ai-section-label');
        const prosList = document.getElementById('aiPros');
        
        prosList.innerHTML = '';
        (analysis.pros || []).forEach((pro, i) => {
            const li = document.createElement('li');
            li.textContent = pro;
            li.classList.add('reasoning-item');
            li.style.animationName = 'reasoningFadeIn';
            li.classList.add(i === 0 ? 'reasoning-delay-620' : 'reasoning-delay-720');
            prosList.appendChild(li);
        });
        
        prosLabel.classList.add('reasoning-item');
        prosLabel.style.animationName = 'reasoningFadeIn';
        prosLabel.classList.add('reasoning-delay-520');
        
        // 需要注意 section - 900ms
        const consSection = document.querySelector('.ai-cons');
        const consLabel = consSection.querySelector('.ai-section-label');
        const consList = document.getElementById('aiCons');
        
        consList.innerHTML = '';
        (analysis.cons || []).forEach((con, i) => {
            const li = document.createElement('li');
            li.textContent = con;
            li.classList.add('reasoning-item');
            li.style.animationName = 'reasoningFadeIn';
            li.classList.add(i === 0 ? 'reasoning-delay-1020' : 'reasoning-delay-1120');
            consList.appendChild(li);
        });
        
        consLabel.classList.add('reasoning-item');
        consLabel.style.animationName = 'reasoningFadeIn';
        consLabel.classList.add('reasoning-delay-900');
    }, 50);
}

// 重置 AI 浮层动画状态
function resetAiOverlayAnimation() {
    const reasoningDot = document.getElementById('reasoningDot');
    
    reasoningDot.classList.remove('active');
    reasoningDot.classList.remove('idle');
    
    // 移除所有 reasoning-item 类
    document.querySelectorAll('.reasoning-item').forEach(item => {
        item.classList.remove('reasoning-item');
        item.classList.remove('reasoning-delay-180');
        item.classList.remove('reasoning-delay-260');
        item.classList.remove('reasoning-delay-360');
        item.classList.remove('reasoning-delay-520');
        item.classList.remove('reasoning-delay-620');
        item.classList.remove('reasoning-delay-720');
        item.classList.remove('reasoning-delay-900');
        item.classList.remove('reasoning-delay-1020');
        item.classList.remove('reasoning-delay-1120');
        item.style.animationName = '';
    });
}

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initSearch();
    initFilters();
    initAiFilterChips();
    loadHouseData();
    aiOverlay = document.getElementById('aiOverlay');
});
