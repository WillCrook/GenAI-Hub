/* Consolidated JSON resource runtime for the GenAI Hub. */
(function (window, document) {
    'use strict';

    var hub = window.GenAIHub || {};
    if (hub.resources) return;

    var runtimeScript = document.currentScript;
    var DATA_URL = runtimeScript && runtimeScript.getAttribute('data-resource-source')
        ? runtimeScript.getAttribute('data-resource-source')
        : 'https://willcrook.github.io/GenAI-Hub/assets/data/resources.json';
    var SCHEMA_VERSION = '1.1';
    var RESOURCE_TYPES = ['prompt', 'workflow', 'tool', 'article', 'video', 'link', 'download', 'event', 'showcase'];
    var LIBRARY_SECTIONS = ['learn-ai', 'challenges', 'community'];
    var SKILL_AREAS = ['academic', 'workplace', 'lifelong'];
    var SECTION_TYPES = {
        'learn-ai': ['article', 'video', 'link', 'download'],
        challenges: ['article', 'video', 'link', 'download'],
        community: ['prompt', 'workflow', 'tool', 'event', 'showcase']
    };
    var loadedData = null;
    var resourceIndex = Object.create(null);
    var inFlightRequest = null;

    function invalid(path, message) {
        throw new Error('Invalid resource data at ' + path + ': ' + message);
    }

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function isStringArray(value, allowed) {
        return Array.isArray(value) && value.every(function (item) {
            return typeof item === 'string' && (!allowed || allowed.indexOf(item) !== -1);
        });
    }

    function isSafeHttpUrl(value) {
        if (value === '') return true;
        if (typeof value !== 'string') return false;
        try {
            var parsed = new URL(value);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch (error) {
            return false;
        }
    }

    function contentSafetyIssue(type, content) {
        if (!isObject(content)) return 'content must be an object.';
        if (type === 'prompt' && (!isStringArray(content.platforms) || !isStringArray(content.modelsTested))) {
            return 'prompt platform and model lists must be arrays of strings.';
        }
        if (type === 'workflow') {
            if (!Array.isArray(content.steps) || !content.steps.every(isObject)) return 'workflow steps must be an array of objects.';
        }
        if (type === 'tool') {
            if (!isStringArray(content.strengths) || !isStringArray(content.weaknesses) || !isStringArray(content.platformTypes) || !isObject(content.pricing)) {
                return 'tool list fields and pricing must use the expected containers.';
            }
            if (!isSafeHttpUrl(content.toolUrl)) return 'toolUrl must be an http or https URL.';
        }
        if (type === 'article' && !isSafeHttpUrl(content.sourceUrl)) return 'sourceUrl must be an http or https URL.';
        if (type === 'video' && (!isSafeHttpUrl(content.videoUrl) || !isSafeHttpUrl(content.embedUrl))) return 'video URLs must use http or https.';
        if (type === 'link' && !isSafeHttpUrl(content.url)) return 'url must be an http or https URL.';
        if (type === 'download' && !isSafeHttpUrl(content.fileUrl)) return 'fileUrl must be an http or https URL.';
        if (type === 'event' && (!isSafeHttpUrl(content.onlineUrl) || !isSafeHttpUrl(content.bookingUrl))) return 'event URLs must use http or https.';
        if (type === 'showcase') {
            if (!isStringArray(content.toolsUsed)) return 'toolsUsed must be an array of strings.';
            if (!isSafeHttpUrl(content.projectUrl)) return 'projectUrl must be an http or https URL.';
        }
        return '';
    }

    function runtimeResourceIssue(resource, seenIds) {
        if (!isObject(resource)) return 'expected an object.';
        if (typeof resource.id !== 'string' || !resource.id.trim()) return 'id must be a non-empty string.';
        if (seenIds[resource.id]) return 'duplicate resource id "' + resource.id + '".';
        if (RESOURCE_TYPES.indexOf(resource.type) === -1) return 'type is not supported by the renderer.';
        if (typeof resource.title !== 'string' || typeof resource.summary !== 'string') return 'title and summary must be strings.';
        if (typeof resource.datePublished !== 'string' || typeof resource.dateUpdated !== 'string') return 'date fields must be strings.';
        if (LIBRARY_SECTIONS.indexOf(resource.librarySection) === -1) return 'librarySection is not supported.';
        if (!isStringArray(resource.skillAreas, SKILL_AREAS) || !isStringArray(resource.tags)) return 'skillAreas and tags must be arrays of supported strings.';
        if (typeof resource.featured !== 'boolean' || typeof resource.published !== 'boolean') return 'featured and published must be booleans.';
        if (resource.estimatedMinutes !== null && (typeof resource.estimatedMinutes !== 'number' || !isFinite(resource.estimatedMinutes))) return 'estimatedMinutes must be a finite number or null.';
        if (!isObject(resource.author)) return 'author must be an object.';
        if (['name', 'organisation', 'course', 'yearOfStudy'].some(function (field) { return typeof resource.author[field] !== 'string'; })) return 'author fields must be strings.';
        if (!isObject(resource.thumbnail) || typeof resource.thumbnail.src !== 'string' || typeof resource.thumbnail.alt !== 'string') return 'thumbnail must contain string src and alt fields.';
        if (!isSafeHttpUrl(resource.thumbnail.src)) return 'thumbnail.src must be an http or https URL.';
        var contentIssue = contentSafetyIssue(resource.type, resource.content);
        if (contentIssue) return contentIssue;
        seenIds[resource.id] = true;
        return '';
    }

    function warnSkippedResource(resource, index, message) {
        if (!window.console || !console.warn) return;
        var id = isObject(resource) && typeof resource.id === 'string' && resource.id ? ' ("' + resource.id + '")' : '';
        console.warn('GenAI Hub skipped malformed resource at resources[' + index + ']' + id + ': ' + message);
    }

    function validatePayload(payload) {
        if (!isObject(payload)) invalid('payload', 'expected an object.');
        if (payload.schemaVersion !== SCHEMA_VERSION) invalid('schemaVersion', 'expected "' + SCHEMA_VERSION + '".');
        if (typeof payload.lastUpdated !== 'string' || !payload.lastUpdated.trim()) invalid('lastUpdated', 'expected a non-empty string.');
        if (!Array.isArray(payload.resources)) invalid('resources', 'expected an array.');
        var seenIds = Object.create(null);
        var resources = payload.resources.filter(function (resource, index) {
            var issue = runtimeResourceIssue(resource, seenIds);
            if (!issue) return true;
            warnSkippedResource(resource, index, issue);
            return false;
        });
        if (payload.resources.length && !resources.length) invalid('resources', 'no usable resource records remain after defensive checks.');
        return { schemaVersion: payload.schemaVersion, lastUpdated: payload.lastUpdated, resources: resources };
    }

    function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
        return Object.freeze(value);
    }

    function buildIndex(resources) {
        resourceIndex = Object.create(null);
        resources.forEach(function (resource) { resourceIndex[resource.id] = resource; });
    }

    var loaderStatus = 'idle';
    var loaderError = null;
    var requestNumber = 0;
    var abortController = null;

    function abortError() {
        var error = new Error('Request superseded');
        error.name = 'AbortError';
        return error;
    }

    function load(force) {
        if (!force && loadedData) return Promise.resolve(loadedData);
        if (!force && inFlightRequest) return inFlightRequest;
        if (typeof window.fetch !== 'function') {
            loaderStatus = 'error';
            loaderError = new Error('This browser cannot load the GenAI Hub resource data.');
            return Promise.reject(loaderError);
        }

        requestNumber += 1;
        var activeRequest = requestNumber;
        if (abortController) abortController.abort();
        abortController = typeof window.AbortController === 'function' ? new window.AbortController() : null;
        loaderStatus = 'loading';
        loaderError = null;
        inFlightRequest = window.fetch(DATA_URL, {
            method: 'GET',
            credentials: 'omit',
            headers: { Accept: 'application/json' },
            signal: abortController ? abortController.signal : undefined
        }).then(function (response) {
            if (!response.ok) throw new Error('The resource data endpoint returned HTTP ' + response.status + '.');
            return response.json();
        }).then(function (payload) {
            if (activeRequest !== requestNumber) throw abortError();
            loadedData = deepFreeze(validatePayload(payload));
            buildIndex(loadedData.resources);
            loaderStatus = 'ready';
            inFlightRequest = null;
            abortController = null;
            return loadedData;
        }).catch(function (error) {
            if (activeRequest !== requestNumber) throw abortError();
            inFlightRequest = null;
            abortController = null;
            if (error.name !== 'AbortError') {
                loaderStatus = 'error';
                loaderError = error;
            }
            throw error;
        });

        return inFlightRequest;
    }

    function normaliseText(value) {
        var text = String(value || '').toLocaleLowerCase('en-GB');
        if (text.normalize) text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return text.replace(/\s+/g, ' ').trim();
    }

    function matchesTime(resource, buckets) {
        if (!buckets || !buckets.length) return true;
        var minutes = resource.estimatedMinutes;
        if (typeof minutes !== 'number') return false;
        return buckets.some(function (bucket) {
            if (bucket === 'under-10') return minutes < 10;
            if (bucket === '10-30') return minutes >= 10 && minutes <= 30;
            if (bucket === '31-60') return minutes >= 31 && minutes <= 60;
            return bucket === 'over-60' && minutes > 60;
        });
    }

    function relevance(resource, terms) {
        if (!terms.length) return 0;
        var title = normaliseText(resource.title);
        var summary = normaliseText(resource.summary);
        var tags = normaliseText(resource.tags.join(' '));
        var all = normaliseText(JSON.stringify(resource));
        return terms.reduce(function (score, term) {
            if (title.indexOf(term) !== -1) score += 8;
            if (summary.indexOf(term) !== -1) score += 4;
            if (tags.indexOf(term) !== -1) score += 3;
            if (all.indexOf(term) !== -1) score += 1;
            return score;
        }, 0);
    }

    function query(criteria) {
        criteria = criteria || {};
        var terms = normaliseText(criteria.search).split(' ').filter(Boolean);
        var types = criteria.types || [];
        var skills = criteria.skillAreas || [];
        var tags = (criteria.tags || []).map(normaliseText).filter(Boolean);
        var indexed = (loadedData ? loadedData.resources : []).map(function (resource, index) {
            return { resource: resource, index: index, score: relevance(resource, terms) };
        }).filter(function (entry) {
            var resource = entry.resource;
            var resourceTags = resource.tags.map(normaliseText);
            if (resource.published !== true) return false;
            if (criteria.librarySection && resource.librarySection !== criteria.librarySection) return false;
            if (criteria.featuredOnly && resource.featured !== true) return false;
            if (types.length && types.indexOf(resource.type) === -1) return false;
            if (skills.length && !skills.some(function (skill) { return resource.skillAreas.indexOf(skill) !== -1; })) return false;
            if (tags.length && !tags.some(function (tag) { return resourceTags.indexOf(tag) !== -1; })) return false;
            if (!matchesTime(resource, criteria.timeBuckets)) return false;
            return !terms.length || terms.every(function (term) { return normaliseText(JSON.stringify(resource)).indexOf(term) !== -1; });
        });

        indexed.sort(function (left, right) {
            if (criteria.sort === 'az') {
                var byTitle = left.resource.title.localeCompare(right.resource.title, 'en-GB', { sensitivity: 'base' });
                return byTitle || left.index - right.index;
            }
            if (criteria.sort === 'newest') {
                var byDate = right.resource.datePublished.localeCompare(left.resource.datePublished);
                return byDate || left.index - right.index;
            }
            if (terms.length && right.score !== left.score) return right.score - left.score;
            if (left.resource.featured !== right.resource.featured) return left.resource.featured ? -1 : 1;
            var updated = right.resource.dateUpdated.localeCompare(left.resource.dateUpdated);
            return updated || left.index - right.index;
        });
        return Object.freeze(indexed.map(function (entry) { return entry.resource; }));
    }

    var TYPE_QUERY = {
        article: 'articles', video: 'videos', link: 'links', download: 'downloads',
        prompt: 'prompts', workflow: 'workflows', tool: 'tools', event: 'events', showcase: 'showcases'
    };
    var QUERY_TYPE = Object.keys(TYPE_QUERY).reduce(function (map, type) {
        map[TYPE_QUERY[type]] = type;
        return map;
    }, {});
    var TYPE_LABELS = {
        article: 'Article', video: 'Video', link: 'Link', download: 'Download',
        prompt: 'Prompt', workflow: 'Workflow', tool: 'Tool review', event: 'Event', showcase: 'Showcase'
    };
    var SKILL_LABELS = { academic: 'Academic', workplace: 'Workplace', lifelong: 'Lifelong' };
    var SKILL_COLOURS = { academic: '#15803D', workplace: '#2563EB', lifelong: '#7C3AED' };
    var LIBRARY_URLS = {
        'learn-ai': 'https://moodle.bath.ac.uk/mod/page/view.php?id=1573031',
        challenges: 'https://moodle.bath.ac.uk/mod/page/view.php?id=1573032',
        community: 'https://moodle.bath.ac.uk/mod/page/view.php?id=1573033'
    };
    var activeDialog = null;

    function element(tag, className, textValue) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (textValue !== undefined && textValue !== null) node.textContent = String(textValue);
        return node;
    }

    function clear(node) {
        while (node && node.firstChild) node.removeChild(node.firstChild);
    }

    function formatDate(value) {
        if (!value) return '';
        var date = new Date(value + (value.indexOf('T') === -1 ? 'T00:00:00Z' : ''));
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function formatDateTime(value) {
        if (!value) return 'To be confirmed';
        var date = new Date(value);
        if (isNaN(date.getTime())) return 'To be confirmed';
        return date.toLocaleString('en-GB', {
            weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    }

    function formatRating(value) {
        return Number(value).toFixed(1).replace(/\.0$/, '') + '/5';
    }

    function appendBadge(parent, label, colour, textColour, borderColour) {
        var badge = element('span', 'badge rounded-pill px-2 py-1 mr-2 mb-2', label);
        badge.style.cssText = 'background:' + colour + ';color:' + (textColour || '#fff') + ';border:1px solid ' + (borderColour || colour) + ';font-size:.72rem;letter-spacing:.03em;line-height:1.2;';
        parent.appendChild(badge);
    }

    function appendSkillBadge(parent, resource) {
        if (resource.type === 'tool' || !resource.skillAreas.length) return;
        var skill = resource.skillAreas[0];
        appendBadge(parent, SKILL_LABELS[skill], SKILL_COLOURS[skill]);
    }

    function appendDialogBadges(parent, resource) {
        appendBadge(parent, TYPE_LABELS[resource.type], '#e6eef8', '#094685', '#b8cee3');
        appendSkillBadge(parent, resource);
        if (resource.featured) appendBadge(parent, 'Featured', '#f5c242', '#0b2442');
    }

    function appendLibraryBadges(parent, resource) {
        appendDialogBadges(parent, resource);
    }

    function appendThumbnail(parent, resource, compact) {
        if (!resource.thumbnail.src) return;
        var image = document.createElement('img');
        image.src = resource.thumbnail.src;
        image.alt = resource.thumbnail.alt;
        image.loading = 'lazy';
        image.className = 'img-fluid w-100';
        image.style.cssText = compact
            ? 'height:140px;object-fit:cover;border-radius:.5rem;'
            : 'max-height:360px;object-fit:cover;border-radius:12px;';
        parent.appendChild(image);
    }

    function appendCardContents(container, resource, badgeMode) {
        var badges = element('div', 'd-flex flex-wrap align-items-start mb-1');
        if (badgeMode === 'library') appendLibraryBadges(badges, resource);
        else appendSkillBadge(badges, resource);
        container.appendChild(badges);
        container.appendChild(element('h3', 'h5 font-weight-bold mt-2 mb-2', resource.title));
        if (resource.summary) {
            var summary = element('p', 'text-muted mb-3', resource.summary);
            summary.style.color = '#4f5962';
            container.appendChild(summary);
        }
        var media = element('div', 'mt-auto mb-3');
        appendThumbnail(media, resource, true);
        if (media.childNodes.length) container.appendChild(media);
        var byline = resource.author.name || resource.author.organisation;
        var cardDate = formatDate(resource.datePublished);
        if (byline || cardDate) {
            var meta = element('p', 'small font-weight-bold mb-0 mt-auto', [byline, cardDate].filter(Boolean).join(' · '));
            meta.style.color = '#5f4300';
            container.appendChild(meta);
        }
        var action = element('span', 'font-weight-bold d-inline-flex align-items-center mt-3', 'View details →');
        action.style.color = '#094685';
        container.appendChild(action);
    }

    function makeCardButton(resource, clone, badgeMode) {
        var button = element('button', 'btn text-left w-100 h-100 p-3 d-flex flex-column');
        button.type = 'button';
        button.setAttribute('data-resource-open', resource.id);
        button.setAttribute('aria-label', 'Open ' + resource.title);
        button.style.cssText = 'background:#fff;color:#0f172a;border:0;border-radius:1rem;white-space:normal;';
        if (clone) {
            button.tabIndex = -1;
            button.setAttribute('aria-hidden', 'true');
            button.setAttribute('data-resource-clone', 'true');
        }
        appendCardContents(button, resource, badgeMode);
        return button;
    }

    function createCarouselCard(resource, clone) {
        var card = element('div', 'card shadow rounded mr-4');
        card.style.cssText = 'width:300px;min-height:380px;flex-shrink:0;border:1px solid #94a3b8;border-radius:1rem;overflow:hidden;';
        card.setAttribute('data-resource-id', resource.id);
        if (clone) {
            card.setAttribute('data-resource-clone', 'true');
            card.setAttribute('aria-hidden', 'true');
        }
        card.appendChild(makeCardButton(resource, clone, 'landing'));
        return card;
    }

    function createCarouselPlaceholder(index, clone) {
        var card = element('div', 'card shadow rounded mr-4');
        card.style.cssText = 'width:300px;min-height:380px;flex-shrink:0;border:1px dashed #94a3b8;border-radius:1rem;overflow:hidden;background:#f8fafc;';
        card.setAttribute('data-resource-placeholder', String(index + 1));
        if (clone) {
            card.setAttribute('data-resource-clone', 'true');
            card.setAttribute('aria-hidden', 'true');
        }
        var content = element('div', 'h-100 p-4 d-flex flex-column align-items-center justify-content-center text-center');
        content.style.minHeight = '380px';
        content.appendChild(element('h3', 'h5 font-weight-bold mb-2', 'Coming soon'));
        var note = element('p', 'text-muted mb-0', 'A new featured resource will appear here.');
        note.style.color = '#4f5962';
        content.appendChild(note);
        card.appendChild(content);
        return card;
    }

    function createLibraryCard(resource) {
        var column = element('div', 'col-12 col-md-6 col-xl-4 mb-4');
        var article = element('article', 'card h-100 shadow-sm');
        article.style.cssText = 'border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;';
        article.setAttribute('data-resource-id', resource.id);
        article.appendChild(makeCardButton(resource, false, 'library'));
        column.appendChild(article);
        return column;
    }

    function panel(title) {
        var section = element('section', 'p-3 p-md-4 mb-3 border');
        section.style.cssText = 'background:#f8fafc;border-radius:12px;border-color:#d8e2ee!important;';
        var heading = element('h3', 'h6 font-weight-bold mb-3', title);
        heading.style.color = '#094685';
        section.appendChild(heading);
        return section;
    }

    function appendText(target, value) {
        if (!value) return;
        String(value).split(/\n\s*\n/).forEach(function (paragraph) {
            var p = element('p', 'mb-3', paragraph.trim());
            p.style.whiteSpace = 'pre-wrap';
            target.appendChild(p);
        });
    }

    function appendKeyValue(target, label, value) {
        if (value === undefined || value === null || value === '') return;
        var row = element('div', 'mb-3');
        row.appendChild(element('strong', 'd-block mb-1', label));
        var text = element('span', 'text-muted', value);
        text.style.color = '#4f5962';
        row.appendChild(text);
        target.appendChild(row);
    }

    function appendList(target, values) {
        if (!values || !values.length) return;
        var list = element('ul', 'mb-0 pl-3');
        values.forEach(function (value) { list.appendChild(element('li', 'mb-2', value)); });
        target.appendChild(list);
    }

    function sentenceCase(value) {
        if (!value) return '';
        var text = String(value).replace(/-/g, ' ');
        if (text.toUpperCase() === 'API') return 'API';
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    function formatMinutes(value) {
        return typeof value === 'number' && isFinite(value) ? value + (value === 1 ? ' minute' : ' minutes') : '';
    }

    function formatFileSize(value) {
        if (typeof value !== 'number' || !isFinite(value) || value < 0) return '';
        if (value < 1024) return value + (value === 1 ? ' byte' : ' bytes');
        var units = ['KB', 'MB', 'GB', 'TB'];
        var size = value / 1024;
        var index = 0;
        while (size >= 1024 && index < units.length - 1) {
            size /= 1024;
            index += 1;
        }
        return (size >= 10 ? Math.round(size) : Math.round(size * 10) / 10) + ' ' + units[index];
    }

    function appendFactGrid(target, title, facts) {
        var visible = facts.filter(function (fact) {
            return fact.value !== undefined && fact.value !== null && fact.value !== '';
        });
        if (!visible.length) return;
        var section = panel(title);
        var row = element('div', 'row mb-n3');
        visible.forEach(function (fact) {
            var column = element('div', 'col-12 col-sm-6 col-lg-4 mb-3');
            column.appendChild(element('strong', 'd-block mb-1', fact.label));
            var value = element('span', 'text-muted', fact.value);
            value.style.color = '#4f5962';
            column.appendChild(value);
            row.appendChild(column);
        });
        section.appendChild(row);
        target.appendChild(section);
    }

    function appendPills(target, values) {
        if (!values || !values.length) return;
        var list = element('div', 'd-flex flex-wrap mb-n2');
        values.forEach(function (value) {
            var pill = element('span', 'badge rounded-pill px-3 py-2 mr-2 mb-2', value);
            pill.style.cssText = 'background:#e6eef8;color:#094685;border:1px solid #b8cee3;font-size:.78rem;white-space:normal;';
            list.appendChild(pill);
        });
        target.appendChild(list);
    }

    function appendTopics(target, resource) {
        var exclusions = [resource.type, TYPE_LABELS[resource.type]].concat(resource.skillAreas || []).map(normaliseText);
        var topics = resource.tags.filter(function (tag, index) {
            var normalised = normaliseText(tag);
            return normalised && exclusions.indexOf(normalised) === -1
                && resource.tags.map(normaliseText).indexOf(normalised) === index;
        }).map(function (tag) { return sentenceCase(tag); });
        if (!topics.length) return;
        var section = panel('Topics');
        appendPills(section, topics);
        target.appendChild(section);
    }

    function externalAction(label, href, download) {
        if (!href) return null;
        var link = element('a', 'btn btn-primary rounded-pill font-weight-bold mr-2 mb-2', label);
        link.href = href;
        link.style.cssText = 'background:#094685;border-color:#094685;white-space:normal;';
        if (download) link.setAttribute('download', '');
        return link;
    }

    function copyText(value, status) {
        function done(message) { status.textContent = message; }
        if (window.navigator.clipboard && window.navigator.clipboard.writeText) {
            window.navigator.clipboard.writeText(value).then(function () { done('Prompt copied.'); }, function () { done('Copy failed. Select the prompt manually.'); });
            return;
        }
        var area = document.createElement('textarea');
        area.value = value;
        area.setAttribute('readonly', 'readonly');
        area.style.cssText = 'position:fixed;left:-9999px;top:0;';
        document.body.appendChild(area);
        area.select();
        try { document.execCommand('copy'); done('Prompt copied.'); }
        catch (error) { done('Copy failed. Select the prompt manually.'); }
        document.body.removeChild(area);
    }

    function makeIframe(url, title) {
        try {
            var parsed = new URL(url);
            if (parsed.protocol !== 'https:') return null;
        } catch (error) { return null; }
        var wrapper = element('div', 'mb-3');
        wrapper.style.cssText = 'position:relative;width:100%;padding-top:56.25%;background:#e8eef5;border-radius:12px;overflow:hidden;';
        var frame = document.createElement('iframe');
        frame.src = url;
        frame.title = title;
        frame.loading = 'lazy';
        frame.referrerPolicy = 'no-referrer';
        frame.setAttribute('sandbox', 'allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts');
        frame.setAttribute('allow', 'fullscreen; autoplay; encrypted-media; picture-in-picture');
        frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;';
        wrapper.appendChild(frame);
        return wrapper;
    }

    function renderArticle(resource, body, actions) {
        appendThumbnail(body, resource, false);
        appendFactGrid(body, 'At a glance', [
            { label: 'Reading time', value: formatMinutes(resource.content.readingTimeMinutes !== null ? resource.content.readingTimeMinutes : resource.estimatedMinutes) }
        ]);
        if (resource.content.body) {
            var content = panel('Article');
            appendText(content, resource.content.body);
            body.appendChild(content);
        }
        var source = externalAction('View original source', resource.content.sourceUrl);
        if (source) actions.appendChild(source);
    }

    function renderVideo(resource, body, actions) {
        var frame = makeIframe(resource.content.embedUrl, resource.title + ' video');
        if (frame) body.appendChild(frame);
        appendFactGrid(body, 'Video details', [
            { label: 'Provider', value: resource.content.provider },
            { label: 'Duration', value: formatMinutes(resource.content.durationSeconds === null ? resource.estimatedMinutes : Math.ceil(resource.content.durationSeconds / 60)) }
        ]);
        var view = externalAction('Open video', resource.content.videoUrl);
        if (view) actions.appendChild(view);
    }

    function renderLink(resource, body, actions) {
        var frame = makeIframe(resource.content.url, resource.title + ' website preview');
        if (frame) body.appendChild(frame);
        if (resource.content.description || resource.content.siteName || frame) {
            var details = panel('External resource');
            appendText(details, resource.content.description);
            appendKeyValue(details, 'Website', resource.content.siteName);
            if (frame) {
                var warning = element('p', 'small text-muted mb-0', 'If the preview is blocked by the external website, use View resource instead.');
                warning.style.color = '#4f5962';
                details.appendChild(warning);
            }
            body.appendChild(details);
        }
        appendFactGrid(body, 'At a glance', [
            { label: 'Estimated time', value: formatMinutes(resource.estimatedMinutes) }
        ]);
        var view = externalAction('View resource', resource.content.url);
        if (view) actions.appendChild(view);
    }

    function renderDownload(resource, body, actions) {
        appendThumbnail(body, resource, false);
        if (resource.content.description) {
            var description = panel('About this download');
            appendText(description, resource.content.description);
            body.appendChild(description);
        }
        appendFactGrid(body, 'Download details', [
            { label: 'File', value: resource.content.fileName },
            { label: 'Format', value: resource.content.fileFormat },
            { label: 'Version', value: resource.content.version },
            { label: 'File size', value: formatFileSize(resource.content.fileSizeBytes) },
            { label: 'Estimated time', value: formatMinutes(resource.estimatedMinutes) }
        ]);
        var download = externalAction('Download', resource.content.fileUrl, true);
        if (download) actions.appendChild(download);
    }

    function renderPrompt(resource, body, actions) {
        if (resource.content.purpose) {
            var purpose = panel('Purpose');
            appendText(purpose, resource.content.purpose);
            body.appendChild(purpose);
        }
        if (resource.content.promptText) {
            var promptPanel = panel('Prompt');
            var promptText = element('pre', 'p-3 mb-3', resource.content.promptText);
            promptText.style.cssText = 'white-space:pre-wrap;overflow:auto;background:#fff;border:1px solid #dee2e6;border-radius:10px;color:#0f172a;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:.9rem;';
            promptPanel.appendChild(promptText);
            var copy = element('button', 'btn btn-primary rounded-pill font-weight-bold', 'Copy prompt');
            copy.type = 'button';
            copy.style.cssText = 'background:#094685;border-color:#094685;';
            var status = element('span', 'ml-3 font-weight-bold');
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            copy.addEventListener('click', function () { copyText(resource.content.promptText, status); });
            promptPanel.appendChild(copy);
            promptPanel.appendChild(status);
            body.appendChild(promptPanel);
        }
        appendFactGrid(body, 'Prompt setup', [
            { label: 'Platforms', value: resource.content.platforms.join(', ') },
            { label: 'Models tested', value: resource.content.modelsTested.join(', ') },
            { label: 'Reasoning mode', value: resource.content.reasoningMode === 'either' ? 'Standard or reasoning' : sentenceCase(resource.content.reasoningMode) },
            { label: 'Estimated time', value: formatMinutes(resource.estimatedMinutes) }
        ]);
        if (resource.content.usageNotes) {
            var guidance = panel('Use it well');
            appendText(guidance, resource.content.usageNotes);
            body.appendChild(guidance);
        }
    }

    function renderWorkflow(resource, body) {
        if (resource.content.goal) {
            var goal = panel('Goal');
            appendText(goal, resource.content.goal);
            body.appendChild(goal);
        }
        appendFactGrid(body, 'Workflow overview', [
            { label: 'Estimated time', value: formatMinutes(resource.content.estimatedTotalMinutes !== null ? resource.content.estimatedTotalMinutes : resource.estimatedMinutes) },
            { label: 'Complexity', value: resource.content.complexityScore === null ? '' : resource.content.complexityScore + '/10' }
        ]);
        if (resource.content.steps.length) {
            var stepsPanel = panel('Workflow steps');
            var steps = element('ol', 'list-unstyled mb-0');
            resource.content.steps.slice().sort(function (a, b) { return a.stepNumber - b.stepNumber; }).forEach(function (step) {
                var item = element('li', 'd-flex align-items-start mb-3');
                var number = element('span', 'd-inline-flex align-items-center justify-content-center flex-shrink-0 mr-3 font-weight-bold', step.stepNumber);
                number.style.cssText = 'width:2rem;height:2rem;border-radius:50%;background:#094685;color:#fff;line-height:1;';
                var copy = element('div');
                copy.appendChild(element('strong', 'd-block mb-1', step.title || 'Step ' + step.stepNumber));
                var description = element('span', 'text-muted', step.description);
                description.style.color = '#4f5962';
                copy.appendChild(description);
                item.appendChild(number);
                item.appendChild(copy);
                steps.appendChild(item);
            });
            stepsPanel.appendChild(steps);
            body.appendChild(stepsPanel);
        }
        if (resource.content.reflection) {
            var reflection = panel('Reflect and check');
            appendText(reflection, resource.content.reflection);
            body.appendChild(reflection);
        }
    }

    function renderTool(resource, body, actions) {
        var overview = panel(resource.content.company || 'Tool review');
        var rating = element('div', 'd-inline-flex align-items-center rounded-pill px-3 py-2 mb-3 font-weight-bold', '★ ' + formatRating(resource.content.rating) + ' student rating');
        rating.style.cssText = 'background:#fff8df;color:#5f4300;border:1px solid #f5c242;';
        overview.appendChild(rating);
        appendText(overview, resource.content.overview);
        if (resource.content.reviewVerdict) {
            var verdict = element('div', 'p-3 mt-2 font-weight-bold', resource.content.reviewVerdict);
            verdict.style.cssText = 'background:#e6eef8;color:#094685;border-left:4px solid #094685;border-radius:0 10px 10px 0;';
            overview.appendChild(verdict);
        }
        body.appendChild(overview);
        var pricing = sentenceCase(resource.content.pricing.model);
        if (resource.content.pricing.cost !== null && resource.content.pricing.cost > 0) pricing += ' · ' + resource.content.pricing.cost;
        var repeatedAccessFacts = [pricing].concat(resource.content.platformTypes.map(sentenceCase)).map(normaliseText);
        var strengthsValues = resource.content.strengths.filter(function (value) {
            return repeatedAccessFacts.indexOf(normaliseText(value)) === -1;
        });
        var hasStrengths = strengthsValues.length > 0;
        var hasLimits = resource.content.weaknesses.length > 0;
        var comparisonColumnClass = hasStrengths && hasLimits ? 'col-12 col-lg-6 d-flex' : 'col-12 d-flex';
        var comparison = element('div', 'row');
        if (hasStrengths) {
            var strengthsColumn = element('div', comparisonColumnClass);
            var strengths = panel('Best for');
            strengths.className += ' w-100';
            appendList(strengths, strengthsValues);
            strengthsColumn.appendChild(strengths);
            comparison.appendChild(strengthsColumn);
        }
        if (hasLimits) {
            var limitsColumn = element('div', comparisonColumnClass);
            var limits = panel('Limitations and checking');
            limits.className += ' w-100';
            appendList(limits, resource.content.weaknesses);
            limitsColumn.appendChild(limits);
            comparison.appendChild(limitsColumn);
        }
        if (comparison.childNodes.length) body.appendChild(comparison);
        appendFactGrid(body, 'Access and availability', [
            { label: 'Pricing', value: pricing },
            { label: 'Platforms', value: resource.content.platformTypes.map(sentenceCase).join(', ') },
            { label: 'Review time', value: formatMinutes(resource.estimatedMinutes) }
        ]);
        if (resource.content.accessibilityNotes || resource.content.privacyNotes) {
            var responsibleUse = panel('Responsible use');
            appendKeyValue(responsibleUse, 'Accessibility', resource.content.accessibilityNotes);
            appendKeyValue(responsibleUse, 'Privacy', resource.content.privacyNotes);
            body.appendChild(responsibleUse);
        }
        var visit = externalAction('Visit tool', resource.content.toolUrl);
        if (visit) actions.appendChild(visit);
    }

    function eventDuration(content) {
        if (!content.startDateTime || !content.endDateTime) return '';
        var minutes = Math.round((new Date(content.endDateTime).getTime() - new Date(content.startDateTime).getTime()) / 60000);
        return minutes > 0 ? minutes + ' minutes' : '';
    }

    function renderEvent(resource, body, actions) {
        if (resource.content.description) {
            var description = panel('About this event');
            appendText(description, resource.content.description);
            body.appendChild(description);
        }
        var authorNames = [resource.author.name, resource.author.organisation].map(normaliseText);
        appendFactGrid(body, 'Event details', [
            { label: 'Host', value: authorNames.indexOf(normaliseText(resource.content.host)) === -1 ? resource.content.host : '' },
            { label: 'Starts', value: resource.content.startDateTime ? formatDateTime(resource.content.startDateTime) : '' },
            { label: 'Length', value: eventDuration(resource.content) },
            { label: 'Format', value: sentenceCase(resource.content.locationType) },
            { label: 'Location', value: resource.content.location || (resource.content.locationType === 'online' ? 'Online' : '') },
            { label: 'Capacity', value: resource.content.capacity === null ? '' : resource.content.capacity + ' places' }
        ]);
        var booking = externalAction(resource.content.bookingRequired ? 'Book' : 'View event', resource.content.bookingUrl || resource.content.onlineUrl);
        if (booking) {
            var bookingRow = element('div', 'd-flex flex-column flex-sm-row align-items-start align-items-sm-center justify-content-between p-3 mb-3 border');
            bookingRow.style.cssText = 'background:#fff8df;border-color:#f5c242!important;border-radius:12px;';
            var bookingCopy = element('div', 'mr-sm-3 mb-3 mb-sm-0');
            bookingCopy.appendChild(element('strong', 'd-block mb-1', resource.content.bookingRequired ? 'Reserve your place' : 'Event access'));
            var bookingNote = element('span', 'text-muted', resource.content.bookingRequired ? 'Booking is required for this event.' : 'See the event page for joining details.');
            bookingNote.style.color = '#4f5962';
            bookingCopy.appendChild(bookingNote);
            booking.style.marginBottom = '0';
            bookingRow.appendChild(bookingCopy);
            bookingRow.appendChild(booking);
            body.appendChild(bookingRow);
        }
    }

    function renderShowcase(resource, body, actions) {
        appendThumbnail(body, resource, false);
        appendFactGrid(body, 'Project contributor', [
            { label: 'Course', value: resource.author.course },
            { label: 'Year of study', value: resource.author.yearOfStudy ? 'Year ' + resource.author.yearOfStudy : '' },
            { label: 'Estimated time', value: formatMinutes(resource.estimatedMinutes) }
        ]);
        var stages = [
            { title: 'Problem', value: resource.content.problem },
            { title: 'Approach', value: resource.content.approach },
            { title: 'Outcome', value: resource.content.outcome }
        ].filter(function (stage) { return stage.value; });
        if (stages.length) {
            var story = element('section', 'mb-3');
            story.appendChild(element('h3', 'h6 font-weight-bold mb-3', 'Project story'));
            var row = element('div', 'row');
            stages.forEach(function (stage, index) {
                var column = element('div', 'col-12 col-lg-4 mb-3 d-flex');
                var card = element('div', 'p-3 p-md-4 border w-100');
                card.style.cssText = 'background:' + (index === 1 ? '#fff8df' : '#f8fafc') + ';border-color:#d8e2ee!important;border-radius:12px;';
                var stageNumber = index + 1;
                var number = element('div', 'small text-uppercase font-weight-bold mb-2', stageNumber < 10 ? '0' + stageNumber : String(stageNumber));
                number.style.cssText = 'color:#5f4300;letter-spacing:.08em;';
                card.appendChild(number);
                var heading = element('h4', 'h6 font-weight-bold mb-2', stage.title);
                heading.style.color = '#094685';
                card.appendChild(heading);
                appendText(card, stage.value);
                column.appendChild(card);
                row.appendChild(column);
            });
            story.appendChild(row);
            body.appendChild(story);
        }
        if (resource.content.toolsUsed.length) {
            var tools = panel('Tools used');
            appendPills(tools, resource.content.toolsUsed);
            body.appendChild(tools);
        }
        if (resource.content.reflection) {
            var reflection = panel('Reflection');
            appendText(reflection, resource.content.reflection);
            body.appendChild(reflection);
        }
        var view = externalAction('View project', resource.content.projectUrl);
        if (view) actions.appendChild(view);
    }

    function makeBrowseUrl(resource, source) {
        var root = source && source.closest ? source.closest('[data-resource-view]') : null;
        var base = root && root.getAttribute('data-resource-library-url');
        if (!base) base = LIBRARY_URLS[resource.librarySection];
        try {
            var url = new URL(base, window.location.href);
            url.searchParams.set('type', TYPE_QUERY[resource.type]);
            if (resource.skillAreas.length) url.searchParams.set('skill', resource.skillAreas[0]);
            else url.searchParams.delete('skill');
            return url.href;
        } catch (error) { return ''; }
    }

    function renderResourceDetails(resource, body, actions) {
        if (resource.type === 'article') renderArticle(resource, body, actions);
        else if (resource.type === 'video') renderVideo(resource, body, actions);
        else if (resource.type === 'link') renderLink(resource, body, actions);
        else if (resource.type === 'download') renderDownload(resource, body, actions);
        else if (resource.type === 'prompt') renderPrompt(resource, body, actions);
        else if (resource.type === 'workflow') renderWorkflow(resource, body);
        else if (resource.type === 'tool') renderTool(resource, body, actions);
        else if (resource.type === 'event') renderEvent(resource, body, actions);
        else renderShowcase(resource, body, actions);
    }

    function focusable(container) {
        return Array.prototype.slice.call(container.querySelectorAll('a[href],button:not([disabled]),iframe,[tabindex]:not([tabindex="-1"])'));
    }

    function closeDialog() {
        if (!activeDialog) return;
        var closing = activeDialog;
        activeDialog = null;
        document.removeEventListener('keydown', handleDialogKeydown);
        document.body.style.overflow = closing.bodyOverflow;
        if (closing.dialog.parentNode) closing.dialog.parentNode.removeChild(closing.dialog);
        if (closing.backdrop.parentNode) closing.backdrop.parentNode.removeChild(closing.backdrop);
        if (closing.trigger && closing.trigger.focus) closing.trigger.focus();
    }

    function handleDialogKeydown(event) {
        if (!activeDialog) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            closeDialog();
            return;
        }
        if (event.key !== 'Tab') return;
        var nodes = focusable(activeDialog.dialog);
        if (!nodes.length) return;
        var first = nodes[0];
        var last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function openDialog(resource, trigger) {
        closeDialog();
        var backdrop = element('div');
        backdrop.setAttribute('data-resource-popout-backdrop', 'true');
        backdrop.style.cssText = 'position:fixed;inset:0;z-index:1040;background:rgba(8,41,71,.78);';
        var dialog = element('div');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'resource-popout-title');
        dialog.setAttribute('data-resource-popout', resource.type);
        dialog.style.cssText = 'position:fixed;z-index:1050;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;width:calc(100% - 24px);max-width:960px;height:calc(100% - 24px);max-height:800px;overflow:hidden;background:#fff;color:#0f172a;border:1px solid #dee2e6;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.28);';

        var header = element('div', 'd-flex align-items-start justify-content-between p-3 p-md-4');
        header.style.cssText = 'gap:1rem;background:linear-gradient(135deg,#094685,#111827);border-top:6px solid #f5c242;color:#fff;';
        var headingWrap = element('div');
        var badges = element('div', 'd-flex flex-wrap mb-1');
        appendDialogBadges(badges, resource);
        headingWrap.appendChild(badges);
        var heading = element('h2', 'h3 font-weight-bold mb-1', resource.title);
        heading.id = 'resource-popout-title';
        headingWrap.appendChild(heading);
        var dialogByline = resource.author.name || resource.author.organisation;
        var dialogDate = formatDate(resource.datePublished);
        var bylineParts = [dialogByline];
        bylineParts.push(dialogDate);
        if (bylineParts.filter(Boolean).length) {
            var byline = element('p', 'mb-0', bylineParts.filter(Boolean).join(' · '));
            byline.style.color = '#e6eef8';
            headingWrap.appendChild(byline);
        }
        var close = element('button', 'btn btn-light rounded-pill font-weight-bold px-3 py-2', 'Close ×');
        close.type = 'button';
        close.setAttribute('data-resource-popout-close', 'true');
        close.addEventListener('click', closeDialog);
        header.appendChild(headingWrap);
        header.appendChild(close);

        var scroller = element('div', 'p-3 p-md-4');
        scroller.style.cssText = 'overflow:auto;min-height:0;';
        if (resource.summary) {
            var summary = element('p', 'lead mb-4', resource.summary);
            summary.style.cssText = 'color:#4f5962;font-size:1.05rem;line-height:1.55;';
            scroller.appendChild(summary);
        }
        var content = element('div');
        var actions = element('div', 'd-flex flex-wrap align-items-center mt-4');
        renderResourceDetails(resource, content, actions);
        appendTopics(content, resource);
        var browse = externalAction('Browse more like this', makeBrowseUrl(resource, trigger));
        if (browse) actions.appendChild(browse);
        content.appendChild(actions);
        scroller.appendChild(content);
        dialog.appendChild(header);
        dialog.appendChild(scroller);

        backdrop.addEventListener('click', closeDialog);
        document.body.appendChild(backdrop);
        document.body.appendChild(dialog);
        activeDialog = { backdrop: backdrop, dialog: dialog, trigger: trigger, bodyOverflow: document.body.style.overflow };
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', handleDialogKeydown);
        close.focus();
    }

    document.addEventListener('click', function (event) {
        var trigger = event.target.closest ? event.target.closest('[data-resource-open]') : null;
        if (!trigger) return;
        var resource = resourceIndex[trigger.getAttribute('data-resource-open')];
        if (!resource) return;
        event.preventDefault();
        openDialog(resource, trigger);
    });

    document.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        var trigger = event.target.closest ? event.target.closest('[data-resource-open]') : null;
        if (!trigger || /^(BUTTON|A)$/.test(trigger.tagName)) return;
        event.preventDefault();
        var resource = resourceIndex[trigger.getAttribute('data-resource-open')];
        if (resource) openDialog(resource, trigger);
    });

    function validValues(values, allowed) {
        return values.filter(function (value, index) { return allowed.indexOf(value) !== -1 && values.indexOf(value) === index; });
    }

    function normaliseTags(values) {
        return values.map(normaliseText).filter(function (value, index, tags) {
            return value && tags.indexOf(value) === index;
        });
    }

    function tagLabel(value) {
        return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, function (letter) { return letter.toLocaleUpperCase('en-GB'); });
    }

    function readLibraryState(root) {
        var url = new URL(window.location.href);
        var section = root.getAttribute('data-resource-section');
        var allowedTypes = SECTION_TYPES[section];
        var types = validValues(url.searchParams.getAll('type').map(function (value) { return QUERY_TYPE[value] || ''; }), allowedTypes);
        var skills = validValues(url.searchParams.getAll('skill'), SKILL_AREAS);
        var tags = normaliseTags(url.searchParams.getAll('tag'));
        var sort = url.searchParams.get('sort');
        return {
            query: url.searchParams.get('q') || '',
            skills: skills,
            tags: tags,
            featured: url.searchParams.get('featured') === '1',
            types: types,
            times: validValues(url.searchParams.getAll('time'), ['under-10', '10-30', '31-60', 'over-60']),
            sort: ['relevant', 'newest', 'az'].indexOf(sort) === -1 ? 'relevant' : sort,
            visible: Math.max(1, parseInt(root.getAttribute('data-resource-page-size'), 10) || 9)
        };
    }

    function writeLibraryState(state) {
        try {
            var url = new URL(window.location.href);
            ['type', 'skill', 'tag', 'featured', 'time', 'q', 'sort'].forEach(function (key) { url.searchParams.delete(key); });
            state.types.forEach(function (type) { url.searchParams.append('type', TYPE_QUERY[type]); });
            state.skills.forEach(function (skill) { url.searchParams.append('skill', skill); });
            state.tags.forEach(function (tag) { url.searchParams.append('tag', tag); });
            if (state.featured) url.searchParams.set('featured', '1');
            state.times.forEach(function (time) { url.searchParams.append('time', time); });
            if (state.query) url.searchParams.set('q', state.query);
            if (state.sort !== 'relevant') url.searchParams.set('sort', state.sort);
            window.history.replaceState({}, '', url.pathname + url.search + url.hash);
        } catch (error) {
            if (window.console && console.warn) console.warn('GenAI Hub could not update library filters.', error);
        }
    }

    function setPressed(button, active) {
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
        button.classList.toggle('btn-primary', active);
        button.classList.toggle('btn-outline-primary', !active);
        if (active) {
            button.style.backgroundColor = '#094685';
            button.style.borderColor = '#094685';
        } else {
            button.style.backgroundColor = '';
            button.style.borderColor = '';
        }
    }

    function syncTagSummary(root, state) {
        var summary = root.querySelector('[data-resource-tag-summary]');
        if (!summary) return;
        var hasTags = state.tags.length > 0;
        var label = summary.querySelector('[data-resource-tag-label]');
        var reset = summary.querySelector('[data-resource-tag-reset]');
        summary.hidden = !hasTags;
        if (label && hasTags) {
            label.textContent = (state.tags.length === 1 ? 'Filtering by topic tag: ' : 'Filtering by topic tags: ')
                + state.tags.map(tagLabel).join(', ');
        }
        if (reset) reset.disabled = !hasTags;
    }

    function syncLibraryControls(root, state) {
        var search = root.querySelector('[data-resource-search]');
        if (search && search.value !== state.query) search.value = state.query;
        Array.prototype.forEach.call(root.querySelectorAll('[data-resource-skill]'), function (button) {
            var value = button.getAttribute('data-resource-skill');
            setPressed(button, value === 'featured' ? state.featured : state.skills.indexOf(value) !== -1);
        });
        Array.prototype.forEach.call(root.querySelectorAll('[data-resource-skill-checkbox]'), function (control) {
            control.checked = state.skills.indexOf(control.getAttribute('data-resource-skill-checkbox')) !== -1;
        });
        Array.prototype.forEach.call(root.querySelectorAll('[data-resource-type]'), function (control) {
            var active = state.types.indexOf(control.getAttribute('data-resource-type')) !== -1;
            if (control.type === 'checkbox') control.checked = active;
            else setPressed(control, control.getAttribute('data-resource-type') === 'all' ? state.types.length === 0 : active);
        });
        Array.prototype.forEach.call(root.querySelectorAll('[data-resource-time]'), function (control) {
            control.checked = state.times.indexOf(control.getAttribute('data-resource-time')) !== -1;
        });
        var sort = root.querySelector('[data-resource-sort]');
        if (sort) sort.value = state.sort;
        syncTagSummary(root, state);
    }

    function showLibraryStatus(root, name, message) {
        ['loading', 'error', 'empty'].forEach(function (status) {
            var node = root.querySelector('[data-resource-' + status + ']');
            if (node) node.hidden = status !== name;
        });
        var results = root.querySelector('[data-resource-target="results"]') || root.querySelector('[data-resource-results]');
        if (results) results.hidden = name === 'loading' || name === 'error';
        if (name === 'error') {
            var errorMessage = root.querySelector('[data-resource-error-message]');
            if (errorMessage) errorMessage.textContent = message || 'The resource library is currently unavailable.';
        }
    }

    function renderLibrary(root) {
        var state = root._resourceLibraryState;
        var resources = query({
            librarySection: root.getAttribute('data-resource-section'),
            featuredOnly: state.featured,
            types: state.types,
            skillAreas: state.skills,
            tags: state.tags,
            timeBuckets: state.times,
            search: state.query,
            sort: state.sort
        });
        var results = root.querySelector('[data-resource-target="results"]') || root.querySelector('[data-resource-results]');
        var count = root.querySelector('[data-resource-count]');
        var loadMore = root.querySelector('[data-resource-load-more]');
        if (count) count.textContent = resources.length + (resources.length === 1 ? ' resource' : ' resources');
        clear(results);
        resources.slice(0, state.visible).forEach(function (resource) { results.appendChild(createLibraryCard(resource)); });
        showLibraryStatus(root, resources.length ? '' : 'empty');
        results.hidden = !resources.length;
        if (loadMore) {
            loadMore.hidden = state.visible >= resources.length;
            loadMore.setAttribute('aria-label', 'Load more resources, ' + Math.max(0, resources.length - state.visible) + ' remaining');
        }
        syncLibraryControls(root, state);
        writeLibraryState(state);
    }

    function bindLibrary(root) {
        var state = root._resourceLibraryState;
        var search = root.querySelector('[data-resource-search]');
        var form = root.querySelector('[data-resource-search-form]');
        var timer;
        function changed() {
            state.visible = parseInt(root.getAttribute('data-resource-page-size'), 10) || 9;
            renderLibrary(root);
        }
        if (search) {
            search.disabled = false;
            search.addEventListener('input', function () {
                window.clearTimeout(timer);
                timer = window.setTimeout(function () { state.query = search.value.trim(); changed(); }, 150);
            });
        }
        if (form) {
            var submit = form.querySelector('button[type="submit"]');
            if (submit) submit.disabled = false;
            form.addEventListener('submit', function (event) { event.preventDefault(); state.query = search.value.trim(); changed(); });
        }
        Array.prototype.forEach.call(root.querySelectorAll('[data-resource-skill]'), function (button) {
            button.disabled = false;
            button.addEventListener('click', function () {
                var value = button.getAttribute('data-resource-skill');
                if (value === 'featured') {
                    state.featured = !state.featured;
                    state.skills = [];
                } else {
                    state.skills = state.skills.length === 1 && state.skills[0] === value ? [] : [value];
                    state.featured = false;
                }
                changed();
            });
        });
        Array.prototype.forEach.call(root.querySelectorAll('[data-resource-skill-checkbox]'), function (control) {
            control.disabled = false;
            control.addEventListener('change', function () {
                var value = control.getAttribute('data-resource-skill-checkbox');
                if (control.checked) state.skills.push(value);
                else state.skills = state.skills.filter(function (skill) { return skill !== value; });
                state.featured = false;
                changed();
            });
        });
        Array.prototype.forEach.call(root.querySelectorAll('[data-resource-type]'), function (control) {
            control.disabled = false;
            var eventName = control.type === 'checkbox' ? 'change' : 'click';
            control.addEventListener(eventName, function () {
                var value = control.getAttribute('data-resource-type');
                if (root.getAttribute('data-resource-section') === 'community') {
                    state.types = value === 'all' ? [] : [value];
                } else if (control.checked) state.types.push(value);
                else state.types = state.types.filter(function (type) { return type !== value; });
                changed();
            });
        });
        Array.prototype.forEach.call(root.querySelectorAll('[data-resource-time]'), function (control) {
            control.disabled = false;
            control.addEventListener('change', function () {
                var value = control.getAttribute('data-resource-time');
                if (control.checked) state.times.push(value);
                else state.times = state.times.filter(function (time) { return time !== value; });
                changed();
            });
        });
        var sort = root.querySelector('[data-resource-sort]');
        if (sort) {
            sort.disabled = false;
            sort.addEventListener('change', function () { state.sort = sort.value; changed(); });
        }
        Array.prototype.forEach.call(root.querySelectorAll('[data-resource-reset]'), function (button) {
            button.disabled = false;
            button.addEventListener('click', function () {
                state.query = ''; state.skills = []; state.tags = []; state.featured = false; state.types = []; state.times = []; state.sort = 'relevant';
                changed();
            });
        });
        Array.prototype.forEach.call(root.querySelectorAll('[data-resource-tag-reset]'), function (button) {
            button.addEventListener('click', function () {
                state.tags = [];
                changed();
            });
        });
        var loadMore = root.querySelector('[data-resource-load-more]');
        if (loadMore) loadMore.addEventListener('click', function () { state.visible += parseInt(root.getAttribute('data-resource-page-size'), 10) || 9; renderLibrary(root); });
        var retry = root.querySelector('[data-resource-retry]');
        if (retry) retry.addEventListener('click', function () { mountLibrary(root, true); });
    }

    function mountLibrary(root, retry) {
        if (!root._resourceLibraryState) {
            root._resourceLibraryState = readLibraryState(root);
            bindLibrary(root);
        }
        root.setAttribute('aria-busy', 'true');
        showLibraryStatus(root, 'loading');
        (retry ? resourcesApi.reload() : resourcesApi.ready).then(function () {
            root.setAttribute('aria-busy', 'false');
            renderLibrary(root);
        }, function (error) {
            if (error.name === 'AbortError') return;
            root.setAttribute('aria-busy', 'false');
            showLibraryStatus(root, 'error', error.message);
        });
    }

    function showViewError(root, message, retryHandler) {
        var target = root.querySelector('[data-resource-target="featured"]') || root.querySelector('[data-resource-featured-track]') || root.querySelector('[data-resource-view-status]') || root;
        clear(target);
        var alert = element('div', 'alert alert-danger m-3', message || 'Resources are currently unavailable.');
        var retry = element('button', 'btn btn-outline-danger ml-3', 'Retry');
        retry.type = 'button';
        retry.addEventListener('click', retryHandler);
        alert.appendChild(retry);
        target.appendChild(alert);
    }

    function renderFeatured(root) {
        var section = root.getAttribute('data-resource-section');
        var resources = query({ librarySection: section, featuredOnly: true, sort: 'relevant' });
        var track = root.querySelector('[data-resource-target="featured"]') || root.querySelector('[data-resource-featured-track]');
        if (!track) return;
        clear(track);
        var canonical = resources.map(function (resource) { return { resource: resource }; });
        for (var i = 0; i < 7; i += 1) canonical.push({ placeholder: i });
        canonical.forEach(function (item) {
            track.appendChild(item.resource ? createCarouselCard(item.resource, false) : createCarouselPlaceholder(item.placeholder, false));
        });
        canonical.forEach(function (item) {
            track.appendChild(item.resource ? createCarouselCard(item.resource, true) : createCarouselPlaceholder(item.placeholder, true));
        });
    }

    function mountFeatured(root, retry) {
        root.setAttribute('aria-busy', 'true');
        (retry ? resourcesApi.reload() : resourcesApi.ready).then(function () {
            root.setAttribute('aria-busy', 'false');
            renderFeatured(root);
        }, function (error) {
            if (error.name === 'AbortError') return;
            root.setAttribute('aria-busy', 'false');
            showViewError(root, error.message, function () { mountFeatured(root, true); });
        });
    }

    function communitySlots(section, type) {
        var slots = Array.prototype.slice.call(section.querySelectorAll('[data-hover-card="true"]'));
        if (type === 'event') {
            var lead = section.querySelector('.row > .col-lg-4 > a');
            if (lead && slots.indexOf(lead) === -1) slots.unshift(lead);
        }
        return slots;
    }

    var COMMUNITY_ACTIONS = {
        showcase: 'View Work',
        prompt: 'Use Prompt',
        workflow: 'View Workflow',
        tool: 'Read Review',
        event: 'View Event'
    };

    function restoreCommunitySlot(slot) {
        if (!slot._resourceOriginalAppearance) {
            slot._resourceOriginalAppearance = {
                className: slot.className,
                style: slot.getAttribute('style'),
                href: slot.getAttribute('href'),
                role: slot.getAttribute('role'),
                tabIndex: slot.getAttribute('tabindex'),
                ariaLabel: slot.getAttribute('aria-label')
            };
        }
        var original = slot._resourceOriginalAppearance;
        slot.className = original.className;
        if (original.style === null) slot.removeAttribute('style');
        else slot.setAttribute('style', original.style);
        if (original.href === null) slot.removeAttribute('href');
        else slot.setAttribute('href', original.href);
        if (original.role === null) slot.removeAttribute('role');
        else slot.setAttribute('role', original.role);
        if (original.tabIndex === null) slot.removeAttribute('tabindex');
        else slot.setAttribute('tabindex', original.tabIndex);
        if (original.ariaLabel === null) slot.removeAttribute('aria-label');
        else slot.setAttribute('aria-label', original.ariaLabel);
        slot.removeAttribute('data-resource-open');
        slot.removeAttribute('data-resource-id');
        slot.removeAttribute('data-resource-placeholder');
        slot.removeAttribute('aria-disabled');
        slot.hidden = false;
        clear(slot);
    }

    function communityAction(label, colour) {
        var action = element('span', 'font-weight-bold mt-auto pt-3 d-inline-flex align-items-center');
        action.style.cssText = 'color:' + (colour || '#094685') + ';font-size:1.05rem;line-height:1.1;';
        action.appendChild(document.createTextNode(label + ' '));
        var icon = element('i', 'fa-solid fa-arrow-up-right-from-square ml-1', '\u200B');
        icon.setAttribute('aria-hidden', 'true');
        icon.style.cssText = 'line-height:1;font-size:1.05rem;vertical-align:-0.18em;';
        action.appendChild(icon);
        return action;
    }

    function communitySkill(resource, marginClass) {
        if (resource.type === 'tool' || !resource.skillAreas.length) return null;
        var skill = resource.skillAreas[0];
        var badge = element('span', 'badge rounded-pill px-2 py-1 ' + (marginClass || 'mb-3'), SKILL_LABELS[skill]);
        badge.style.cssText = 'background:' + SKILL_COLOURS[skill] + ';color:#fff;border:1px solid ' + SKILL_COLOURS[skill] + ';font-size:.72rem;letter-spacing:.03em;line-height:1.2;';
        return badge;
    }

    function appendCommunitySummary(parent, value, dark) {
        if (!value) return;
        var summary = element('p', 'mb-3', value);
        summary.style.color = dark ? '#e6eef8' : '#4f5962';
        parent.appendChild(summary);
    }

    function appendCommunityAuthor(parent, resource, prefix) {
        var author = resource.author.name || resource.author.organisation;
        if (!author) return;
        var line = element('small', 'font-weight-bold d-block mb-1', (prefix || 'By') + ' ' + author);
        line.style.color = '#5f4300';
        parent.appendChild(line);
    }

    function appendCompactMetadata(parent, label, values) {
        if (!values || !values.length) return;
        var heading = element('div', 'small text-uppercase font-weight-bold mb-1', label);
        heading.style.cssText = 'color:#5f4300;letter-spacing:.08em;';
        parent.appendChild(heading);
        var value = element('div', 'text-muted mb-2', values.join(' · '));
        value.style.cssText = 'color:#4f5962!important;font-size:.9rem;line-height:1.4;';
        parent.appendChild(value);
    }

    function appendShowcaseMedia(parent, resource) {
        var mediaWrap = element('div', 'px-4');
        if (resource.thumbnail.src) {
            var image = document.createElement('img');
            image.src = resource.thumbnail.src;
            image.alt = resource.thumbnail.alt || ('Project image for ' + resource.title);
            image.loading = 'lazy';
            image.className = 'img-fluid w-100';
            image.style.cssText = 'height:180px;object-fit:cover;border-radius:10px;';
            mediaWrap.appendChild(image);
        } else {
            var placeholder = element('div', 'd-flex flex-column align-items-center justify-content-center text-center p-4');
            placeholder.setAttribute('role', 'img');
            placeholder.setAttribute('aria-label', 'Project image coming soon for ' + resource.title);
            placeholder.style.cssText = 'height:180px;background:#f4f7fb;border:2px dashed #9fbfdd;border-radius:10px;color:#094685;';
            var icon = element('i', 'fa-regular fa-image mb-3', '\u200B');
            icon.setAttribute('aria-hidden', 'true');
            icon.style.cssText = 'font-size:2rem;line-height:1;color:#f5c242;';
            placeholder.appendChild(icon);
            placeholder.appendChild(element('strong', 'd-block mb-1', 'Project image coming soon'));
            var note = element('small', 'd-block', 'No image has been provided yet.');
            note.style.color = '#4f5962';
            placeholder.appendChild(note);
            mediaWrap.appendChild(placeholder);
        }
        parent.appendChild(mediaWrap);
    }

    function activateCommunitySlot(slot, resource) {
        slot.hidden = false;
        slot.setAttribute('data-resource-open', resource.id);
        slot.setAttribute('data-resource-id', resource.id);
        slot.setAttribute('aria-label', 'Open ' + resource.title);
        if (slot.tagName === 'A') slot.setAttribute('href', makeBrowseUrl(resource, slot));
        else {
            slot.setAttribute('role', 'button');
            slot.setAttribute('tabindex', '0');
        }
    }

    function renderShowcaseLandingCard(slot, resource, featured) {
        if (featured) {
            var heading = element('div', 'p-4 pb-2');
            var skill = communitySkill(resource, 'mb-2');
            if (skill) heading.appendChild(skill);
            heading.appendChild(element('h3', 'h4 font-weight-bold mb-0', resource.title));
            slot.appendChild(heading);
            appendShowcaseMedia(slot, resource);
            var body = element('div', 'p-4 pt-2 d-flex flex-column flex-fill');
            appendCommunitySummary(body, resource.summary, false);
            appendCommunityAuthor(body, resource, 'Project by');
            body.appendChild(communityAction(COMMUNITY_ACTIONS.showcase));
            slot.appendChild(body);
            return;
        }
        var wrapper = element('div', 'd-flex flex-column align-items-start w-100 h-100');
        var badge = communitySkill(resource);
        if (badge) wrapper.appendChild(badge);
        wrapper.appendChild(element('h4', 'h5 font-weight-bold', resource.title));
        appendCommunitySummary(wrapper, resource.summary, false);
        appendCommunityAuthor(wrapper, resource, 'Project by');
        wrapper.appendChild(communityAction(COMMUNITY_ACTIONS.showcase));
        slot.appendChild(wrapper);
    }

    function renderPromptLandingCard(slot, resource) {
        var wrapper = element('div', 'd-flex flex-column align-items-start w-100 h-100');
        var badge = communitySkill(resource);
        if (badge) wrapper.appendChild(badge);
        wrapper.appendChild(element('h3', 'h5 font-weight-bold', resource.title));
        appendCommunitySummary(wrapper, resource.summary, false);
        wrapper.appendChild(communityAction(COMMUNITY_ACTIONS.prompt));
        slot.appendChild(wrapper);
    }

    function renderWorkflowLandingCard(slot, resource) {
        var wrapper = element('div', 'd-flex flex-column align-items-start w-100 h-100');
        var heading = element('div', 'd-flex flex-column flex-sm-row justify-content-between align-items-sm-start mb-3 w-100');
        var headingCopy = element('div', 'pr-sm-4');
        headingCopy.appendChild(element('h3', 'h4 font-weight-bold mb-2', resource.title));
        appendCommunitySummary(headingCopy, resource.summary || resource.content.goal, false);
        heading.appendChild(headingCopy);
        var badge = communitySkill(resource, 'mt-3 mt-sm-0 ml-sm-3 align-self-start');
        if (badge) heading.appendChild(badge);
        wrapper.appendChild(heading);
        var steps = element('div', 'row align-items-stretch w-100');
        resource.content.steps.slice(0, 3).forEach(function (step, index) {
            if (index) {
                var arrow = element('div', 'col-12 col-md-auto mb-3 px-md-1 d-flex align-items-center justify-content-center font-weight-bold');
                arrow.style.cssText = 'color:#094685;font-size:1.5rem;line-height:1;min-width:34px;';
                arrow.setAttribute('role', 'img');
                arrow.setAttribute('aria-label', 'Next step');
                var across = element('span', 'd-none d-md-inline', '→');
                across.setAttribute('aria-hidden', 'true');
                var down = element('span', 'd-md-none', '↓');
                down.setAttribute('aria-hidden', 'true');
                arrow.appendChild(across);
                arrow.appendChild(down);
                steps.appendChild(arrow);
            }
            var column = element('div', 'col-12 col-md mb-3 px-md-2');
            var box = element('div', 'p-3 border h-100');
            box.style.cssText = 'background:' + (index === 1 ? '#fff8df' : '#f8fafc') + ';border-color:' + (index === 1 ? '#f5c242' : '#dee2e6') + '!important;border-radius:12px;min-height:110px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;';
            var number = element('span', 'd-inline-flex align-items-center justify-content-center rounded-circle font-weight-bold mb-3', String(step.stepNumber || index + 1));
            number.style.cssText = 'width:34px;height:34px;background:#094685;color:#f5c242;';
            box.appendChild(number);
            box.appendChild(element('div', 'font-weight-bold mb-0', step.title || 'Step ' + (index + 1)));
            column.appendChild(box);
            steps.appendChild(column);
        });
        wrapper.appendChild(steps);
        wrapper.appendChild(communityAction(COMMUNITY_ACTIONS.workflow));
        slot.appendChild(wrapper);
    }

    function renderToolLandingCard(slot, resource, featured) {
        if (featured) {
            var row = element('div', 'row no-gutters align-items-stretch w-100');
            var lead = element('div', 'col-lg-5 text-white p-4 p-lg-5');
            lead.style.cssText = 'background:linear-gradient(145deg,#094685,#111827);border-top:6px solid #f5c242;';
            var label = element('div', 'text-uppercase font-weight-bold mb-3', 'Community favourite tool');
            label.style.cssText = 'letter-spacing:.12em;color:#f5c242;font-size:.78rem;';
            lead.appendChild(label);
            var identity = element('div', 'd-flex align-items-center mb-4');
            var tile = element('div', 'd-flex align-items-center justify-content-center mr-3 overflow-hidden');
            tile.style.cssText = 'width:70px;height:70px;min-width:70px;background:rgba(255,255,255,.14);font-size:2rem;color:#f5c242;border-radius:12px;';
            if (resource.thumbnail.src) {
                var logo = document.createElement('img');
                logo.src = resource.thumbnail.src;
                logo.alt = resource.thumbnail.alt || (resource.title + ' logo');
                logo.loading = 'lazy';
                logo.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                tile.appendChild(logo);
            } else {
                var toolIcon = element('i', 'fa-solid fa-screwdriver-wrench', '\u200B');
                toolIcon.setAttribute('aria-hidden', 'true');
                toolIcon.style.lineHeight = '1';
                tile.appendChild(toolIcon);
            }
            var identityCopy = element('div');
            identityCopy.appendChild(element('h3', 'font-weight-bold mb-1', resource.title));
            var score = element('div', 'font-weight-bold', '★ ' + formatRating(resource.content.rating) + ' student rating');
            score.style.color = '#fde68a';
            identityCopy.appendChild(score);
            identity.appendChild(tile);
            identity.appendChild(identityCopy);
            lead.appendChild(identity);
            var leadSummary = element('p', 'lead mb-4', resource.summary || resource.content.overview);
            leadSummary.style.color = '#e6eef8';
            lead.appendChild(leadSummary);
            var details = element('div', 'col-lg-7 p-4 p-lg-5 d-flex flex-column');
            details.appendChild(element('h4', 'font-weight-bold mb-2', 'Best for'));
            if (resource.content.overview) {
                var overview = element('p', 'text-muted', resource.content.overview);
                overview.style.color = '#4f5962';
                details.appendChild(overview);
            }
            var strengths = element('div', 'row');
            resource.content.strengths.slice(0, 4).forEach(function (value) {
                var column = element('div', 'col-sm-6 mb-3');
                var box = element('div', 'p-3 border h-100 d-flex align-items-start');
                box.style.cssText = 'background:#f8fafc;border-radius:10px;';
                var check = element('i', 'fa-solid fa-circle-check mr-2 mt-1', '\u200B');
                check.setAttribute('aria-hidden', 'true');
                check.style.cssText = 'line-height:1;color:#157347;';
                box.appendChild(check);
                box.appendChild(document.createTextNode(value));
                column.appendChild(box);
                strengths.appendChild(column);
            });
            details.appendChild(strengths);
            row.appendChild(lead);
            row.appendChild(details);
            slot.appendChild(row);
            return;
        }
        var wrapper = element('div', 'd-flex flex-column align-items-start w-100 h-100');
        var heading = element('div', 'd-flex flex-column flex-sm-row justify-content-between align-items-sm-start mb-3 w-100');
        heading.appendChild(element('h4', 'h5 font-weight-bold mb-0', resource.title));
        var rating = element('div', 'font-weight-bold mt-2 mt-sm-0 ml-sm-3', formatRating(resource.content.rating));
        rating.style.color = '#094685';
        heading.appendChild(rating);
        wrapper.appendChild(heading);
        appendCommunitySummary(wrapper, resource.summary || resource.content.overview, false);
        wrapper.appendChild(communityAction(COMMUNITY_ACTIONS.tool));
        slot.appendChild(wrapper);
    }

    function twoDigits(value) {
        return value < 10 ? '0' + value : String(value);
    }

    function startLandingCountdown(root, target, resource) {
        function update() {
            var start = new Date(resource.content.startDateTime).getTime();
            var end = new Date(resource.content.endDateTime || resource.content.startDateTime).getTime();
            var now = Date.now();
            if (!isFinite(start)) {
                target.textContent = 'Date to be confirmed';
                return;
            }
            if (isFinite(end) && now >= end) {
                target.textContent = 'Event has ended';
                return;
            }
            if (now >= start) {
                target.textContent = 'Happening now';
                return;
            }
            var remaining = start - now;
            var days = Math.floor(remaining / 86400000);
            var hours = Math.floor((remaining % 86400000) / 3600000);
            var minutes = Math.floor((remaining % 3600000) / 60000);
            var seconds = Math.floor((remaining % 60000) / 1000);
            target.textContent = days + 'd ' + twoDigits(hours) + 'h ' + twoDigits(minutes) + 'm ' + twoDigits(seconds) + 's';
        }
        update();
        var timer = window.setInterval(update, 1000);
        root._resourceCountdownTimers.push(timer);
    }

    function renderEventLandingCard(root, slot, resource, featured) {
        if (featured) {
            var wrapper = element('div');
            wrapper.style.color = '#fff';
            var label = element('div', 'text-uppercase mb-3', 'Next up');
            label.style.cssText = 'letter-spacing:.12em;color:#f5c242;font-size:.78rem;';
            wrapper.appendChild(label);
            var badge = communitySkill(resource);
            if (badge) wrapper.appendChild(badge);
            wrapper.appendChild(element('h3', 'font-weight-bold', resource.title));
            appendCommunitySummary(wrapper, resource.summary || resource.content.description, true);
            var countdown = element('div', 'mb-3');
            countdown.setAttribute('aria-live', 'polite');
            countdown.setAttribute('aria-atomic', 'true');
            var countdownLabel = element('div', 'text-uppercase font-weight-bold mb-1', 'Event starts in');
            countdownLabel.style.cssText = 'letter-spacing:.08em;color:#fde68a;font-size:.72rem;';
            var value = element('div', 'font-weight-bold');
            value.style.cssText = 'font-size:1.15rem;color:#fff;';
            countdown.appendChild(countdownLabel);
            countdown.appendChild(value);
            wrapper.appendChild(countdown);
            startLandingCountdown(root, value, resource);
            wrapper.appendChild(communityAction(COMMUNITY_ACTIONS.event, '#fde68a'));
            slot.appendChild(wrapper);
            return;
        }
        var content = element('div', 'd-flex flex-column align-items-start w-100 h-100');
        var skill = communitySkill(resource);
        if (skill) content.appendChild(skill);
        content.appendChild(element('h4', 'h5 font-weight-bold', resource.title));
        appendCommunitySummary(content, resource.summary || resource.content.description, false);
        if (resource.content.startDateTime) {
            var date = element('small', 'font-weight-bold', formatDateTime(resource.content.startDateTime));
            date.style.color = '#5f4300';
            content.appendChild(date);
        }
        content.appendChild(communityAction(COMMUNITY_ACTIONS.event));
        slot.appendChild(content);
    }

    function renderCommunityPlaceholder(slot, type, featured) {
        slot.setAttribute('data-resource-placeholder', 'true');
        slot.removeAttribute('href');
        slot.removeAttribute('role');
        slot.setAttribute('aria-disabled', 'true');
        slot.setAttribute('tabindex', '-1');
        slot.style.cursor = 'default';
        slot.style.pointerEvents = 'none';
        var needsPadding = !slot.classList.contains('p-4') && !slot.classList.contains('p-lg-5');
        var wrapper = element('div', (needsPadding ? 'p-4 ' : '') + 'd-flex flex-column align-items-center justify-content-center text-center w-100 h-100');
        wrapper.style.minHeight = featured && type === 'tool' ? '180px' : '140px';
        var heading = element('h3', 'h5 font-weight-bold mb-0', 'Coming soon');
        if (type === 'event' && featured) heading.style.color = '#fff';
        wrapper.appendChild(heading);
        slot.appendChild(wrapper);
    }

    function renderIntoSlot(root, slot, resource, type, index) {
        restoreCommunitySlot(slot);
        var featured = index === 0;
        if (!resource) {
            renderCommunityPlaceholder(slot, type, featured);
            return;
        }
        activateCommunitySlot(slot, resource);
        if (type === 'showcase') renderShowcaseLandingCard(slot, resource, featured);
        else if (type === 'prompt') renderPromptLandingCard(slot, resource, featured);
        else if (type === 'workflow') renderWorkflowLandingCard(slot, resource);
        else if (type === 'tool') renderToolLandingCard(slot, resource, featured);
        else renderEventLandingCard(root, slot, resource, featured);
    }

    function orderCommunityResources(type, resources) {
        if (type === 'tool') {
            return resources.slice().sort(function (left, right) {
                var byRating = right.content.rating - left.content.rating;
                if (byRating) return byRating;
                var byUpdated = right.dateUpdated.localeCompare(left.dateUpdated);
                if (byUpdated) return byUpdated;
                return left.title.localeCompare(right.title, 'en-GB', { sensitivity: 'base' });
            });
        }
        if (type !== 'event') return resources;
        var now = Date.now();
        return resources.slice().sort(function (left, right) {
            var leftStart = new Date(left.content.startDateTime).getTime();
            var rightStart = new Date(right.content.startDateTime).getTime();
            var leftFuture = new Date(left.content.endDateTime || left.content.startDateTime).getTime() >= now;
            var rightFuture = new Date(right.content.endDateTime || right.content.startDateTime).getTime() >= now;
            if (leftFuture !== rightFuture) return leftFuture ? -1 : 1;
            return leftFuture ? leftStart - rightStart : rightStart - leftStart;
        });
    }

    function renderCommunityLanding(root) {
        (root._resourceCountdownTimers || []).forEach(function (timer) { window.clearInterval(timer); });
        root._resourceCountdownTimers = [];
        var mappings = [
            { id: 'student-showcase', type: 'showcase' },
            { id: 'prompt-library', type: 'prompt' },
            { id: 'workflow-library', type: 'workflow', featuredOnly: true },
            { id: 'tool-reviews', type: 'tool' },
            { id: 'community-events', type: 'event' }
        ];
        mappings.forEach(function (mapping) {
            var section = root.querySelector('[data-resource-target="' + mapping.type + '"]') || root.querySelector('#' + mapping.id);
            if (!section) return;
            var resources = orderCommunityResources(mapping.type, query({
                librarySection: 'community',
                types: [mapping.type],
                featuredOnly: mapping.featuredOnly === true,
                sort: 'relevant'
            }));
            var slots = communitySlots(section, mapping.type);
            slots.forEach(function (slot, index) {
                renderIntoSlot(root, slot, resources[index] || null, mapping.type, index);
            });
            var existing = section.querySelector('[data-resource-view-status]');
            if (existing) existing.hidden = true;
        });
    }

    function configureLibraryLinks(root) {
        var base = root.getAttribute('data-resource-library-url');
        if (!base) return;
        Array.prototype.forEach.call(root.querySelectorAll('[data-resource-library-link]'), function (link) {
            var filter = link.getAttribute('data-resource-library-link');
            try {
                var url = new URL(base, window.location.href);
                if (Object.keys(QUERY_TYPE).indexOf(filter) !== -1) url.searchParams.set('type', filter);
                else if (filter === 'featured') url.searchParams.set('featured', '1');
                link.href = url.href;
            } catch (error) {
                if (window.console && console.warn) console.warn('GenAI Hub could not configure a resource library link.', error);
            }
        });
    }

    function mountCommunityLanding(root, retry) {
        root.setAttribute('aria-busy', 'true');
        (retry ? resourcesApi.reload() : resourcesApi.ready).then(function () {
            root.setAttribute('aria-busy', 'false');
            renderCommunityLanding(root);
        }, function (error) {
            if (error.name === 'AbortError') return;
            root.setAttribute('aria-busy', 'false');
            var status = root.querySelector('[data-resource-view-status]');
            if (!status) {
                status = element('div', 'container alert alert-danger my-4');
                status.setAttribute('data-resource-view-status', 'true');
                root.insertBefore(status, root.firstChild);
            }
            clear(status);
            status.appendChild(document.createTextNode(error.message || 'Community resources are currently unavailable.'));
            var retryButton = element('button', 'btn btn-outline-danger ml-3', 'Retry');
            retryButton.type = 'button';
            retryButton.addEventListener('click', function () { mountCommunityLanding(root, true); });
            status.appendChild(retryButton);
        });
    }

    function mountView(root) {
        if (root._genaiResourcesMounted) return;
        root._genaiResourcesMounted = true;
        configureLibraryLinks(root);
        var view = root.getAttribute('data-resource-view');
        if (view === 'library') mountLibrary(root, false);
        else if (view === 'featured') mountFeatured(root, false);
        else if (view === 'community-landing') mountCommunityLanding(root, false);
    }

    var resourcesApi = {
        ready: null,
        load: load,
        reload: function () {
            loadedData = null;
            resourceIndex = Object.create(null);
            return load(true);
        },
        query: query,
        getById: function (id) {
            return typeof id === 'string' && resourceIndex[id] ? resourceIndex[id] : null;
        },
        getState: function () {
            return Object.freeze({
                status: loaderStatus,
                resources: loadedData ? loadedData.resources : Object.freeze([]),
                error: loaderError
            });
        }
    };
    hub.resources = resourcesApi;
    window.GenAIHub = hub;

    resourcesApi.ready = load();
    resourcesApi.ready.catch(function (error) {
        if (error.name !== 'AbortError' && window.console && console.error) {
            console.error('GenAI Hub resource loading failed.', error);
        }
    });

    function boot() {
        var roots = document.querySelectorAll('[data-resource-view]');
        for (var i = 0; i < roots.length; i += 1) mountView(roots[i]);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})(window, document);
