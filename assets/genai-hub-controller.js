/* GenAI Hub feature runtime and unified Resource Library controller. */
(function (window, document) {
    'use strict';

    var hub = window.GenAIHub || {};
    var modules = hub._modules || {};
    var VALID_TYPES = ['prompts', 'workflows', 'tools', 'events', 'showcases'];
    var VALID_CATEGORIES = ['lifelong', 'academic', 'workplace'];
    var TYPE_LABELS = {
        prompts: 'Prompt',
        workflows: 'Workflow',
        tools: 'Tool',
        events: 'Event',
        showcases: 'Showcase'
    };
    var CATEGORY_LABELS = {
        lifelong: 'Lifelong',
        academic: 'Academic',
        workplace: 'Workplace'
    };

    function hasMounted(module, node) {
        if (module.mountedSet) return module.mountedSet.has(node);
        return module.mountedNodes.indexOf(node) !== -1;
    }

    function rememberMount(module, node) {
        if (module.mountedSet) module.mountedSet.add(node);
        else module.mountedNodes.push(node);
    }

    hub.register = function (name, selector, initialise) {
        if (!name || !selector || typeof initialise !== 'function' || modules[name]) return false;
        modules[name] = {
            selector: selector,
            initialise: initialise,
            mountedSet: typeof WeakSet === 'function' ? new WeakSet() : null,
            mountedNodes: []
        };
        return true;
    };

    hub.boot = function (root) {
        var scope = root || document;
        Object.keys(modules).forEach(function (name) {
            var module = modules[name];
            var nodes = [];
            if (scope.nodeType === 1 && scope.matches && scope.matches(module.selector)) nodes.push(scope);
            if (scope.querySelectorAll) nodes = nodes.concat(Array.prototype.slice.call(scope.querySelectorAll(module.selector)));
            nodes.forEach(function (node) {
                if (hasMounted(module, node)) return;
                rememberMount(module, node);
                try {
                    module.initialise(node);
                } catch (error) {
                    node.setAttribute('data-genai-hub-error', name);
                    if (window.console && console.error) console.error('GenAI Hub module failed: ' + name, error);
                }
            });
        });
    };

    hub._modules = modules;
    hub.version = '2.0.0';
    window.GenAIHub = hub;

    function normaliseText(value) {
        var text = String(value || '').toLocaleLowerCase('en-GB');
        if (text.normalize) text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return text.replace(/\s+/g, ' ').trim();
    }

    function abortError() {
        var error = new Error('Request aborted');
        error.name = 'AbortError';
        return error;
    }

    function EndpointProvider(sourceUrl, fetchImplementation) {
        this.sourceUrl = String(sourceUrl || '').trim();
        this.fetchImplementation = fetchImplementation || (typeof window.fetch === 'function' ? window.fetch.bind(window) : null);
    }

    EndpointProvider.prototype.load = function (signal) {
        if (!this.sourceUrl) return Promise.reject(new Error('The resource data endpoint has not been configured.'));
        if (typeof this.fetchImplementation !== 'function') return Promise.reject(new Error('This browser cannot load the resource data endpoint.'));
        if (signal && signal.aborted) return Promise.reject(abortError());
        return this.fetchImplementation(this.sourceUrl, {
            method: 'GET',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
            signal: signal || undefined
        }).then(function (response) {
            if (!response.ok) throw new Error('The resource data endpoint returned HTTP ' + response.status + '.');
            return response.json();
        });
    };

    function ResourceLibrary(root, options) {
        if (root._genaiHubResourceLibrary) return root._genaiHubResourceLibrary;
        options = options || {};
        this.root = root;
        this.pageSize = Math.max(1, parseInt(root.getAttribute('data-resource-page-size'), 10) || 9);
        this.provider = options.provider || new EndpointProvider(root.getAttribute('data-resource-source'), options.fetchImplementation);
        this.searchForm = root.querySelector('[data-resource-search-form]');
        this.searchInput = root.querySelector('[data-resource-search]');
        this.typeControls = root.querySelector('[data-resource-type-controls]');
        this.typeButtons = Array.prototype.slice.call(root.querySelectorAll('[data-resource-type]'));
        this.categoryInputs = Array.prototype.slice.call(root.querySelectorAll('[data-resource-category]'));
        this.sortControl = root.querySelector('[data-resource-sort]');
        this.count = root.querySelector('[data-resource-count]');
        this.loading = root.querySelector('[data-resource-loading]');
        this.error = root.querySelector('[data-resource-error]');
        this.errorMessage = root.querySelector('[data-resource-error-message]');
        this.retry = root.querySelector('[data-resource-retry]');
        this.empty = root.querySelector('[data-resource-empty]');
        this.results = root.querySelector('[data-resource-results]');
        this.loadMore = root.querySelector('[data-resource-load-more]');
        this.resetButtons = Array.prototype.slice.call(root.querySelectorAll('[data-resource-reset]'));
        this.resources = [];
        this.filtered = [];
        this.visibleLimit = this.pageSize;
        this.requestNumber = 0;
        this.abortController = null;
        this.searchTimer = null;
        this.debounceMs = Math.max(0, Number(options.debounceMs) || 150);
        this.state = {
            query: '',
            type: 'all',
            categories: [],
            sort: 'relevant'
        };

        if (!this.searchForm || !this.searchInput || !this.typeControls || !this.sortControl || !this.count || !this.loading || !this.error || !this.empty || !this.results || !this.loadMore || !this.retry) {
            throw new Error('Resource Library markup is incomplete.');
        }

        root._genaiHubResourceLibrary = this;
        root.setAttribute('data-genai-hub-mounted', 'resource-library');
        this.initialise();
    }

    ResourceLibrary.prototype.initialise = function () {
        var requested = this.readTypeFromUrl();
        this.state.type = requested.type;
        if (requested.invalid) this.writeTypeToUrl('all', true);
        this.syncTypeButtons();
        this.bindEvents();
        this.loadResources();
    };

    ResourceLibrary.prototype.readTypeFromUrl = function () {
        try {
            var value = new URL(window.location.href).searchParams.get('type');
            if (!value) return { type: 'all', invalid: false };
            value = normaliseText(value);
            return VALID_TYPES.indexOf(value) === -1 ? { type: 'all', invalid: true } : { type: value, invalid: false };
        } catch (error) {
            return { type: 'all', invalid: false };
        }
    };

    ResourceLibrary.prototype.writeTypeToUrl = function (type, replace) {
        try {
            var url = new URL(window.location.href);
            if (type === 'all') url.searchParams.delete('type');
            else url.searchParams.set('type', type);
            window.history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search + url.hash);
        } catch (error) {
            if (window.console && console.warn) console.warn('GenAI Hub could not update the Resource Library URL.', error);
        }
    };

    ResourceLibrary.prototype.bindEvents = function () {
        var self = this;
        this.searchInput.addEventListener('input', function () {
            window.clearTimeout(self.searchTimer);
            self.searchTimer = window.setTimeout(function () {
                self.state.query = self.searchInput.value.trim();
                self.applyFilters(true);
            }, self.debounceMs);
        });
        this.searchForm.addEventListener('submit', function (event) {
            event.preventDefault();
            window.clearTimeout(self.searchTimer);
            self.state.query = self.searchInput.value.trim();
            self.applyFilters(true);
        });
        this.typeControls.addEventListener('click', function (event) {
            var button = event.target.closest('[data-resource-type]');
            if (!button || !self.typeControls.contains(button)) return;
            var type = button.getAttribute('data-resource-type');
            if (type !== 'all' && VALID_TYPES.indexOf(type) === -1) return;
            if (self.state.type === type) return;
            self.state.type = type;
            self.syncTypeButtons();
            self.writeTypeToUrl(type, false);
            self.applyFilters(true);
        });
        this.categoryInputs.forEach(function (input) {
            input.addEventListener('change', function () {
                self.state.categories = self.categoryInputs.filter(function (candidate) { return candidate.checked; }).map(function (candidate) { return candidate.value; });
                self.applyFilters(true);
            });
        });
        this.sortControl.addEventListener('change', function () {
            self.state.sort = self.sortControl.value;
            self.applyFilters(true);
        });
        this.resetButtons.forEach(function (button) {
            button.addEventListener('click', function () { self.reset(); });
        });
        this.loadMore.addEventListener('click', function () {
            var previousVisible = Math.min(self.visibleLimit, self.filtered.length);
            self.visibleLimit += self.pageSize;
            self.appendCards(self.filtered.slice(previousVisible, self.visibleLimit));
            self.updateLoadMore();
        });
        this.retry.addEventListener('click', function () { self.loadResources(); });
        this._popstate = function () {
            var requested = self.readTypeFromUrl();
            self.state.type = requested.type;
            if (requested.invalid) self.writeTypeToUrl('all', true);
            self.syncTypeButtons();
            self.applyFilters(true);
        };
        window.addEventListener('popstate', this._popstate);
    };

    ResourceLibrary.prototype.syncTypeButtons = function () {
        var self = this;
        this.typeButtons.forEach(function (button) {
            var active = button.getAttribute('data-resource-type') === self.state.type;
            var label = button.getAttribute('data-resource-type-label') || button.getAttribute('data-resource-type');
            button.setAttribute('aria-pressed', active ? 'true' : 'false');
            button.classList.toggle('btn-primary', active);
            button.classList.toggle('btn-outline-primary', !active);
            if (active) {
                button.style.background = '#094685';
                button.style.borderColor = '#094685';
            } else {
                button.style.background = '';
                button.style.borderColor = '';
            }
            button.textContent = (active ? '✓ ' : '') + label;
        });
    };

    ResourceLibrary.prototype.reset = function () {
        window.clearTimeout(this.searchTimer);
        this.state.query = '';
        this.state.type = 'all';
        this.state.categories = [];
        this.state.sort = 'relevant';
        this.searchInput.value = '';
        this.categoryInputs.forEach(function (input) { input.checked = false; });
        this.sortControl.value = 'relevant';
        this.syncTypeButtons();
        this.writeTypeToUrl('all', false);
        this.applyFilters(true);
        this.searchInput.focus();
    };

    ResourceLibrary.prototype.setView = function (view) {
        this.loading.hidden = view !== 'loading';
        this.error.hidden = view !== 'error';
        this.empty.hidden = view !== 'empty';
        this.results.hidden = view !== 'results';
        if (view !== 'results') this.loadMore.hidden = true;
        this.root.setAttribute('aria-busy', view === 'loading' ? 'true' : 'false');
    };

    ResourceLibrary.prototype.loadResources = function () {
        var self = this;
        var request = ++this.requestNumber;
        if (this.abortController) this.abortController.abort();
        this.abortController = typeof AbortController === 'function' ? new AbortController() : null;
        var signal = this.abortController ? this.abortController.signal : null;
        this.count.textContent = 'Loading resources…';
        this.setView('loading');
        return Promise.resolve().then(function () {
            return self.provider.load(signal);
        }).then(function (payload) {
            if (request !== self.requestNumber) return;
            var rawResources = Array.isArray(payload) ? payload : payload && payload.resources;
            if (!Array.isArray(rawResources)) throw new Error('The resource data endpoint must return an object containing a resources array.');
            self.resources = self.normaliseResources(rawResources);
            if (!self.resources.length) throw new Error('The resource data endpoint did not contain any valid resources.');
            self.applyFilters(true);
        }).catch(function (error) {
            if (error && error.name === 'AbortError') return;
            if (request !== self.requestNumber) return;
            self.resources = [];
            self.filtered = [];
            self.clearResults();
            self.count.textContent = 'Resources unavailable';
            self.errorMessage.textContent = error && error.message ? error.message : 'The Resource Library is currently unavailable.';
            self.setView('error');
        });
    };

    ResourceLibrary.prototype.normaliseResources = function (rawResources) {
        var self = this;
        var ids = {};
        var resources = [];
        rawResources.forEach(function (raw, index) {
            var resource = self.normaliseResource(raw, index);
            if (!resource) return;
            if (ids[resource.id]) {
                self.warnInvalid(index, 'duplicate id "' + resource.id + '"');
                return;
            }
            ids[resource.id] = true;
            resources.push(resource);
        });
        return resources;
    };

    ResourceLibrary.prototype.normaliseResource = function (raw, index) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            this.warnInvalid(index, 'record is not an object');
            return null;
        }
        var id = String(raw.id || '').trim();
        var title = String(raw.title || '').trim();
        var description = String(raw.description || '').trim();
        var type = normaliseText(raw.type);
        var category = normaliseText(raw.category);
        var dateAdded = String(raw.dateAdded || '').trim();
        var tags = Array.isArray(raw.tags) ? raw.tags.map(function (tag) { return String(tag || '').trim(); }).filter(Boolean) : null;
        var url = this.safeResourceUrl(raw.url);
        var date = /^\d{4}-\d{2}-\d{2}$/.test(dateAdded) ? new Date(dateAdded + 'T00:00:00Z') : null;
        var validDate = date && !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateAdded;
        if (!id || !title || !description || VALID_TYPES.indexOf(type) === -1 || VALID_CATEGORIES.indexOf(category) === -1 || !tags || !url || !validDate) {
            this.warnInvalid(index, 'one or more required fields are missing or invalid');
            return null;
        }
        return {
            id: id,
            title: title,
            description: description,
            type: type,
            category: category,
            tags: tags,
            url: url,
            dateAdded: dateAdded,
            sourceIndex: index,
            searchTitle: normaliseText(title),
            searchDescription: normaliseText(description),
            searchMetadata: normaliseText(TYPE_LABELS[type] + ' ' + CATEGORY_LABELS[category] + ' ' + tags.join(' '))
        };
    };

    ResourceLibrary.prototype.safeResourceUrl = function (value) {
        var candidate = String(value || '').trim();
        if (!candidate) return '';
        try {
            var parsed = new URL(candidate, window.location.href);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return candidate;
            var hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(candidate);
            if (!hasScheme && parsed.protocol === window.location.protocol && parsed.origin === window.location.origin) return candidate;
        } catch (error) {
            return '';
        }
        return '';
    };

    ResourceLibrary.prototype.warnInvalid = function (index, reason) {
        if (window.console && console.warn) console.warn('GenAI Hub skipped resource record ' + (index + 1) + ': ' + reason + '.');
    };

    ResourceLibrary.prototype.searchScore = function (resource, query, tokens) {
        if (!query) return 0;
        var score = resource.searchTitle.indexOf(query) !== -1 ? 100 : 0;
        tokens.forEach(function (token) {
            if (resource.searchTitle.indexOf(token) !== -1) score += 20;
            if (resource.searchMetadata.indexOf(token) !== -1) score += 10;
            if (resource.searchDescription.indexOf(token) !== -1) score += 2;
        });
        return score;
    };

    ResourceLibrary.prototype.applyFilters = function (resetVisible) {
        var self = this;
        if (!this.resources.length) return;
        if (resetVisible) this.visibleLimit = this.pageSize;
        var query = normaliseText(this.state.query);
        var tokens = query ? query.split(' ') : [];
        var categories = this.state.categories;
        this.filtered = this.resources.filter(function (resource) {
            if (self.state.type !== 'all' && resource.type !== self.state.type) return false;
            if (categories.length && categories.indexOf(resource.category) === -1) return false;
            if (!tokens.length) return true;
            var searchable = resource.searchTitle + ' ' + resource.searchDescription + ' ' + resource.searchMetadata;
            return tokens.every(function (token) { return searchable.indexOf(token) !== -1; });
        });
        this.filtered.forEach(function (resource) { resource.relevanceScore = self.searchScore(resource, query, tokens); });
        this.filtered.sort(function (a, b) {
            if (self.state.sort === 'newest') return b.dateAdded.localeCompare(a.dateAdded) || a.sourceIndex - b.sourceIndex;
            if (self.state.sort === 'az') return a.title.localeCompare(b.title, 'en-GB', { sensitivity: 'base' }) || a.sourceIndex - b.sourceIndex;
            if (query && b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
            return a.sourceIndex - b.sourceIndex;
        });
        this.renderResults();
    };

    ResourceLibrary.prototype.clearResults = function () {
        while (this.results.firstChild) this.results.removeChild(this.results.firstChild);
    };

    ResourceLibrary.prototype.renderResults = function () {
        this.clearResults();
        this.count.textContent = this.filtered.length + (this.filtered.length === 1 ? ' resource' : ' resources');
        if (!this.filtered.length) {
            this.setView('empty');
            return;
        }
        this.appendCards(this.filtered.slice(0, this.visibleLimit));
        this.setView('results');
        this.updateLoadMore();
    };

    ResourceLibrary.prototype.appendCards = function (resources) {
        var self = this;
        var fragment = document.createDocumentFragment();
        resources.forEach(function (resource) { fragment.appendChild(self.createCard(resource)); });
        this.results.appendChild(fragment);
    };

    ResourceLibrary.prototype.createCard = function (resource) {
        var column = document.createElement('div');
        column.className = 'col-md-6 col-xl-4 mb-4';
        column.setAttribute('data-resource-id', resource.id);
        var article = document.createElement('article');
        article.className = 'h-100 p-4 border shadow-sm d-flex flex-column';
        article.style.borderRadius = '12px';
        article.style.borderTop = '5px solid #f5c242';

        var badges = document.createElement('div');
        badges.className = 'd-flex flex-wrap mb-3';
        var type = document.createElement('span');
        type.className = 'badge badge-primary mr-2 mb-1';
        type.textContent = TYPE_LABELS[resource.type];
        var category = document.createElement('span');
        category.className = 'badge badge-light border mb-1';
        category.textContent = CATEGORY_LABELS[resource.category];
        badges.appendChild(type);
        badges.appendChild(category);

        var heading = document.createElement('h3');
        heading.className = 'h5 font-weight-bold';
        heading.textContent = resource.title;
        var description = document.createElement('p');
        description.className = 'text-muted';
        description.style.color = '#4f5962';
        description.textContent = resource.description;
        var metadata = document.createElement('p');
        metadata.className = 'small mb-3';
        var tagLabel = document.createElement('strong');
        tagLabel.textContent = 'Tags: ';
        metadata.appendChild(tagLabel);
        metadata.appendChild(document.createTextNode(resource.tags.length ? resource.tags.join(', ') : 'None'));
        metadata.appendChild(document.createElement('br'));
        var dateLabel = document.createElement('strong');
        dateLabel.textContent = 'Added: ';
        metadata.appendChild(dateLabel);
        var time = document.createElement('time');
        time.setAttribute('datetime', resource.dateAdded);
        time.textContent = new Date(resource.dateAdded + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
        metadata.appendChild(time);
        var link = document.createElement('a');
        link.className = 'btn btn-primary mt-auto align-self-start';
        link.style.background = '#094685';
        link.style.borderColor = '#094685';
        link.href = resource.url;
        link.setAttribute('aria-label', 'View resource: ' + resource.title);
        link.textContent = 'View resource';

        article.appendChild(badges);
        article.appendChild(heading);
        article.appendChild(description);
        article.appendChild(metadata);
        article.appendChild(link);
        column.appendChild(article);
        return column;
    };

    ResourceLibrary.prototype.updateLoadMore = function () {
        this.loadMore.hidden = this.visibleLimit >= this.filtered.length;
    };

    hub.resourceLibrary = {
        mount: function (root, options) { return new ResourceLibrary(root, options); },
        EndpointProvider: EndpointProvider,
        validTypes: VALID_TYPES.slice(),
        validCategories: VALID_CATEGORIES.slice()
    };

    hub.register('resource-library', '[data-resource-library-root]', function (root) {
        hub.resourceLibrary.mount(root);
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { hub.boot(document); });
    else hub.boot(document);
})(window, document);
