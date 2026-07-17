(function () {
    'use strict';

    var SHEET_HEADERS = Object.freeze({
        Resources: ['id', 'kind', 'title', 'summary', 'status', 'featured', 'featured_order', 'tags', 'audience', 'author', 'updated_at'],
        Prompts: ['resource_id', 'prompt_text', 'recommended_tool', 'use_case'],
        WorkflowSteps: ['resource_id', 'position', 'label', 'instruction', 'expected_output', 'verification'],
        Guidance: ['resource_id', 'position', 'text'],
        ToolReviews: ['resource_id', 'tool_name', 'review', 'pros', 'limitations', 'data_considerations'],
        Events: ['resource_id', 'start_at', 'end_at', 'location', 'capacity', 'event_status', 'booking_url'],
        Showcase: ['resource_id', 'problem', 'approach', 'outcome', 'reflection', 'tools_used']
    });

    var VALID_KINDS = ['prompt', 'workflow', 'toolReview', 'event', 'showcase'];
    var VALID_STATUSES = ['draft', 'review', 'published', 'archived'];
    var VALID_TAGS = ['lifelong', 'workplace', 'academic'];
    var KIND_LABELS = Object.freeze({
        prompt: 'Prompt',
        workflow: 'Workflow',
        toolReview: 'Tool review',
        event: 'Event',
        showcase: 'Showcase'
    });
    var TAG_LABELS = Object.freeze({
        lifelong: 'Lifelong',
        workplace: 'Workplace',
        academic: 'Academic'
    });
    var ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    var DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
    var DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2}))$/;

    var state = {
        workbookName: '',
        issues: [],
        resources: [],
        exportedResources: [],
        payload: null,
        sourceOrder: new Map(),
        dialogTrigger: null
    };

    var elements = {};

    function initialise() {
        elements.fileInput = document.getElementById('workbook-file');
        elements.dropZone = document.getElementById('drop-zone');
        elements.selectedFile = document.getElementById('selected-file');
        elements.libraryStatus = document.getElementById('library-status');
        elements.validationEmpty = document.getElementById('validation-empty');
        elements.validationResults = document.getElementById('validation-results');
        elements.validationSummary = document.getElementById('validation-summary');
        elements.validationIssues = document.getElementById('validation-issues');
        elements.previewStage = document.getElementById('preview-stage');
        elements.previewCount = document.getElementById('preview-count');
        elements.resourceGrid = document.getElementById('resource-grid');
        elements.previewEmpty = document.getElementById('preview-empty');
        elements.kindFilter = document.getElementById('kind-filter');
        elements.tagFilter = document.getElementById('tag-filter');
        elements.exportStage = document.getElementById('export-stage');
        elements.exportSummary = document.getElementById('export-summary');
        elements.downloadButton = document.getElementById('download-json');
        elements.dialog = document.getElementById('resource-dialog');
        elements.dialogKind = document.getElementById('dialog-kind');
        elements.dialogTitle = document.getElementById('dialog-title');
        elements.dialogContent = document.getElementById('dialog-content');
        elements.dialogClose = document.getElementById('dialog-close');

        if (!window.XLSX) {
            elements.libraryStatus.textContent = 'The Excel reader could not be loaded. Check the internet connection, then reload this page.';
            elements.libraryStatus.hidden = false;
            elements.fileInput.disabled = true;
            return;
        }

        elements.fileInput.addEventListener('change', function () {
            if (elements.fileInput.files && elements.fileInput.files[0]) {
                handleFile(elements.fileInput.files[0]);
            }
        });

        ['dragenter', 'dragover'].forEach(function (eventName) {
            elements.dropZone.addEventListener(eventName, function (event) {
                event.preventDefault();
                event.stopPropagation();
                elements.dropZone.classList.add('is-dragging');
            });
        });

        ['dragleave', 'drop'].forEach(function (eventName) {
            elements.dropZone.addEventListener(eventName, function (event) {
                event.preventDefault();
                event.stopPropagation();
                elements.dropZone.classList.remove('is-dragging');
            });
        });

        elements.dropZone.addEventListener('drop', function (event) {
            var files = event.dataTransfer && event.dataTransfer.files;
            if (files && files[0]) {
                handleFile(files[0]);
            }
        });

        elements.kindFilter.addEventListener('change', renderPreviewCards);
        elements.tagFilter.addEventListener('change', renderPreviewCards);
        elements.downloadButton.addEventListener('click', downloadResourcesJson);
        elements.dialogClose.addEventListener('click', closeDialog);
        elements.dialog.addEventListener('close', restoreDialogFocus);
        elements.dialog.addEventListener('click', function (event) {
            if (event.target !== elements.dialog) return;
            var bounds = elements.dialog.getBoundingClientRect();
            var outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
            if (outside) closeDialog();
        });
    }

    function resetState(fileName) {
        if (elements.dialog.open) elements.dialog.close();
        state.workbookName = fileName || '';
        state.issues = [];
        state.resources = [];
        state.exportedResources = [];
        state.payload = null;
        state.sourceOrder = new Map();
        state.dialogTrigger = null;

        elements.libraryStatus.hidden = true;
        elements.libraryStatus.textContent = '';
        elements.validationEmpty.hidden = false;
        elements.validationResults.hidden = true;
        elements.validationSummary.replaceChildren();
        elements.validationIssues.replaceChildren();
        elements.previewStage.hidden = true;
        elements.resourceGrid.replaceChildren();
        elements.previewEmpty.hidden = true;
        elements.exportStage.hidden = true;
        elements.kindFilter.value = '';
        elements.tagFilter.value = '';
        resetSelect(elements.kindFilter, 'All kinds');
        resetTagFilter();
        setStage('upload');
    }

    async function handleFile(file) {
        resetState(file.name);
        elements.selectedFile.textContent = 'Reading ' + file.name + '…';
        setStage('validate');

        if (!/\.xlsx$/i.test(file.name)) {
            finishWithFileError('Choose a file whose name ends in .xlsx.');
            return;
        }

        try {
            var bytes = await file.arrayBuffer();
            var workbook = window.XLSX.read(bytes, { type: 'array', cellDates: false, raw: true });
            var validation = validateWorkbook(workbook);

            state.issues = validation.issues;
            state.resources = validation.resources;
            state.sourceOrder = validation.sourceOrder;
            elements.selectedFile.textContent = 'Selected file: ' + file.name;
            renderValidation();

            var errorCount = state.issues.filter(function (issue) { return issue.severity === 'error'; }).length;
            if (errorCount === 0) {
                state.exportedResources = buildPublishedResources(validation);
                state.payload = {
                    schemaVersion: 1,
                    generatedAt: new Date().toISOString(),
                    resourceCount: state.exportedResources.length,
                    resources: state.exportedResources
                };
                populateFilters();
                renderPreviewCards();
                elements.previewStage.hidden = false;
                elements.exportStage.hidden = false;
                elements.exportSummary.textContent = state.exportedResources.length + ' published ' + pluralise(state.exportedResources.length, 'resource', 'resources') + ' will be included.';
                setStage('export');
            } else {
                setStage('validate');
            }
        } catch (error) {
            finishWithFileError('This file could not be read as an Excel workbook. Upload a corrected .xlsx file and try again.');
        } finally {
            elements.fileInput.value = '';
        }
    }

    function finishWithFileError(reason) {
        state.issues = [{ severity: 'error', sheet: 'Workbook', row: '—', field: 'file', reason: reason }];
        elements.selectedFile.textContent = state.workbookName ? 'Selected file: ' + state.workbookName : 'No workbook selected.';
        renderValidation();
        setStage('validate');
        elements.fileInput.value = '';
    }

    function validateWorkbook(workbook) {
        var issues = [];
        var sheetRows = {};
        var structuralError = false;
        var requiredSheetNames = Object.keys(SHEET_HEADERS);

        workbook.SheetNames.forEach(function (sheetName) {
            if (!Object.prototype.hasOwnProperty.call(SHEET_HEADERS, sheetName)) {
                addIssue(issues, 'warning', sheetName, 1, 'sheet', 'This additional sheet is not part of the publisher schema and will be ignored.');
            }
        });

        requiredSheetNames.forEach(function (sheetName) {
            var worksheet = workbook.Sheets[sheetName];
            var expectedHeaders = SHEET_HEADERS[sheetName];

            if (!worksheet) {
                structuralError = true;
                addIssue(issues, 'error', sheetName, 1, 'sheet', 'This required sheet is missing.');
                return;
            }

            var matrix = window.XLSX.utils.sheet_to_json(worksheet, {
                header: 1,
                defval: '',
                raw: true,
                blankrows: true
            });
            var headerRow = matrix[0] ? matrix[0].slice() : [];
            while (headerRow.length && isBlank(headerRow[headerRow.length - 1])) headerRow.pop();

            var headersMatch = headerRow.length === expectedHeaders.length && expectedHeaders.every(function (header, index) {
                return headerRow[index] === header;
            });

            if (!headersMatch) {
                structuralError = true;
                addIssue(
                    issues,
                    'error',
                    sheetName,
                    1,
                    'header row',
                    'Headers must be exactly, and in this order: ' + expectedHeaders.join(', ') + '.'
                );
                return;
            }

            Object.keys(worksheet).forEach(function (address) {
                if (address.charAt(0) === '!') return;
                var cell = worksheet[address];
                if (!cell || !cell.f) return;
                var decoded = window.XLSX.utils.decode_cell(address);
                addIssue(
                    issues,
                    'error',
                    sheetName,
                    decoded.r + 1,
                    expectedHeaders[decoded.c] || window.XLSX.utils.encode_col(decoded.c),
                    'Formula cells are not supported. Replace the formula with its literal value.'
                );
            });

            sheetRows[sheetName] = [];
            for (var rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
                var values = expectedHeaders.map(function (_, columnIndex) {
                    return matrix[rowIndex] && typeof matrix[rowIndex][columnIndex] !== 'undefined' ? matrix[rowIndex][columnIndex] : '';
                });
                if (values.every(isBlank)) continue;
                var record = { _row: rowIndex + 1 };
                expectedHeaders.forEach(function (header, columnIndex) {
                    record[header] = values[columnIndex];
                });
                sheetRows[sheetName].push(record);
            }
        });

        if (structuralError) {
            return emptyValidationResult(issues);
        }

        var resources = [];
        var resourcesById = new Map();
        var featuredOrders = new Map();
        var sourceOrder = new Map();

        sheetRows.Resources.forEach(function (row, index) {
            var resource = {
                _row: row._row,
                id: textValue(row.id),
                kind: textValue(row.kind),
                title: textValue(row.title),
                summary: textValue(row.summary),
                status: textValue(row.status),
                featured: parseBoolean(row.featured),
                featuredOrder: null,
                tags: [],
                audience: [],
                author: textValue(row.author),
                updatedAt: textValue(row.updated_at)
            };

            if (!resource.id) {
                addIssue(issues, 'error', 'Resources', row._row, 'id', 'Enter a resource ID.');
            } else if (!ID_PATTERN.test(resource.id)) {
                addIssue(issues, 'error', 'Resources', row._row, 'id', 'Use lowercase kebab-case, for example example-resource-id.');
            } else if (resourcesById.has(resource.id)) {
                addIssue(issues, 'error', 'Resources', row._row, 'id', 'This ID is already used on row ' + resourcesById.get(resource.id)._row + '.');
            } else {
                resourcesById.set(resource.id, resource);
                sourceOrder.set(resource.id, index);
            }

            if (VALID_KINDS.indexOf(resource.kind) === -1) {
                addIssue(issues, 'error', 'Resources', row._row, 'kind', 'Use one of: ' + VALID_KINDS.join(', ') + '.');
            }
            if (VALID_STATUSES.indexOf(resource.status) === -1) {
                addIssue(issues, 'error', 'Resources', row._row, 'status', 'Use one of: ' + VALID_STATUSES.join(', ') + '.');
            }
            if (resource.featured === null) {
                addIssue(issues, 'error', 'Resources', row._row, 'featured', 'Use the Excel boolean TRUE or FALSE.');
            }

            if (resource.featured === true) {
                resource.featuredOrder = positiveInteger(row.featured_order);
                if (resource.featuredOrder === null) {
                    addIssue(issues, 'error', 'Resources', row._row, 'featured_order', 'Featured resources need a positive whole-number order.');
                } else if (featuredOrders.has(resource.featuredOrder)) {
                    addIssue(issues, 'error', 'Resources', row._row, 'featured_order', 'This featured order is already used on row ' + featuredOrders.get(resource.featuredOrder) + '.');
                } else {
                    featuredOrders.set(resource.featuredOrder, row._row);
                }
            } else if (resource.featured === false && !isBlank(row.featured_order)) {
                addIssue(issues, 'warning', 'Resources', row._row, 'featured_order', 'This order will be ignored because featured is FALSE.');
            }

            resource.tags = parseControlledTag(row.tags, issues, row._row);
            resource.audience = parsePipeList(row.audience, issues, 'Resources', row._row, 'audience');

            if (resource.status === 'published') {
                requireResourceText(resource.title, issues, row._row, 'title');
                requireResourceText(resource.summary, issues, row._row, 'summary');
                requireResourceText(resource.author, issues, row._row, 'author');
                if (!resource.updatedAt) {
                    addIssue(issues, 'error', 'Resources', row._row, 'updated_at', 'Published resources need an update date in YYYY-MM-DD format.');
                }
            }
            if (resource.updatedAt && !isValidCalendarDate(resource.updatedAt)) {
                addIssue(issues, 'error', 'Resources', row._row, 'updated_at', 'Use a real calendar date in YYYY-MM-DD format.');
            }

            resources.push(resource);
        });

        var childContentIds = new Set();
        var prompts = collectChildRows(sheetRows.Prompts, 'Prompts', ['prompt'], resourcesById, issues, childContentIds);
        var workflowSteps = collectChildRows(sheetRows.WorkflowSteps, 'WorkflowSteps', ['workflow'], resourcesById, issues, childContentIds);
        var guidance = collectChildRows(sheetRows.Guidance, 'Guidance', ['prompt', 'workflow'], resourcesById, issues, childContentIds);
        var toolReviews = collectChildRows(sheetRows.ToolReviews, 'ToolReviews', ['toolReview'], resourcesById, issues, childContentIds);
        var events = collectChildRows(sheetRows.Events, 'Events', ['event'], resourcesById, issues, childContentIds);
        var showcase = collectChildRows(sheetRows.Showcase, 'Showcase', ['showcase'], resourcesById, issues, childContentIds);

        validatePromptRows(prompts, resources, issues);
        validateWorkflowRows(workflowSteps, resources, issues);
        validateGuidanceRows(guidance, issues);
        validateToolReviewRows(toolReviews, resources, issues);
        validateEventRows(events, resources, issues);
        validateShowcaseRows(showcase, resources, issues);

        resources.forEach(function (resource) {
            if (resource.status !== 'published' && resource.id && childContentIds.has(resource.id)) {
                addIssue(issues, 'warning', 'Resources', resource._row, 'status', 'This resource has child content but will not export because its status is ' + resource.status + '.');
            }
        });

        if (!resources.some(function (resource) { return resource.status === 'published'; })) {
            addIssue(issues, 'warning', 'Resources', 1, 'status', 'There are no published resources, so resources.json will contain an empty resources array.');
        }

        return {
            issues: issues,
            resources: resources,
            resourcesById: resourcesById,
            prompts: prompts,
            workflowSteps: workflowSteps,
            guidance: guidance,
            toolReviews: toolReviews,
            events: events,
            showcase: showcase,
            sourceOrder: sourceOrder
        };
    }

    function emptyValidationResult(issues) {
        return {
            issues: issues,
            resources: [],
            resourcesById: new Map(),
            prompts: new Map(),
            workflowSteps: new Map(),
            guidance: new Map(),
            toolReviews: new Map(),
            events: new Map(),
            showcase: new Map(),
            sourceOrder: new Map()
        };
    }

    function collectChildRows(rows, sheetName, allowedKinds, resourcesById, issues, childContentIds) {
        var grouped = new Map();
        rows.forEach(function (row) {
            var resourceId = textValue(row.resource_id);
            row._resourceId = resourceId;
            if (!resourceId) {
                addIssue(issues, 'error', sheetName, row._row, 'resource_id', 'Enter the ID of the parent resource.');
                return;
            }
            var resource = resourcesById.get(resourceId);
            if (!resource) {
                addIssue(issues, 'error', sheetName, row._row, 'resource_id', 'No Resources row uses this ID.');
                return;
            }
            if (allowedKinds.indexOf(resource.kind) === -1) {
                addIssue(issues, 'error', sheetName, row._row, 'resource_id', 'This sheet cannot contain child content for a ' + (KIND_LABELS[resource.kind] || resource.kind) + ' resource.');
                return;
            }
            if (!grouped.has(resourceId)) grouped.set(resourceId, []);
            grouped.get(resourceId).push(row);
            childContentIds.add(resourceId);
        });
        return grouped;
    }

    function validatePromptRows(grouped, resources, issues) {
        grouped.forEach(function (rows) {
            rows.forEach(function (row) {
                requireChildText(row, 'prompt_text', 'Prompts', issues);
                requireChildText(row, 'recommended_tool', 'Prompts', issues);
                requireChildText(row, 'use_case', 'Prompts', issues);
            });
            reportDuplicateOneToOne(rows, 'Prompts', issues);
        });
        requireOneToOneForKind(resources, grouped, 'prompt', 'Prompts', 'prompt_text', issues);
    }

    function validateWorkflowRows(grouped, resources, issues) {
        grouped.forEach(function (rows) {
            rows.forEach(function (row) {
                requireChildText(row, 'label', 'WorkflowSteps', issues);
                requireChildText(row, 'instruction', 'WorkflowSteps', issues);
                requireChildText(row, 'expected_output', 'WorkflowSteps', issues);
                requireChildText(row, 'verification', 'WorkflowSteps', issues);
            });
            validatePositions(rows, 'WorkflowSteps', issues);
        });
        resources.filter(function (resource) { return resource.kind === 'workflow'; }).forEach(function (resource) {
            if (!grouped.has(resource.id) || grouped.get(resource.id).length === 0) {
                addIssue(issues, 'error', 'Resources', resource._row, 'kind', 'Workflow resources need one or more matching WorkflowSteps rows.');
            }
        });
    }

    function validateGuidanceRows(grouped, issues) {
        grouped.forEach(function (rows) {
            rows.forEach(function (row) {
                requireChildText(row, 'text', 'Guidance', issues);
            });
            validatePositions(rows, 'Guidance', issues);
        });
    }

    function validateToolReviewRows(grouped, resources, issues) {
        grouped.forEach(function (rows) {
            rows.forEach(function (row) {
                ['tool_name', 'review', 'pros', 'limitations', 'data_considerations'].forEach(function (field) {
                    requireChildText(row, field, 'ToolReviews', issues);
                });
                row._pros = parsePipeList(row.pros, issues, 'ToolReviews', row._row, 'pros');
                row._limitations = parsePipeList(row.limitations, issues, 'ToolReviews', row._row, 'limitations');
            });
            reportDuplicateOneToOne(rows, 'ToolReviews', issues);
        });
        requireOneToOneForKind(resources, grouped, 'toolReview', 'ToolReviews', 'tool_name', issues);
    }

    function validateEventRows(grouped, resources, issues) {
        grouped.forEach(function (rows) {
            rows.forEach(function (row) {
                ['start_at', 'end_at', 'location', 'capacity', 'event_status'].forEach(function (field) {
                    requireChildText(row, field, 'Events', issues);
                });

                var startAt = textValue(row.start_at);
                var endAt = textValue(row.end_at);
                var startTime = parseIsoDateTime(startAt);
                var endTime = parseIsoDateTime(endAt);
                row._startAt = startAt;
                row._endAt = endAt;
                row._capacity = positiveInteger(row.capacity);

                if (startAt && startTime === null) {
                    addIssue(issues, 'error', 'Events', row._row, 'start_at', 'Use an ISO 8601 datetime with Z or an explicit UTC offset.');
                }
                if (endAt && endTime === null) {
                    addIssue(issues, 'error', 'Events', row._row, 'end_at', 'Use an ISO 8601 datetime with Z or an explicit UTC offset.');
                }
                if (startTime !== null && endTime !== null && endTime <= startTime) {
                    addIssue(issues, 'error', 'Events', row._row, 'end_at', 'The event end must be later than its start.');
                }
                if (!isBlank(row.capacity) && row._capacity === null) {
                    addIssue(issues, 'error', 'Events', row._row, 'capacity', 'Use a positive whole number.');
                }

                var bookingUrl = textValue(row.booking_url);
                row._bookingUrl = bookingUrl;
                if (bookingUrl && !isValidHttpsUrl(bookingUrl)) {
                    addIssue(issues, 'error', 'Events', row._row, 'booking_url', 'Use a complete HTTPS URL without a username or password.');
                }
            });
            reportDuplicateOneToOne(rows, 'Events', issues);
        });
        requireOneToOneForKind(resources, grouped, 'event', 'Events', 'start_at', issues);
    }

    function validateShowcaseRows(grouped, resources, issues) {
        grouped.forEach(function (rows) {
            rows.forEach(function (row) {
                ['problem', 'approach', 'outcome', 'reflection', 'tools_used'].forEach(function (field) {
                    requireChildText(row, field, 'Showcase', issues);
                });
                row._toolsUsed = parsePipeList(row.tools_used, issues, 'Showcase', row._row, 'tools_used');
            });
            reportDuplicateOneToOne(rows, 'Showcase', issues);
        });
        requireOneToOneForKind(resources, grouped, 'showcase', 'Showcase', 'problem', issues);
    }

    function requireOneToOneForKind(resources, grouped, kind, sheetName, field, issues) {
        resources.filter(function (resource) { return resource.kind === kind; }).forEach(function (resource) {
            if (!grouped.has(resource.id) || grouped.get(resource.id).length === 0) {
                addIssue(issues, 'error', 'Resources', resource._row, field, KIND_LABELS[kind] + ' resources need one matching ' + sheetName + ' row.');
            }
        });
    }

    function reportDuplicateOneToOne(rows, sheetName, issues) {
        if (rows.length <= 1) return;
        for (var index = 1; index < rows.length; index += 1) {
            addIssue(issues, 'error', sheetName, rows[index]._row, 'resource_id', 'This resource already has a child row on row ' + rows[0]._row + '.');
        }
    }

    function validatePositions(rows, sheetName, issues) {
        var seen = new Map();
        var validRows = [];
        rows.forEach(function (row) {
            row._position = positiveInteger(row.position);
            if (row._position === null) {
                addIssue(issues, 'error', sheetName, row._row, 'position', 'Use a positive whole number.');
                return;
            }
            if (seen.has(row._position)) {
                addIssue(issues, 'error', sheetName, row._row, 'position', 'This position is already used on row ' + seen.get(row._position) + '.');
            } else {
                seen.set(row._position, row._row);
            }
            validRows.push(row);
        });

        validRows.sort(function (a, b) { return a._position - b._position; });
        validRows.forEach(function (row, index) {
            var expected = index + 1;
            if (row._position !== expected) {
                addIssue(issues, 'error', sheetName, row._row, 'position', 'Positions must form the sequence 1 to ' + validRows.length + ' without gaps.');
            }
        });
    }

    function buildPublishedResources(validation) {
        return validation.resources.filter(function (resource) {
            return resource.status === 'published';
        }).map(function (resource) {
            var output = {
                id: resource.id,
                kind: resource.kind,
                status: resource.status,
                title: resource.title,
                summary: resource.summary,
                tags: resource.tags,
                audience: resource.audience,
                featured: {
                    enabled: resource.featured,
                    order: resource.featured ? resource.featuredOrder : null
                },
                author: { name: resource.author },
                updatedAt: resource.updatedAt,
                content: {}
            };
            var guidanceRows = sortedRows(validation.guidance.get(resource.id) || []);
            var guidance = guidanceRows.map(function (row) { return textValue(row.text); });

            if (resource.kind === 'prompt') {
                var prompt = validation.prompts.get(resource.id)[0];
                output.content = {
                    promptText: textValue(prompt.prompt_text),
                    recommendedTool: textValue(prompt.recommended_tool),
                    useCase: textValue(prompt.use_case),
                    guidance: guidance
                };
            } else if (resource.kind === 'workflow') {
                output.content = {
                    steps: sortedRows(validation.workflowSteps.get(resource.id) || []).map(function (row) {
                        return {
                            position: row._position,
                            label: textValue(row.label),
                            instruction: textValue(row.instruction),
                            expectedOutput: textValue(row.expected_output),
                            verification: textValue(row.verification)
                        };
                    }),
                    guidance: guidance
                };
            } else if (resource.kind === 'toolReview') {
                var review = validation.toolReviews.get(resource.id)[0];
                output.content = {
                    toolName: textValue(review.tool_name),
                    review: textValue(review.review),
                    pros: review._pros,
                    limitations: review._limitations,
                    dataConsiderations: textValue(review.data_considerations)
                };
            } else if (resource.kind === 'event') {
                var event = validation.events.get(resource.id)[0];
                output.content = {
                    startAt: event._startAt,
                    endAt: event._endAt,
                    location: textValue(event.location),
                    capacity: event._capacity,
                    eventStatus: textValue(event.event_status)
                };
                if (event._bookingUrl) output.content.bookingUrl = event._bookingUrl;
            } else if (resource.kind === 'showcase') {
                var showcase = validation.showcase.get(resource.id)[0];
                output.content = {
                    problem: textValue(showcase.problem),
                    approach: textValue(showcase.approach),
                    outcome: textValue(showcase.outcome),
                    reflection: textValue(showcase.reflection),
                    toolsUsed: showcase._toolsUsed
                };
            }
            return output;
        });
    }

    function renderValidation() {
        elements.validationEmpty.hidden = true;
        elements.validationResults.hidden = false;
        elements.validationSummary.replaceChildren();
        elements.validationIssues.replaceChildren();

        var errors = state.issues.filter(function (issue) { return issue.severity === 'error'; });
        var warnings = state.issues.filter(function (issue) { return issue.severity === 'warning'; });
        var publishedCount = state.resources.filter(function (resource) { return resource.status === 'published'; }).length;

        elements.validationSummary.appendChild(summaryCard(errors.length, 'Errors', errors.length ? 'is-error' : 'is-success'));
        elements.validationSummary.appendChild(summaryCard(warnings.length, 'Warnings', warnings.length ? 'is-warning' : 'is-success'));
        elements.validationSummary.appendChild(summaryCard(publishedCount, 'Published', errors.length ? '' : 'is-success'));

        if (state.issues.length === 0) {
            var passed = createElement('div', 'notice');
            passed.classList.add('summary-card', 'is-success');
            passed.textContent = 'Validation passed with no issues. Preview and JSON export are ready.';
            elements.validationIssues.appendChild(passed);
            return;
        }

        if (errors.length) elements.validationIssues.appendChild(issueGroup('Errors that prevent export', errors, 'error'));
        if (warnings.length) elements.validationIssues.appendChild(issueGroup('Warnings', warnings, 'warning'));
    }

    function summaryCard(value, label, className) {
        var card = createElement('div', 'summary-card' + (className ? ' ' + className : ''));
        card.appendChild(createElement('strong', '', String(value)));
        card.appendChild(document.createTextNode(label));
        return card;
    }

    function issueGroup(title, issues, severity) {
        var group = createElement('section', 'issue-group');
        group.appendChild(createElement('h3', '', title));
        var list = createElement('ul', 'issue-list');
        issues.forEach(function (issue) {
            var item = createElement('li', 'issue issue-' + severity);
            item.appendChild(createElement('span', 'issue-location', issue.sheet + ' · row ' + issue.row + ' · ' + issue.field));
            item.appendChild(document.createTextNode(issue.reason));
            list.appendChild(item);
        });
        group.appendChild(list);
        return group;
    }

    function populateFilters() {
        resetSelect(elements.kindFilter, 'All kinds');
        resetTagFilter();

        var kinds = Array.from(new Set(state.exportedResources.map(function (resource) { return resource.kind; })));
        kinds.sort(function (a, b) { return KIND_LABELS[a].localeCompare(KIND_LABELS[b], 'en-GB'); });
        kinds.forEach(function (kind) {
            elements.kindFilter.appendChild(optionElement(kind, KIND_LABELS[kind]));
        });

    }

    function renderPreviewCards() {
        var kind = elements.kindFilter.value;
        var tag = elements.tagFilter.value;
        var filtered = state.exportedResources.filter(function (resource) {
            var kindMatches = !kind || resource.kind === kind;
            var tagMatches = !tag || resource.tags.indexOf(tag) !== -1;
            return kindMatches && tagMatches;
        });

        filtered.sort(function (a, b) {
            if (a.featured.enabled !== b.featured.enabled) return a.featured.enabled ? -1 : 1;
            if (a.featured.enabled && a.featured.order !== b.featured.order) return a.featured.order - b.featured.order;
            return state.sourceOrder.get(a.id) - state.sourceOrder.get(b.id);
        });

        elements.resourceGrid.replaceChildren();
        filtered.forEach(function (resource) {
            elements.resourceGrid.appendChild(resourceCard(resource));
        });
        elements.previewEmpty.hidden = filtered.length !== 0;
        elements.previewCount.textContent = 'Showing ' + filtered.length + ' of ' + state.exportedResources.length + ' published ' + pluralise(state.exportedResources.length, 'resource', 'resources') + '.';
    }

    function resourceCard(resource) {
        var card = createElement('article', 'resource-card' + (resource.featured.enabled ? ' is-featured' : ''));
        var meta = createElement('div', 'card-meta');
        meta.appendChild(createElement('span', 'kind-badge', KIND_LABELS[resource.kind]));
        if (resource.featured.enabled) meta.appendChild(createElement('span', 'featured-badge', 'Featured'));
        card.appendChild(meta);
        card.appendChild(createElement('h3', '', resource.title));
        card.appendChild(createElement('p', 'summary', resource.summary));

        if (resource.tags.length) {
            var tags = createElement('ul', 'tag-list');
            resource.tags.forEach(function (tag) {
                var item = createElement('li');
                item.appendChild(createElement('span', 'tag', TAG_LABELS[tag]));
                tags.appendChild(item);
            });
            card.appendChild(tags);
        }

        var button = createElement('button', 'button button-secondary', 'View details');
        button.type = 'button';
        button.setAttribute('aria-label', 'View details for ' + resource.title);
        button.addEventListener('click', function () { openDialog(resource, button); });
        card.appendChild(button);
        return card;
    }

    function openDialog(resource, trigger) {
        state.dialogTrigger = trigger;
        elements.dialogKind.textContent = KIND_LABELS[resource.kind];
        elements.dialogTitle.textContent = resource.title;
        elements.dialogContent.replaceChildren();
        elements.dialogContent.appendChild(createElement('p', 'muted', resource.summary));

        var overview = createElement('section', 'detail-block');
        overview.appendChild(createElement('h3', '', 'Resource details'));
        appendLabelledText(overview, 'Author', resource.author.name);
        appendLabelledText(overview, 'Updated', resource.updatedAt);
        if (resource.tags.length) appendList(overview, 'Tags', resource.tags.map(function (tag) { return TAG_LABELS[tag]; }));
        if (resource.audience.length) appendList(overview, 'Audience', resource.audience);
        elements.dialogContent.appendChild(overview);

        if (resource.kind === 'prompt') renderPromptDetails(resource);
        if (resource.kind === 'workflow') renderWorkflowDetails(resource);
        if (resource.kind === 'toolReview') renderToolReviewDetails(resource);
        if (resource.kind === 'event') renderEventDetails(resource);
        if (resource.kind === 'showcase') renderShowcaseDetails(resource);

        elements.dialog.showModal();
        elements.dialogClose.focus();
    }

    function renderPromptDetails(resource) {
        var content = resource.content;
        var prompt = detailSection('Prompt text');
        prompt.appendChild(createElement('pre', 'prompt-text', content.promptText));
        elements.dialogContent.appendChild(prompt);

        var use = detailSection('Using this prompt');
        appendLabelledText(use, 'Recommended tool', content.recommendedTool);
        appendLabelledText(use, 'Use case', content.useCase);
        elements.dialogContent.appendChild(use);
        appendGuidance(content.guidance);
    }

    function renderWorkflowDetails(resource) {
        var stepsSection = detailSection('Workflow steps');
        var list = createElement('ol');
        resource.content.steps.forEach(function (step) {
            var item = createElement('li', 'workflow-step');
            item.appendChild(createElement('h4', '', step.label));
            appendLabelledText(item, 'Instruction', step.instruction);
            appendLabelledText(item, 'Expected output', step.expectedOutput);
            appendLabelledText(item, 'Verification', step.verification);
            list.appendChild(item);
        });
        stepsSection.appendChild(list);
        elements.dialogContent.appendChild(stepsSection);
        appendGuidance(resource.content.guidance);
    }

    function renderToolReviewDetails(resource) {
        var content = resource.content;
        var section = detailSection(content.toolName);
        appendLabelledText(section, 'Review', content.review);
        appendList(section, 'Pros', content.pros);
        appendList(section, 'Limitations', content.limitations);
        appendLabelledText(section, 'Data considerations', content.dataConsiderations);
        elements.dialogContent.appendChild(section);
    }

    function renderEventDetails(resource) {
        var content = resource.content;
        var section = detailSection('Event information');
        appendTime(section, 'Starts', content.startAt);
        appendTime(section, 'Ends', content.endAt);
        appendLabelledText(section, 'Location', content.location);
        appendLabelledText(section, 'Capacity', String(content.capacity));
        appendLabelledText(section, 'Status', content.eventStatus);
        if (content.bookingUrl) {
            var paragraph = createElement('p');
            var link = createElement('a', 'button button-primary', 'Book for ' + resource.title);
            link.href = content.bookingUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            paragraph.appendChild(link);
            section.appendChild(paragraph);
        }
        elements.dialogContent.appendChild(section);
    }

    function renderShowcaseDetails(resource) {
        var content = resource.content;
        var section = detailSection('Showcase details');
        appendLabelledText(section, 'Problem', content.problem);
        appendLabelledText(section, 'Approach', content.approach);
        appendLabelledText(section, 'Outcome', content.outcome);
        appendLabelledText(section, 'Reflection', content.reflection);
        appendList(section, 'Tools used', content.toolsUsed);
        elements.dialogContent.appendChild(section);
    }

    function appendGuidance(guidance) {
        if (!guidance.length) return;
        var section = detailSection('Guidance');
        var list = createElement('ol');
        guidance.forEach(function (item) { list.appendChild(createElement('li', '', item)); });
        section.appendChild(list);
        elements.dialogContent.appendChild(section);
    }

    function closeDialog() {
        if (elements.dialog.open) elements.dialog.close();
    }

    function restoreDialogFocus() {
        if (state.dialogTrigger && document.contains(state.dialogTrigger)) state.dialogTrigger.focus();
        state.dialogTrigger = null;
    }

    function downloadResourcesJson() {
        if (!state.payload) return;
        var json = JSON.stringify(state.payload, null, 2) + '\n';
        var blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'resources.json';
        link.hidden = true;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function parsePipeList(value, issues, sheet, row, field) {
        var raw = textValue(value);
        if (!raw) return [];
        var output = [];
        var seen = new Set();
        raw.split('|').forEach(function (part) {
            var item = part.trim();
            if (!item) {
                addIssue(issues, 'warning', sheet, row, field, 'Empty list entries will be removed.');
                return;
            }
            var key = item.toLocaleLowerCase('en-GB');
            if (seen.has(key)) {
                addIssue(issues, 'warning', sheet, row, field, 'The repeated value “' + item + '” will appear once.');
                return;
            }
            seen.add(key);
            output.push(item);
        });
        return output;
    }

    function parseControlledTag(value, issues, row) {
        var tag = textValue(value);
        if (VALID_TAGS.indexOf(tag) !== -1) return [tag];
        addIssue(issues, 'error', 'Resources', row, 'tags', 'Use exactly one lowercase tag: lifelong, workplace, or academic.');
        return [];
    }

    function parseBoolean(value) {
        if (value === true || value === false) return value;
        if (value === 'TRUE') return true;
        if (value === 'FALSE') return false;
        return null;
    }

    function positiveInteger(value) {
        if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
        var text = textValue(value);
        if (!/^[1-9]\d*$/.test(text)) return null;
        var number = Number(text);
        return Number.isSafeInteger(number) ? number : null;
    }

    function isValidCalendarDate(value) {
        var match = DATE_PATTERN.exec(value);
        if (!match) return false;
        var year = Number(match[1]);
        var month = Number(match[2]);
        var day = Number(match[3]);
        var date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    }

    function parseIsoDateTime(value) {
        var match = DATE_TIME_PATTERN.exec(value);
        if (!match) return null;
        var year = Number(match[1]);
        var month = Number(match[2]);
        var day = Number(match[3]);
        var hour = Number(match[4]);
        var minute = Number(match[5]);
        var second = match[6] ? Number(match[6]) : 0;
        var calendarDate = new Date(Date.UTC(year, month - 1, day));
        if (calendarDate.getUTCFullYear() !== year || calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) return null;
        if (hour > 23 || minute > 59 || second > 59) return null;
        if (match[8] !== 'Z') {
            var offsetHour = Number(match[10]);
            var offsetMinute = Number(match[11]);
            if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
        }
        var timestamp = Date.parse(value);
        return Number.isFinite(timestamp) ? timestamp : null;
    }

    function isValidHttpsUrl(value) {
        try {
            var url = new URL(value);
            return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
        } catch (error) {
            return false;
        }
    }

    function requireResourceText(value, issues, row, field) {
        if (!value) addIssue(issues, 'error', 'Resources', row, field, 'Published resources need a ' + field.replace('_', ' ') + '.');
    }

    function requireChildText(row, field, sheet, issues) {
        if (!textValue(row[field])) addIssue(issues, 'error', sheet, row._row, field, 'Enter a value for this field.');
    }

    function addIssue(issues, severity, sheet, row, field, reason) {
        issues.push({ severity: severity, sheet: sheet, row: row, field: field, reason: reason });
    }

    function textValue(value) {
        if (value === null || typeof value === 'undefined') return '';
        return String(value).trim();
    }

    function isBlank(value) {
        return value === null || typeof value === 'undefined' || (typeof value === 'string' && value.trim() === '');
    }

    function sortedRows(rows) {
        return rows.slice().sort(function (a, b) { return a._position - b._position; });
    }

    function resetSelect(select, label) {
        select.replaceChildren(optionElement('', label));
    }

    function resetTagFilter() {
        resetSelect(elements.tagFilter, 'All tags');
        VALID_TAGS.forEach(function (tag) {
            elements.tagFilter.appendChild(optionElement(tag, TAG_LABELS[tag]));
        });
    }

    function optionElement(value, label) {
        var option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
    }

    function createElement(tagName, className, text) {
        var element = document.createElement(tagName);
        if (className) element.className = className;
        if (typeof text !== 'undefined') element.textContent = text;
        return element;
    }

    function detailSection(title) {
        var section = createElement('section', 'detail-block');
        section.appendChild(createElement('h3', '', title));
        return section;
    }

    function appendLabelledText(container, label, value) {
        var paragraph = createElement('p');
        paragraph.appendChild(createElement('strong', '', label + ': '));
        paragraph.appendChild(document.createTextNode(value));
        container.appendChild(paragraph);
    }

    function appendTime(container, label, value) {
        var paragraph = createElement('p');
        paragraph.appendChild(createElement('strong', '', label + ': '));
        var time = createElement('time', '', value);
        time.dateTime = value;
        paragraph.appendChild(time);
        container.appendChild(paragraph);
    }

    function appendList(container, label, values) {
        container.appendChild(createElement('p', '', label + ':'));
        var list = createElement('ul');
        values.forEach(function (value) { list.appendChild(createElement('li', '', value)); });
        container.appendChild(list);
    }

    function pluralise(value, singular, plural) {
        return value === 1 ? singular : plural;
    }

    function setStage(stage) {
        var order = ['upload', 'validate', 'preview', 'export'];
        var activeIndex = order.indexOf(stage);
        document.querySelectorAll('[data-stage-indicator]').forEach(function (indicator) {
            var index = order.indexOf(indicator.getAttribute('data-stage-indicator'));
            indicator.classList.toggle('is-current', index === activeIndex);
            indicator.classList.toggle('is-complete', index < activeIndex);
        });
    }

    initialise();
}());
