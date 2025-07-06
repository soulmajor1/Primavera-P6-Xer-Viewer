if (typeof ProjectManagement === 'undefined') {
    console.log("--- Main.js Sürüm 4.0 Yüklendi ve Çalıştırılıyor ---");
    const ProjectManagement = (function() {
        // --- MODULE STATE ---
        let projects = [];
        let currentProject = null;
        let ganttConfig = {
            scale: 'day',
            dayCellWidth: 30,
            rowHeight: 40
        };

        // --- CLASSES ---
        class Project {
            constructor(id, name) {
                this.id = id;
                this.name = name;
                this.tasks = [];
                this.resources = [];
                this.startDate = null;
                this.finishDate = null;
                this.status = 'notStarted';
                this.manager = '';
                this.strategicPriority = 'medium';
            }

            calculateProjectDates() {
                if (this.tasks.length === 0) return;
                const validTasks = this.tasks.filter(t => t.startDate && t.finishDate);
                if (validTasks.length === 0) return;
                this.startDate = new Date(Math.min(...validTasks.map(t => t.startDate.getTime())));
                this.finishDate = new Date(Math.max(...validTasks.map(t => t.finishDate.getTime())));
            }
        }

        class Task {
            constructor(id, name) {
                this.id = id;
                this.name = name;
                this.type = 'task';
                this.status = 'notStarted';
                this.startDate = null;
                this.finishDate = null;
                this.duration = 1;
                this.progress = 0;
                this.parent = null;
                this.children = [];
            }
        }

        // --- FILE HANDLING ---
        function handleXERUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const content = e.target.result;
                    const xerData = parseXERFile(content);
                    const newProject = convertXERDataToProject(xerData);
                    projects.push(newProject);
                    selectProject(newProject);
                    
                    // Make the bottom panel visible
                    const bottomPane = document.querySelector('.bottom-pane');
                    if (bottomPane) {
                        bottomPane.style.display = 'block'; 
                    }

                    // Switch to the 'Status' tab
                    document.querySelectorAll('.tab-pane').forEach(c => { 
                        c.classList.remove('active'); 
                        c.style.display = 'none'; 
                    });
                    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));

                    const statusTab = document.getElementById('statusTab');
                    const statusTabBtn = document.querySelector('.tab-button[onclick*="status"]');

                    if (statusTab) { 
                        statusTab.classList.add('active'); 
                        statusTab.style.display = 'block'; 
                    }
                    if (statusTabBtn) {
                        statusTabBtn.classList.add('active');
                    }

                } catch (error) {
                    console.error("Failed to process XER file:", error);
                    alert("Error: " + error.message);
                }
            };
            reader.readAsText(file);
        }

        function parseXERFile(content) {
            const lines = content.split(/\r?\n/);
            let currentTable = '';
            let headers = [];
            const xerData = { PROJECT: [], TASK: [], PROJWBS: [], TASKPRED: [], TASKRSRC: [] };

            for (const line of lines) {
                const parts = line.split('\t');
                const type = parts[0];
                if (type === '%T') {
                    currentTable = parts[1];
                    headers = [];
                } else if (type === '%F') {
                    headers = parts.slice(1);
                } else if (type === '%R' && xerData[currentTable]) {
                    const record = {};
                    headers.forEach((header, index) => {
                        record[header] = parts[index + 1];
                    });
                    xerData[currentTable].push(record);
                }
            }
            return xerData;
        }

        function parsePrimaveraDate(dateString) {
            if (!dateString || typeof dateString !== 'string') return null;

            // 1. Try direct parsing (handles ISO 8601 and other standard formats)
            let d = new Date(dateString);
            if (!isNaN(d.getTime())) {
                return d;
            }

            // 2. Try common Primavera format: "DD-MMM-YY HH:mm" e.g., "25-AUG-03 08:00"
            const monthMap = { 'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5, 'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11 };
            
            // Regex to handle "DD-MMM-YY" with optional "HH:mm" time
            const regex = /(\d{1,2})-([A-Z]{3})-(\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/;
            const match = dateString.toUpperCase().match(regex);

            if (match) {
                const day = parseInt(match[1], 10);
                const month = monthMap[match[2]];
                let year = parseInt(match[3], 10);
                const hours = parseInt(match[4], 10) || 0;
                const minutes = parseInt(match[5], 10) || 0;

                if (year < 100) {
                    // Heuristic for 2-digit years: >50 is 19xx, <=50 is 20xx
                    year += (year > 50) ? 1900 : 2000;
                }

                if (month !== undefined && !isNaN(day) && !isNaN(year)) {
                    d = new Date(year, month, day, hours, minutes);
                    if (!isNaN(d.getTime())) {
                        return d;
                    }
                }
            }
            
            // 3. Fallback for other potential formats, keep original logic as last resort
            const parts = dateString.toUpperCase().split(/[\s-]/);
            if (parts.length >= 3) {
                const day = parseInt(parts[0], 10);
                const monthStr = parts[1];
                let year = parseInt(parts[2], 10);
                if (!isNaN(day) && monthMap[monthStr] !== undefined && !isNaN(year)) {
                    if (year < 100) year += (year > 50 ? 1900 : 2000);
                    let hours = 0, minutes = 0;
                    if (parts.length > 3 && parts[3].includes(':')) {
                        const timeParts = parts[3].split(':');
                        hours = parseInt(timeParts[0], 10) || 0;
                        minutes = parseInt(timeParts[1], 10) || 0;
                    }
                    d = new Date(year, monthMap[monthStr], day, hours, minutes);
                    if (!isNaN(d.getTime())) return d;
                }
            }
            
            // If all parsing fails, log it and return null
            console.warn(`Could not parse date: "${dateString}"`);
            return null;
        }

        function convertXERDataToProject(xerData) {
            if (!xerData.PROJECT || xerData.PROJECT.length === 0) throw new Error("XER data missing project info.");
            const projData = xerData.PROJECT[0];
            const project = new Project(projData.proj_id, projData.proj_short_name);
            project.startDate = parsePrimaveraDate(projData.plan_start_date);
            project.finishDate = parsePrimaveraDate(projData.plan_end_date);

            const taskMap = new Map();
            const wbsMap = new Map();
            // --- Robust Activity ID Map ---
            const activityIdMap = {};
            project._activityIdMap = activityIdMap; // Attach to project for later use
            // --- Resource ID Map ---
            const resourceIdMap = {};
            if (xerData.RSRC) {
                xerData.RSRC.forEach(rsrc => {
                    resourceIdMap[rsrc.rsrc_id] = rsrc;
                });
            }
            project._resourceIdMap = resourceIdMap;
            if(xerData.PROJWBS){
                xerData.PROJWBS.forEach(wbs => {
                    wbsMap.set(wbs.wbs_id, wbs);
                });
            }

            if (xerData.TASK) {
                xerData.TASK.forEach(taskData => {
                    const task = new Task(taskData.task_id, taskData.task_name);
                    task.startDate = parsePrimaveraDate(taskData.start_date || taskData.early_start_date);
                    task.finishDate = parsePrimaveraDate(taskData.end_date || taskData.early_end_date);
                    task.wbs_id = taskData.wbs_id;
                    task.type = taskData.task_type || 'TT_Task';
                    task.task_type = taskData.task_type;
                    task.phys_complete_pct = parseFloat(taskData.phys_complete_pct) || 0;
                    task.critical_activity_flag = taskData.critical_activity_flag;
                    task.original_duration = (parseFloat(taskData.target_drtn_hr_cnt) || 0) / 8;
                    task.status = taskData.status_code || 'TK_NotStart';
                    
                    // --- Universal Dynamic Remaining Duration Calculation ---
                    let remainingDuration;
                    const today = new Date();
                    today.setHours(0, 0, 0, 0); // Normalize for accurate day difference

                    if (task.status === 'TK_Complete') {
                        remainingDuration = 0;
                    } else if (task.finishDate && !isNaN(task.finishDate.getTime())) {
                        if (task.finishDate < today) {
                            remainingDuration = 0; // The finish date is in the past
                        } else {
                            // Calculate days from today to the finish date
                            const timeDiff = task.finishDate.getTime() - today.getTime();
                            remainingDuration = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
                        }
                    } else {
                        // Fallback to original duration ONLY if there's no valid finish date
                        remainingDuration = task.original_duration;
                    }
                    task.remaining_duration = remainingDuration;
                    
                    task.budgeted_cost = parseFloat(taskData.target_cost) || 0;
                    task.earned_value = task.budgeted_cost * (task.phys_complete_pct / 100);
                    task.suspend_date = parsePrimaveraDate(taskData.suspend_date);
                    task.resume_date = parsePrimaveraDate(taskData.resume_date);
                    task.exp_finish_date = parsePrimaveraDate(taskData.exp_finish_date);
                    task.constraint_primary = taskData.constraint_type || 'none';
                    task.constraint_secondary = taskData.secondary_constraint_type || 'none';
                    task.labor_budgeted = taskData.target_labor_qty || '';
                    task.labor_actual = taskData.act_labor_qty || '';
                    task.labor_remaining = taskData.remain_labor_qty || '';
                    task.labor_at_complete = taskData.at_completion_labor_qty || '';
                    task.predecessors = [];
                    task.successors = [];
                    task.primary_resource = taskData.primary_resource || '';
                    // --- Add all possible ID formats to activityIdMap and taskMap ---
                    const id = task.id;
                    if (id) {
                        activityIdMap[id] = task;
                        activityIdMap[id.toString()] = task;
                        if (typeof id === 'string' && id.startsWith('A')) {
                            activityIdMap[id.slice(1)] = task;
                        } else {
                            activityIdMap['A' + id] = task;
                        }
                        // Add to taskMap with all variants
                        taskMap.set(id, task);
                        taskMap.set(id.toString(), task);
                        if (typeof id === 'string' && id.startsWith('A')) {
                            taskMap.set(id.slice(1), task);
                        } else {
                            taskMap.set('A' + id, task);
                        }
                    }
                    project.tasks.push(task);
                });
            }

            // --- Robust taskMap getter for relationship assignment ---
            function robustTaskMapGet(id) {
                if (!id) return undefined;
                return taskMap.get(id) ||
                       taskMap.get(id.toString()) ||
                       taskMap.get('A' + id) ||
                       (typeof id === 'string' && id.startsWith('A') ? taskMap.get(id.slice(1)) : undefined);
            }

            if (xerData.TASKPRED) {
                xerData.TASKPRED.forEach(pred => {
                    const fromTask = robustTaskMapGet(pred.task_id);
                    const toTask = robustTaskMapGet(pred.pred_task_id);
                    // Lag ve relation bilgisini de sakla
                    const rel = {
                        id: pred.pred_task_id,
                        type: pred.pred_type,
                        lag: pred.lag || pred.lag_days || '0d'
                    };
                    if (fromTask) {
                        fromTask.predecessors.push(rel);
                    }
                    if (toTask) {
                        // Successor için ters ilişki
                        toTask.successors.push({
                            id: pred.task_id,
                            type: pred.pred_type,
                            lag: pred.lag || pred.lag_days || '0d'
                        });
                    }
                });
            }

            // Step 2: Ensure every WBS node has a corresponding summary task object.
            // This guarantees the hierarchy skeleton is complete.
            wbsMap.forEach(wbs => {
                const wbsSummaryExists = project.tasks.some(t => t.wbs_id === wbs.wbs_id && t.task_type === 'TT_WBS');
                if (!wbsSummaryExists) {
                    const syntheticTask = new Task(`WBS_${wbs.wbs_id}`, wbs.wbs_name);
                    syntheticTask.wbs_id = wbs.wbs_id;
                    syntheticTask.task_type = 'TT_WBS';
                    syntheticTask.type = 'TT_WBS'; // Internal type
                    // Initialize properties to prevent runtime errors before calculation
                    syntheticTask.budgeted_cost = 0;
                    syntheticTask.original_duration = 0;
                    syntheticTask.remaining_duration = 0;
                    syntheticTask.startDate = null;
                    syntheticTask.finishDate = null;
                    project.tasks.push(syntheticTask);
                    taskMap.set(syntheticTask.id, syntheticTask);
                }
            });

            // Step 3: Build the hierarchy based on the complete task list.
            project.tasks.forEach(task => {
                const wbs = wbsMap.get(task.wbs_id);
                if (!wbs) return;

                // For a regular task, its parent is the summary task (TT_WBS) of its own WBS level.
                if (task.task_type !== 'TT_WBS') {
                    const summaryParent = project.tasks.find(p => p.wbs_id === task.wbs_id && p.task_type === 'TT_WBS');
                    if (summaryParent && summaryParent.id !== task.id) {
                        task.parent = summaryParent.id;
                        if (!summaryParent.children) summaryParent.children = [];
                        summaryParent.children.push(task.id);
                    }
                }
                // For a summary task, its parent is the summary task of the PARENT WBS level.
                else if (wbs.parent_wbs_id) {
                    const parentSummary = project.tasks.find(p => p.wbs_id === wbs.parent_wbs_id && p.task_type === 'TT_WBS');
                    if (parentSummary && parentSummary.id !== task.id) {
                        task.parent = parentSummary.id;
                        if (!parentSummary.children) parentSummary.children = [];
                        parentSummary.children.push(task.id);
                    }
                }
            });
            
            // After building hierarchy, calculate dates for summary tasks (WBS)
            const getTask = (id) => taskMap.get(id);
            const calculatedTasks = new Set();

            function calculateSummaryTaskDates(taskId) {
                if (calculatedTasks.has(taskId)) {
                    return; // Already processed
                }

                const task = getTask(taskId);
                // A summary task must have children to calculate from.
                if (!task || !task.children || task.children.length === 0) {
                    calculatedTasks.add(taskId);
                    return; 
                }

                let minStartDate = null;
                let maxFinishDate = null;
                let totalCost = 0;

                task.children.forEach(childId => {
                    const childTask = getTask(childId);
                    if (!childTask) return;

                    // If a child is itself a summary task, its data must be calculated first.
                    if (childTask.task_type === 'TT_WBS') {
                        calculateSummaryTaskDates(childId);
                    }

                    // Use the child's dates to find the summary task's range.
                    if (childTask.startDate && (!minStartDate || childTask.startDate < minStartDate)) {
                        minStartDate = childTask.startDate;
                    }
                    if (childTask.finishDate && (!maxFinishDate || childTask.finishDate > maxFinishDate)) {
                        maxFinishDate = childTask.finishDate;
                    }
                    
                    // Sum up the cost from all children.
                    if (childTask.budgeted_cost) {
                        totalCost += childTask.budgeted_cost;
                    }
                });

                // Assign calculated dates and cost to the summary task.
                if (minStartDate && maxFinishDate) {
                    task.startDate = minStartDate;
                    task.finishDate = maxFinishDate;
                     // Duration calculation
                    const durationMs = maxFinishDate.getTime() - minStartDate.getTime();
                    const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
                    task.original_duration = durationDays;
                    
                    // --- Dynamic Remaining Duration for Summary Tasks ---
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    if (maxFinishDate < today) {
                        task.remaining_duration = 0; // The entire WBS block is in the past
                    } else {
                        const timeDiff = maxFinishDate.getTime() - today.getTime();
                        task.remaining_duration = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
                    }
                }
                
                task.budgeted_cost = totalCost;

                calculatedTasks.add(taskId);
            }

            // Iterate through all tasks and trigger calculation for WBS summary tasks.
            project.tasks.forEach(task => {
                if (task.task_type === 'TT_WBS') {
                    calculateSummaryTaskDates(task.id);
                }
            });
            
            project.calculateProjectDates();

            // Resource assignments (TASKRSRC)
            if (xerData.TASKRSRC) {
                xerData.TASKRSRC.forEach(rsrc => {
                    const task = project.tasks.find(t => t.id == rsrc.task_id);
                    if (task) {
                        if (!task.resources) task.resources = [];
                        // Enrich resource assignment with name/short_name
                        const rsrcInfo = resourceIdMap[rsrc.rsrc_id];
                        if (rsrcInfo) {
                            rsrc.resource_name = rsrcInfo.rsrc_name || '';
                            rsrc.resource_short_name = rsrcInfo.rsrc_short_name || '';
                        }
                        task.resources.push(rsrc);
                    }
                });
            }

            return project;
        }

        // --- UI FUNCTIONS ---
        /*
        function refreshProjectList() {
            const container = document.getElementById('project-info-body');
            if(!container) return;
            container.innerHTML = '';

            if (!currentProject) return;

            const p = currentProject;
             const row = document.createElement('div');
             row.className = 'project-info-row';
             row.innerHTML = `
                <div>${p.id}</div>
                <div>${p.name}</div>
                <div>${p.tasks.length}</div>
                <div>${p.strategicPriority || 'N/A'}</div>
                <div>${p.startDate ? p.startDate.toLocaleDateString() : 'N/A'}</div>
                <div>${p.finishDate ? p.finishDate.toLocaleDateString() : 'N/A'}</div>
            `;
             container.appendChild(row);
        }
        */

        function selectProject(project) {
            window.currentProject = project;
            currentProject = project;
            
            // Alt paneli proje bilgileriyle doldur
            const formatDate = (date) => {
                if (!date) return 'N/A';
                const d = new Date(date);
                return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
            };
            document.getElementById('panelProjectName').textContent = project.name || '';
            document.getElementById('panelStartDate').textContent = formatDate(project.startDate);
            document.getElementById('panelFinishDate').textContent = formatDate(project.finishDate);
            document.getElementById('panelTaskCount').textContent = project.tasks ? project.tasks.length : 0;
            
            // Aktiviteye özel alanları temizle
            document.getElementById('panelActivityId').textContent = '';
            document.getElementById('panelActivityName').textContent = '';

            const sortedTasks = refreshWBSTree(project.tasks);
            window.renderGanttChart(project, sortedTasks, ganttConfig);
            // Detay panelini görünür ve General sekmesini aktif yap
            document.querySelectorAll('.tab-pane').forEach(c => { c.classList.remove('active'); c.style.display = 'none'; });
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            const generalTab = document.getElementById('generalTab');
            const generalTabBtn = document.querySelector('.tab-button[onclick*="general"]');
            if (generalTab) { generalTab.classList.add('active'); generalTab.style.display = 'block'; }
            if (generalTabBtn) generalTabBtn.classList.add('active');
        }

        function toggleTaskChildren(taskId, icon) {
            const wbsRows = document.getElementById('wbs-rows');
            const ganttBars = document.getElementById('gantt-bars');

            let startRow = null;
            for(const row of wbsRows.children){
                if(row.dataset.taskId === taskId){
                    startRow = row;
                    break;
                }
            }

            if (!startRow) return;

            const isCollapsed = startRow.classList.toggle('collapsed');
            icon.className = isCollapsed ? 'fas fa-caret-right' : 'fas fa-caret-down';

            const parentLevel = parseInt(startRow.dataset.level || '0', 10);
            let currentRow = startRow.nextElementSibling;

            while (currentRow) {
                const currentLevel = parseInt(currentRow.dataset.level || '0', 10);
                if (currentLevel <= parentLevel) {
                    break; // Reached a sibling or another higher-level task
                }
                
                // Also hide/show corresponding gantt bar row
                const ganttRow = ganttBars.querySelector(`.gantt-row-container[data-task-id='${currentRow.dataset.taskId}']`);

                if (isCollapsed) {
                    currentRow.style.display = 'none';
                    if(ganttRow) ganttRow.style.display = 'none';
                } else {
                     // Only show direct children, respect their own collapsed state
                    const parentRow = findParentRow(currentRow, parentLevel);
                    if(parentRow && !parentRow.classList.contains('collapsed')){
                         currentRow.style.display = 'flex';
                         if(ganttRow) ganttRow.style.display = 'flex';
                    }
                }
                
                currentRow = currentRow.nextElementSibling;
            }
        }
        
        function findParentRow(childRow, parentLevelToStopAt){
            let parentLevel = parseInt(childRow.dataset.level || '0', 10) - 1;
            let current = childRow.previousElementSibling;
            while(current && parentLevel >= parentLevelToStopAt){
                const currentLevel = parseInt(current.dataset.level || '0', 10);
                if(currentLevel === parentLevel){
                    return current;
                }
                if(currentLevel < parentLevel){
                    parentLevel = currentLevel;
                }
                current = current.previousElementSibling;
            }
            return null;
        }

        function refreshWBSTree(tasks) {
            const wbsColumnHeader = document.getElementById('wbs-column-header');
            const wbsRows = document.getElementById('wbs-rows');
            
            if (!wbsColumnHeader || !wbsRows) return;

            // Header matching the reference image
            wbsColumnHeader.innerHTML = `
                <div class="wbs-cell-header" style="flex-basis: 5%; text-align: center;">#</div>
                <div class="wbs-cell-header" style="flex-basis: 12%; text-align: center;">Activity<br>ID</div>
                <div class="wbs-cell-header" style="flex-basis: 28%; text-align: center;">Activity<br>Name</div>
                <div class="wbs-cell-header" style="flex-basis: 12%; text-align: right;">Budgeted<br>Cost</div>
                <div class="wbs-cell-header" style="flex-basis: 10%; text-align: right;">Original<br>Dur</div>
                <div class="wbs-cell-header" style="flex-basis: 10%; text-align: right;">Remaining<br>Dur</div>
                <div class="wbs-cell-header" style="flex-basis: 11.5%;">Start</div>
                <div class="wbs-cell-header" style="flex-basis: 11.5%;">Finish</div>
            `;
            wbsRows.innerHTML = '';

            if (!tasks || tasks.length === 0) return [];

            let rowNum = 0;
            const sortedTasks = [];
            const taskMap = new Map(tasks.map(t => [t.id, t]));
            // Filter for root tasks: those without a parent or whose parent is not in the map
            const rootTasks = tasks.filter(t => !t.parent || !taskMap.has(t.parent));
            
            const renderTaskWithChildren = (task, level) => {
                rowNum++;
                sortedTasks.push(task);

                const item = document.createElement('div');
                item.className = 'wbs-row';
                item.setAttribute('data-task-id', task.id);
                item.setAttribute('data-level', level);
                item.style.height = `${ganttConfig.rowHeight}px`;
                item.style.minHeight = `${ganttConfig.rowHeight}px`;
                item.style.maxHeight = `${ganttConfig.rowHeight}px`;
                item.style.boxSizing = 'border-box';
                item.style.display = 'flex';
                
                // Add summary task class for styling
                if (task.task_type === 'TT_WBS') {
                    item.classList.add('summary-task-row');
                }

                const formatCurrency = (num) => num.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' });
                const formatDate = (date) => date ? date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit'}) : 'N/A';

                // Create and append all cells for the row
                item.innerHTML = `
                    <div class="wbs-cell" style="flex-basis: 5%; text-align: center;">${rowNum}</div>
                    <div class="wbs-cell" style="flex-basis: 12%;">${task.id}</div>
                    <div class="wbs-cell" style="flex-basis: 28%; padding-left: ${level * 25}px;">
                        <span class="wbs-task-name">${task.name}</span>
                    </div>
                    <div class="wbs-cell" style="flex-basis: 12%; text-align: right;">${formatCurrency(task.budgeted_cost)}</div>
                    <div class="wbs-cell" style="flex-basis: 10%; text-align: right;">${task.original_duration}d</div>
                    <div class="wbs-cell" style="flex-basis: 10%; text-align: right;">${task.remaining_duration}d</div>
                    <div class="wbs-cell" style="flex-basis: 11.5%;">${formatDate(task.startDate)}</div>
                    <div class="wbs-cell" style="flex-basis: 11.5%;">${formatDate(task.finishDate)}</div>
                `;

                // Add expand/collapse icon separately to attach the event listener
                const nameCell = item.querySelector('.wbs-cell[style*="flex-basis: 28%"]');
                if (task.children && task.children.length > 0) {
                    const icon = document.createElement('i');
                    icon.className = 'fas fa-caret-down'; // Default to expanded
                    icon.style.marginRight = '8px';
                    icon.style.cursor = 'pointer';
                    icon.onclick = (e) => {
                        e.stopPropagation();
                        toggleTaskChildren(task.id, icon);
                    };
                    nameCell.insertBefore(icon, nameCell.firstChild);
                }
                
                item.onclick = () => { window.selectTask(task); };
                
                wbsRows.appendChild(item);

                if (task.children && task.children.length > 0) {
                    task.children.forEach(childId => {
                        const childTask = taskMap.get(childId);
                        if (childTask) {
                            renderTaskWithChildren(childTask, level + 1);
                        }
                    });
                }
            };

            rootTasks.forEach(task => renderTaskWithChildren(task, 0));
            
            return sortedTasks;
        }
        
        function init() {
            console.log('ProjectManagement Initialized');
            document.getElementById('import-xer-btn').addEventListener('click', () => {
                document.getElementById('xer-file-input').click();
            });
            document.getElementById('xer-file-input').addEventListener('change', handleXERUpload);

            // --- Splitter Logic ---
            const splitter = document.getElementById('main-splitter');
            const wbsContainer = document.getElementById('wbs-container');
            const horizontalScrollSpacer = document.querySelector('.horizontal-scroll-spacer');
            
            let isDragging = false;

            splitter.addEventListener('mousedown', (e) => {
                isDragging = true;
                // Optional: Add a class to the body to show a resizing cursor
                document.body.style.cursor = 'col-resize';
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
                document.body.style.cursor = 'default';
            });
            
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                
                const mainContainer = document.getElementById('main-container');
                const rect = mainContainer.getBoundingClientRect();
                const newWbsWidth = e.clientX - rect.left;

                // Enforce min/max widths
                if (newWbsWidth > 300 && newWbsWidth < rect.width - 200) {
                    wbsContainer.style.flexBasis = `${newWbsWidth}px`;
                    horizontalScrollSpacer.style.width = `${newWbsWidth}px`;
                }
            });

            // --- Vertical Scroll Syncing ---
            const wbsRows = document.getElementById('wbs-rows');
            const ganttBody = document.getElementById('gantt-body');
            let activeScrollElement = null;

            const onScroll = (e) => {
                if (activeScrollElement && activeScrollElement !== e.target) return;
                
                const otherElement = e.target === wbsRows ? ganttBody : wbsRows;
                otherElement.scrollTop = e.target.scrollTop;
            };

            wbsRows.addEventListener('scroll', onScroll);
            ganttBody.addEventListener('scroll', onScroll);
            wbsRows.addEventListener('mouseenter', () => activeScrollElement = wbsRows);
            ganttBody.addEventListener('mouseenter', () => activeScrollElement = ganttBody);

            // Make the bottom panel visible by default
            const bottomPane = document.querySelector('.bottom-pane');
            if (bottomPane) {
                bottomPane.style.display = 'block';
            }

            // Bind toolbar controls
            document.getElementById('gantt-scale-select').addEventListener('change', (e) => {
                ganttConfig.scale = e.target.value;
                refreshGanttChart();
            });

            // --- Gantt Interactivity (Zoom and Scale) ---
            const zoomInBtn = document.getElementById('zoom-in-btn');
            const zoomOutBtn = document.getElementById('zoom-out-btn');
            const scaleSelect = document.getElementById('gantt-scale-select');

            // --- Scrollbar/Layout Fix Function ---
            function updateGanttScrollLayout() {
                // Gantt ve scroll bar genişliklerini güncelle
                const wbsContainer = document.getElementById('wbs-container');
                const horizontalScrollSpacer = document.querySelector('.horizontal-scroll-spacer');
                const horizontalScrollContent = document.getElementById('horizontal-scroll-content');
                const ganttBody = document.getElementById('gantt-body');

                if (wbsContainer && horizontalScrollSpacer) {
                    const wbsWidth = wbsContainer.getBoundingClientRect().width;
                    horizontalScrollSpacer.style.width = `${wbsWidth}px`;
                }
                if (ganttBody && horizontalScrollContent) {
                    const ganttWidth = ganttBody.scrollWidth;
                    horizontalScrollContent.style.width = `${ganttWidth}px`;
                }
            }

            const refreshGanttChart = () => {
                if (currentProject) {
                    // Re-sort tasks and render
                    const sortedTasks = refreshWBSTree(currentProject.tasks); 
                    window.renderGanttChart(currentProject, sortedTasks, ganttConfig);
                    // Gantt render sonrası scroll bar/layout güncelle
                    setTimeout(updateGanttScrollLayout, 0);
                }
            };

            zoomInBtn.addEventListener('click', () => {
                ganttConfig.dayCellWidth = Math.min(100, ganttConfig.dayCellWidth + 5);
                refreshGanttChart();
            });

            zoomOutBtn.addEventListener('click', () => {
                ganttConfig.dayCellWidth = Math.max(5, ganttConfig.dayCellWidth - 5); // Set a smaller minimum for better zoom out
                refreshGanttChart();
            });

            scaleSelect.addEventListener('change', (e) => {
                ganttConfig.scale = e.target.value;
                refreshGanttChart();
            });

            // --- Horizontal Scroll Syncing ---
            const horizontalScrollBar = document.getElementById('horizontal-scroll-bar');
            const timelineHeader = document.getElementById('timeline-header');
            
            horizontalScrollBar.addEventListener('scroll', () => {
                const scrollLeft = horizontalScrollBar.scrollLeft;

                // Move timeline header content to match the scroll
                const timelineRows = timelineHeader.querySelectorAll('.timeline-row');
                timelineRows.forEach(row => {
                    row.style.transform = `translateX(-${scrollLeft}px)`;
                });

                // Move the entire Gantt body (bars + grid background) to match the scroll
                ganttBody.style.transform = `translateX(-${scrollLeft}px)`;
            });

            // Ayrıca, ilk açılışta da layout'u güncelle
            setTimeout(updateGanttScrollLayout, 0);
        }

        return { init };
    })();

    document.addEventListener('DOMContentLoaded', ProjectManagement.init);
}

