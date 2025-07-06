// Gantt Chart Module - Professional Edition

function daysBetween(d1, d2) {
    // Use UTC dates to ignore timezone and DST changes
    const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
    const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
    return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
}

function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

function generateTimelineHeader(timelineStart, timelineEnd, config) {
    const { scale, dayCellWidth } = config;
    
    // Calculate total timeline width first for precise alignment
    const totalDays = Math.ceil((timelineEnd - timelineStart) / 86400000);
    const totalWidth = totalDays * dayCellWidth;
    
    const topRowFrag = document.createDocumentFragment();
    const bottomRowFrag = document.createDocumentFragment();
    
    const topCellCache = new Map(); // Use Map for ordered iteration
    let currentWidth = 0;
    let current = new Date(timelineStart);
    
    // Normalize start date to avoid fractional positioning
    current.setHours(0, 0, 0, 0);
    const normalizedEnd = new Date(timelineEnd);
    normalizedEnd.setHours(23, 59, 59, 999);

    while (current <= normalizedEnd) {
        let topKey = '';
        let bottomText = '';
        let unitDays = 0;
        const next = new Date(current);

        switch (scale) {
            case 'year':
                topKey = 'Years';
                bottomText = current.getFullYear().toString();
                next.setFullYear(current.getFullYear() + 1);
                next.setMonth(0, 1);
                next.setHours(0, 0, 0, 0);
                unitDays = daysBetween(current, next);
                break;
                
            case 'quarter':
                topKey = current.getFullYear().toString();
                const quarter = Math.floor(current.getMonth() / 3) + 1;
                bottomText = `Q${quarter}`;
                const quarterStartMonth = (quarter - 1) * 3;
                next.setFullYear(current.getFullYear());
                next.setMonth(quarterStartMonth + 3, 1);
                next.setHours(0, 0, 0, 0);
                unitDays = daysBetween(current, next);
                break;
                
            case 'month':
                topKey = current.getFullYear().toString();
                bottomText = current.toLocaleString('default', { month: 'short' });
                next.setMonth(current.getMonth() + 1, 1);
                next.setHours(0, 0, 0, 0);
                unitDays = daysBetween(current, next);
                break;
                
            case 'week':
                // Get Monday of current week
                const dayOfWeek = current.getDay();
                const monday = new Date(current);
                monday.setDate(current.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
                monday.setHours(0, 0, 0, 0);
                
                topKey = `${monday.toLocaleString('default', { month: 'short' })} ${monday.getFullYear()}`;
                bottomText = `${monday.getDate()}`;
                
                next.setTime(monday.getTime());
                next.setDate(monday.getDate() + 7);
                unitDays = 7;
                current = new Date(monday); // Align to Monday
                break;
                
            default: // day
                topKey = current.toLocaleString('default', { month: 'long', year: 'numeric' });
                bottomText = current.getDate().toString();
                next.setDate(current.getDate() + 1);
                next.setHours(0, 0, 0, 0);
                unitDays = 1;
                break;
        }

        // Calculate exact pixel width
        const unitWidth = unitDays * dayCellWidth;
        
        // Create bottom cell (actual time unit)
        const bottomCell = document.createElement('div');
        bottomCell.className = 'timeline-cell';
        bottomCell.textContent = bottomText;
        bottomCell.style.width = `${unitWidth}px`;
        bottomCell.style.minWidth = `${unitWidth}px`;
        bottomCell.style.maxWidth = `${unitWidth}px`;
        bottomCell.style.boxSizing = 'border-box';
        bottomCell.style.flexShrink = '0';
        bottomRowFrag.appendChild(bottomCell);

        // Accumulate top cell widths
        if (!topCellCache.has(topKey)) {
            topCellCache.set(topKey, 0);
        }
        topCellCache.set(topKey, topCellCache.get(topKey) + unitWidth);
        
        currentWidth += unitWidth;
        current = next;
    }

    // Create top row cells (grouped periods)
    for (const [key, width] of topCellCache) {
        const topCell = document.createElement('div');
        topCell.className = 'timeline-cell';
        topCell.textContent = key;
        topCell.style.width = `${width}px`;
        topCell.style.minWidth = `${width}px`;
        topCell.style.maxWidth = `${width}px`;
        topCell.style.boxSizing = 'border-box';
        topCell.style.flexShrink = '0';
        topRowFrag.appendChild(topCell);
    }
    
    const topRow = document.createElement('div');
    topRow.className = 'timeline-row';
    topRow.appendChild(topRowFrag);

    const bottomRow = document.createElement('div');
    bottomRow.className = 'timeline-row';
    bottomRow.appendChild(bottomRowFrag);
    
    const container = document.createElement('div');
    container.appendChild(topRow);
    container.appendChild(bottomRow);
    
    return { headerHtml: container.innerHTML, totalWidth: currentWidth };
}

function generateGanttGrid(timelineStart, timelineEnd, config, totalWidth) {
    const { scale, dayCellWidth } = config;
    const gridFrag = document.createDocumentFragment();

    let current = new Date(timelineStart);
    current.setHours(0, 0, 0, 0);
    const normalizedEnd = new Date(timelineEnd);
    normalizedEnd.setHours(23, 59, 59, 999);

    while (current <= normalizedEnd) {
        let unitDays = 0;
        const next = new Date(current);

        switch (scale) {
            case 'year':
                next.setFullYear(current.getFullYear() + 1);
                next.setMonth(0, 1);
                next.setHours(0, 0, 0, 0);
                unitDays = daysBetween(current, next);
                break;
            case 'quarter':
                const quarter = Math.floor(current.getMonth() / 3) + 1;
                const quarterStartMonth = (quarter - 1) * 3;
                next.setFullYear(current.getFullYear());
                next.setMonth(quarterStartMonth + 3, 1);
                next.setHours(0, 0, 0, 0);
                unitDays = daysBetween(current, next);
                break;
            case 'month':
                next.setMonth(current.getMonth() + 1, 1);
                next.setHours(0, 0, 0, 0);
                unitDays = daysBetween(current, next);
                break;
            case 'week':
                const dayOfWeek = current.getDay();
                const monday = new Date(current);
                monday.setDate(current.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
                monday.setHours(0, 0, 0, 0);
                next.setTime(monday.getTime());
                next.setDate(monday.getDate() + 7);
                unitDays = 7;
                current = new Date(monday);
                break;
            default: // day
                unitDays = 1;
                next.setDate(current.getDate() + 1);
                next.setHours(0, 0, 0, 0);
                break;
        }

        const unitWidth = unitDays * dayCellWidth;
        const gridCell = document.createElement('div');
        gridCell.className = 'grid-cell';
        gridCell.style.width = `${unitWidth}px`;
        gridCell.style.minWidth = `${unitWidth}px`;
        gridFrag.appendChild(gridCell);

        current = next;
    }

    const gridContainer = document.createElement('div');
    gridContainer.className = 'gantt-grid';
    gridContainer.style.width = `${totalWidth}px`;
    gridContainer.appendChild(gridFrag);
    
    return gridContainer;
}

window.renderGanttChart = (project, tasks, config) => {
    // Use the config parameter directly instead of assigning to ganttConfig 
    console.log('renderGanttChart called with config:', config);
    
    const dateRange = getOverallDateRange(tasks);
    if (!dateRange.start || !dateRange.end) {
        console.error("Gantt chart cannot be rendered without a valid date range.");
        return;
    }
    const { start: rawProjectStartDate, end: projectEndDate } = dateRange;

    // --- Timeline Start Date Normalization ---
    // The actual timeline rendering must start at an aligned date (e.g., a Monday)
    // to ensure bars and headers are perfectly in sync.
    let timelineStartDate = new Date(rawProjectStartDate);
    switch (config.scale) {
        case 'week': {
            const dayOfWeek = timelineStartDate.getDay(); // 0=Sun, 1=Mon
            const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Calculate days to subtract to get to Monday
            timelineStartDate.setDate(timelineStartDate.getDate() - offset);
            break;
        }
        case 'month':
            timelineStartDate.setDate(1); // First day of the month
            break;
        case 'quarter': {
            const quarterStartMonth = Math.floor(timelineStartDate.getMonth() / 3) * 3;
            timelineStartDate.setDate(1);
            timelineStartDate.setMonth(quarterStartMonth);
            break;
        }
        case 'year':
            timelineStartDate.setMonth(0, 1); // January 1st
            break;
    }
    timelineStartDate.setHours(0, 0, 0, 0);
    // --- End Normalization ---

    console.log('Date range:', timelineStartDate, 'to', projectEndDate);

    const timelineHeader = document.getElementById('timeline-header');
    const ganttScrollWrapper = document.getElementById('gantt-scroll-wrapper');
    const ganttBody = document.getElementById('gantt-body');
    const ganttBars = document.getElementById('gantt-bars');
    const horizontalScrollContent = document.getElementById('horizontal-scroll-content');

    if(!timelineHeader || !ganttScrollWrapper || !ganttBody || !ganttBars || !horizontalScrollContent){
        console.error("Gantt container elements not found in the DOM.");
        return;
    }

    timelineHeader.innerHTML = '';
    ganttBars.innerHTML = '';

    const { headerHtml, totalWidth } = generateTimelineHeader(timelineStartDate, projectEndDate, config);
    console.log('Generated timeline header, totalWidth:', totalWidth);
    timelineHeader.innerHTML = headerHtml;
    
    // Set the timeline header content width
    const timelineRows = timelineHeader.querySelectorAll('.timeline-row');
    timelineRows.forEach(row => {
        row.style.width = `${totalWidth}px`;
    });
    console.log('Timeline header rows updated, count:', timelineRows.length);
    
    // Set content widths
    ganttBody.style.width = `${totalWidth}px`;
    ganttBars.style.width = `${totalWidth}px`;
    ganttBars.style.minWidth = `${totalWidth}px`;
    
    // Set horizontal scroll content width
    horizontalScrollContent.style.width = `${totalWidth}px`;
    
    // Remove the old grid-drawing method and use the new dynamic one
    ganttBody.classList.remove('with-grid');
    const existingGrid = ganttBody.querySelector('.gantt-grid');
    if (existingGrid) {
        ganttBody.removeChild(existingGrid);
    }
    const gridContainer = generateGanttGrid(timelineStartDate, projectEndDate, config, totalWidth);
    // --- Dikey grid çizgilerinin yüksekliğini ayarla ---
    const totalHeight = tasks.length * config.rowHeight;
    gridContainer.style.height = totalHeight + 'px';
    // --- gridContainer'ı ekle ---
    ganttBody.insertBefore(gridContainer, ganttBars);
    // Calculate total height needed for all tasks
    ganttBars.style.height = `${totalHeight}px`;
    ganttBars.style.minHeight = `${totalHeight}px`;
    
    // Enhanced task processing with better type detection
    console.log('Creating bars for', tasks.length, 'tasks');
    tasks.forEach(task => {
        const rowContainer = document.createElement('div');
        rowContainer.className = 'gantt-row-container';
        // Force exact height to match WBS rows and prevent alignment drift
        rowContainer.style.height = `${config.rowHeight}px`;
        rowContainer.style.minHeight = `${config.rowHeight}px`;
        rowContainer.style.maxHeight = `${config.rowHeight}px`;
        rowContainer.style.boxSizing = 'border-box';
        rowContainer.dataset.taskId = task.id;

        const bar = createGanttBar(task, timelineStartDate, config);
        if (bar) {
            rowContainer.appendChild(bar);
        }
        ganttBars.appendChild(rowContainer);
    });
    console.log('Gantt chart rendering completed');
};

function createGanttBar(task, projectStartDate, config) {
    console.log('Creating bar for task:', task.name, 'with dayCellWidth:', config.dayCellWidth);
    
    // Enhanced milestone detection
    const isMilestone = task.type === 'TT_FinMile' || task.type === 'TT_StartMile' || 
                       (task.startDate && task.finishDate && 
                        new Date(task.startDate).getTime() === new Date(task.finishDate).getTime());
    
    if (isMilestone) {
        const milestoneDate = task.finishDate || task.startDate;
        if (!milestoneDate) return null;

        const milestone = document.createElement('div');
        milestone.className = 'milestone';
        
        const date = new Date(milestoneDate);
        date.setHours(0, 0, 0, 0);

        const startOffset = daysBetween(projectStartDate, date) * config.dayCellWidth;
        console.log('Milestone positioned at:', startOffset, 'px');
        
        milestone.style.left = `${startOffset}px`;
        milestone.title = `${task.name} - ${date.toLocaleDateString()}`;
        return milestone;
    }

    if (!task.startDate || !task.finishDate) {
        console.log('Task has no dates, skipping:', task.name);
        return null;
    }

    const start = new Date(task.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(task.finishDate);
    end.setHours(0, 0, 0, 0);
    
    const startOffset = daysBetween(projectStartDate, start) * config.dayCellWidth;
    const durationDays = Math.max(1, daysBetween(start, end) + 1);
    const barWidth = durationDays * config.dayCellWidth;
    
    console.log('Task bar:', task.name, 'startOffset:', startOffset, 'width:', barWidth);

    const taskBar = document.createElement('div');
    taskBar.className = 'task-bar';
    taskBar.style.left = `${startOffset}px`;
    taskBar.style.width = `${barWidth}px`;
    
    // Enhanced task type detection
    const isSummary = task.type === 'TT_WBS' || (task.children && task.children.length > 0);
    const isCritical = task.critical_activity_flag === 'Y';
    
    if (isSummary) {
        taskBar.classList.add('summary-task');
    }
    
    if (isCritical) {
        taskBar.classList.add('critical');
    }
    
    // Add progress indicator if available
    if (task.phys_complete_pct && task.phys_complete_pct > 0) {
        const progressBar = document.createElement('div');
        progressBar.className = 'progress';
        progressBar.style.width = `${task.phys_complete_pct}%`;
        taskBar.appendChild(progressBar);
    }
    
    const taskLabel = document.createElement('span');
    taskLabel.textContent = task.name;
    taskLabel.style.position = 'relative';
    taskLabel.style.zIndex = '2';
    taskBar.appendChild(taskLabel);
    
    // Add tooltip with detailed information
    taskBar.title = `${task.name}\nStart: ${start.toLocaleDateString()}\nFinish: ${end.toLocaleDateString()}\nDuration: ${durationDays} days`;
    if (task.phys_complete_pct) {
        taskBar.title += `\nProgress: ${task.phys_complete_pct}%`;
    }
    
    return taskBar;
}

function getOverallDateRange(tasks) {
    const validTasks = tasks.filter(t => (t.startDate || t.finishDate));
    if (validTasks.length === 0) {
        return { start: null, end: null };
    }
    
    let minDate = new Date(Math.min(...validTasks.map(t => new Date(t.startDate || t.finishDate).getTime())));
    let maxDate = new Date(Math.max(...validTasks.map(t => new Date(t.finishDate || t.startDate).getTime())));

    minDate.setHours(0, 0, 0, 0);
    maxDate.setHours(23, 59, 59, 999);
    
    // Add padding but keep it reasonable
    minDate.setDate(minDate.getDate() - 7); 
    maxDate.setDate(maxDate.getDate() + 14);

    return { start: minDate, end: maxDate };
} 