// ---[ GLOBAL UI FUNCTIONS ]---
// Make selectTask global so onclick handlers in HTML can find it
window.selectTask = function(task) {
    if (!task) return;
    if (!window.currentProject || !window.currentProject._activityIdMap) {
        console.warn('Aktif proje veya _activityIdMap tanımlı değil. Detay paneli doldurulamadı.');
        // Optionally, clear the details panel fields here
        return;
    }
    // Panel header doldur
    document.getElementById('panelActivityId').textContent = task.id || '';
    document.getElementById('panelActivityName').textContent = task.name || '';
    document.getElementById('panelProjectName').textContent = (window.currentProject && window.currentProject.name) || '';
    
    const formatDate = (date) => {
        if (!date) return 'N/A';
        const d = new Date(date);
        return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    if (window.currentProject) {
        document.getElementById('panelStartDate').textContent = formatDate(window.currentProject.startDate);
        document.getElementById('panelFinishDate').textContent = formatDate(window.currentProject.finishDate);
    }

    // Status sekmesi kutuları
    const toInputDate = (date) => {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${day}.${month}.${d.getFullYear()}`;
    };
    document.getElementById('durationOriginal').textContent = (task.original_duration != null ? task.original_duration + 'd' : '');
    document.getElementById('durationActual').textContent = (task.actual_duration != null ? task.actual_duration + 'd' : '');
    document.getElementById('durationRemaining').textContent = (task.remaining_duration != null ? task.remaining_duration + 'd' : '');
    document.getElementById('durationAtComplete').textContent = (task.at_complete_duration != null ? task.at_complete_duration + 'd' : (task.original_duration != null ? task.original_duration + 'd' : ''));
    document.getElementById('statusStarted').textContent = toInputDate(task.startDate || task.early_start_date);
    document.getElementById('statusFinished').textContent = toInputDate(task.finishDate || task.early_end_date);
    document.getElementById('statusExpFinish').textContent = toInputDate(task.exp_finish_date);
    document.getElementById('statusDurationPct').textContent = (task.phys_complete_pct != null ? task.phys_complete_pct + '%' : '');
    document.getElementById('statusSuspend').textContent = toInputDate(task.suspend_date);
    document.getElementById('statusResume').textContent = toInputDate(task.resume_date);
    document.getElementById('laborBudgeted').textContent = (task.labor_budgeted != null ? task.labor_budgeted + 'h' : '');
    document.getElementById('laborActual').textContent = (task.labor_actual != null ? task.labor_actual + 'h' : '');
    document.getElementById('laborRemaining').textContent = (task.labor_remaining != null ? task.labor_remaining + 'h' : '');
    document.getElementById('laborAtComplete').textContent = (task.labor_at_complete != null ? task.labor_at_complete + 'h' : '');
    document.getElementById('constraintPrimary').textContent = task.constraint_primary || '';
    document.getElementById('constraintSecondary').textContent = task.constraint_secondary || '';
    // --- Robust Activity Lookup Helper ---
    function findActivityById(id) {
        if (!window.currentProject || !window.currentProject._activityIdMap) return null;
        const map = window.currentProject._activityIdMap;
        if (!id) return null;
        return map[id] ||
               map[id.toString()] ||
               map['A' + id] ||
               map[String(id).replace(/^A/, '')] ||
               null;
    }
    // Predecessors Table
    const predecessorsTable = document.querySelector('#predecessorsTable tbody');
    if (predecessorsTable) {
        predecessorsTable.innerHTML = '';
        (task.predecessors || []).forEach(pred => {
            let predTask = findActivityById(pred.id) || {};
            let activityName = predTask.name || pred.pred_task_name || pred.successor_task_name || '(Unknown)';
            if (activityName === '(Unknown)') {
                console.warn('No activity name found for predecessor ID:', pred.id, 'Available IDs:', Object.keys(window.currentProject._activityIdMap));
            }
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${predTask.id || pred.id || ''}</td>
                <td>${activityName}</td>
                <td>${pred.type || ''}</td>
                <td>${pred.lag || pred.lag || '0d'}</td>
                <td>${predTask.status || ''}</td>
                <td>${predTask.primary_resource || ''}</td>
            `;
            predecessorsTable.appendChild(row);
        });
    }
    // Successors Table
    const successorsTable = document.querySelector('#successorsTable tbody');
    if (successorsTable) {
        successorsTable.innerHTML = '';
        (task.successors || []).forEach(succ => {
            let succTask = findActivityById(succ.id) || {};
            let activityName = succTask.name || succ.pred_task_name || succ.successor_task_name || '(Unknown)';
            if (activityName === '(Unknown)') {
                console.warn('No activity name found for successor ID:', succ.id, 'Available IDs:', Object.keys(window.currentProject._activityIdMap));
            }
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${succTask.id || succ.id || ''}</td>
                <td>${activityName}</td>
                <td>${succ.type || ''}</td>
                <td>${succ.lag || succ.lag || '0d'}</td>
                <td>${succTask.status || ''}</td>
                <td>${succTask.primary_resource || ''}</td>
            `;
            successorsTable.appendChild(row);
        });
    }
    // Resources Table
    const resourcesTable = document.querySelector('#resourcesTable tbody');
    if (resourcesTable) {
        resourcesTable.innerHTML = '';
        (task.resources || []).forEach(rsrc => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${rsrc.rsrc_id || ''} ${rsrc.resource_name || ''}</td>
                <td>${rsrc.primary_resource_flag === 'Y' ? 'Yes' : ''}</td>
                <td>${rsrc.rsrc_type || ''}</td>
                <td>${rsrc.remain_qty || rsrc.target_qty || ''}</td>
                <td>${rsrc.orig_lag || rsrc.target_lag_drtn_hr_cnt || ''}</td>
                <td>${rsrc.act_start_date || rsrc.target_start_date || ''}</td>
                <td>${rsrc.act_end_date || rsrc.target_end_date || ''}</td>
                <td>${rsrc.target_qty || ''}</td>
                <td>${rsrc.act_reg_qty || ''}</td>
                <td>${rsrc.remain_early_qty || ''}</td>
                <td>${rsrc.role_name || rsrc.resource_role_name || ''}</td>
            `;
            resourcesTable.appendChild(row);
        });
    }
}

function switchTab(button, tabName) {
    document.querySelectorAll('.tab-pane').forEach(c => c.style.display = 'none');
    document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
    document.getElementById(tabName + 'Tab').style.display = 'block';
    button.classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
    const initialTabButton = document.querySelector('.tab-button.active');
    if (initialTabButton) {
        const tabNameMatch = initialTabButton.getAttribute('onclick').match(/'([^']+)'/);
        if (tabNameMatch && tabNameMatch[1]) {
            switchTab(initialTabButton, tabNameMatch[1]);
        }
    }
});

function displayProjectInfo(project) {
    // ... existing code ...
} 