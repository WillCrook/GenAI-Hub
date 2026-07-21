/* Global JSON loader and validator for GenAI Hub resource data. */
(function (window) {
    'use strict';

    var hub = window.GenAIHub || {};
    if (hub.resourceLoader) return;

    var DATA_URL = 'https://willcrook.github.io/GenAI-Hub/assets/data/resources.json';
    var SCHEMA_VERSION = '1.0';
    var RESOURCE_TYPES = ['prompt', 'workflow', 'tool', 'article', 'video', 'link', 'download', 'event', 'showcase'];
    var LIBRARY_SECTIONS = ['learn-ai', 'challenges', 'community'];
    var SKILL_AREAS = ['academic', 'workplace', 'lifelong'];
    var REASONING_MODES = ['standard', 'reasoning', 'either', 'not-applicable'];
    var PRICING_MODELS = ['free', 'freemium', 'paid', 'institutional', 'unknown'];
    var PLATFORM_TYPES = ['web', 'desktop', 'mobile', 'browser-extension', 'API'];
    var LOCATION_TYPES = ['in-person', 'online', 'hybrid'];
    var ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    var DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
    var loadedData = null;
    var resourceIndex = Object.create(null);
    var inFlightRequest = null;

    function invalid(path, message) {
        throw new Error('Invalid resource data at ' + path + ': ' + message);
    }

    function isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function requireObject(value, path) {
        if (!isObject(value)) invalid(path, 'expected an object.');
        return value;
    }

    function requireString(value, path, allowEmpty) {
        if (typeof value !== 'string') invalid(path, 'expected a string.');
        if (!allowEmpty && !value.trim()) invalid(path, 'must not be empty.');
        return value;
    }

    function requireBoolean(value, path) {
        if (typeof value !== 'boolean') invalid(path, 'expected a boolean.');
        return value;
    }

    function requireNumberOrNull(value, path, integer) {
        if (value === null) return value;
        if (typeof value !== 'number' || !isFinite(value) || value < 0) {
            invalid(path, 'expected a non-negative number or null.');
        }
        if (integer && Math.floor(value) !== value) invalid(path, 'expected a whole number or null.');
        return value;
    }

    function requireEnum(value, allowed, path) {
        requireString(value, path, false);
        if (allowed.indexOf(value) === -1) invalid(path, 'unsupported value "' + value + '".');
        return value;
    }

    function requireStringArray(value, path, allowed) {
        if (!Array.isArray(value)) invalid(path, 'expected an array.');
        value.forEach(function (item, index) {
            requireString(item, path + '[' + index + ']', false);
            if (allowed && allowed.indexOf(item) === -1) {
                invalid(path + '[' + index + ']', 'unsupported value "' + item + '".');
            }
        });
        return value;
    }

    function requireDate(value, path) {
        requireString(value, path, true);
        if (!value) return value;
        if (!DATE_PATTERN.test(value)) invalid(path, 'expected a date in YYYY-MM-DD format.');
        var date = new Date(value + 'T00:00:00Z');
        if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
            invalid(path, 'expected a valid calendar date.');
        }
        return value;
    }

    function requireDateTime(value, path) {
        requireString(value, path, true);
        if (!value) return value;
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
            invalid(path, 'expected an ISO 8601 date and time with a timezone.');
        }
        if (isNaN(new Date(value).getTime())) invalid(path, 'expected a valid date and time.');
        return value;
    }

    function requireUrl(value, path) {
        requireString(value, path, true);
        if (!value) return value;
        try {
            var parsed = new URL(value);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
                invalid(path, 'expected an http or https URL.');
            }
        } catch (error) {
            invalid(path, 'expected a valid http or https URL.');
        }
        return value;
    }

    function validateAuthor(author, path) {
        requireObject(author, path);
        requireString(author.name, path + '.name', true);
        requireString(author.organisation, path + '.organisation', true);
        requireString(author.course, path + '.course', true);
        requireString(author.yearOfStudy, path + '.yearOfStudy', true);
    }

    function validateThumbnail(thumbnail, path) {
        requireObject(thumbnail, path);
        requireUrl(thumbnail.src, path + '.src');
        requireString(thumbnail.alt, path + '.alt', true);
    }

    function validatePrompt(content, path) {
        requireString(content.purpose, path + '.purpose', true);
        requireString(content.promptText, path + '.promptText', true);
        requireStringArray(content.platforms, path + '.platforms');
        requireStringArray(content.modelsTested, path + '.modelsTested');
        requireEnum(content.reasoningMode, REASONING_MODES, path + '.reasoningMode');
        requireString(content.usageNotes, path + '.usageNotes', true);
    }

    function validateWorkflow(content, path) {
        requireString(content.goal, path + '.goal', true);
        if (!Array.isArray(content.steps)) invalid(path + '.steps', 'expected an array.');
        var stepNumbers = Object.create(null);
        content.steps.forEach(function (step, index) {
            var stepPath = path + '.steps[' + index + ']';
            requireObject(step, stepPath);
            if (typeof step.stepNumber !== 'number' || !isFinite(step.stepNumber) || step.stepNumber <= 0 || Math.floor(step.stepNumber) !== step.stepNumber) {
                invalid(stepPath + '.stepNumber', 'expected a positive whole number.');
            }
            if (stepNumbers[step.stepNumber]) invalid(stepPath + '.stepNumber', 'must be unique within the workflow.');
            stepNumbers[step.stepNumber] = true;
            requireString(step.title, stepPath + '.title', true);
            requireString(step.description, stepPath + '.description', true);
        });
        requireString(content.reflection, path + '.reflection', true);
        requireNumberOrNull(content.estimatedTotalMinutes, path + '.estimatedTotalMinutes', false);
        requireNumberOrNull(content.complexityScore, path + '.complexityScore', false);
    }

    function validateTool(content, path) {
        requireString(content.company, path + '.company', true);
        requireUrl(content.toolUrl, path + '.toolUrl');
        if (typeof content.rating !== 'number' || !isFinite(content.rating) || Math.floor(content.rating) !== content.rating || content.rating < 1 || content.rating > 5) {
            invalid(path + '.rating', 'expected a whole number from 1 to 5.');
        }
        requireString(content.overview, path + '.overview', true);
        requireStringArray(content.strengths, path + '.strengths');
        requireStringArray(content.weaknesses, path + '.weaknesses');
        requireObject(content.pricing, path + '.pricing');
        requireEnum(content.pricing.model, PRICING_MODELS, path + '.pricing.model');
        requireNumberOrNull(content.pricing.cost, path + '.pricing.cost', false);
        requireStringArray(content.platformTypes, path + '.platformTypes', PLATFORM_TYPES);
        requireString(content.accessibilityNotes, path + '.accessibilityNotes', true);
        requireString(content.privacyNotes, path + '.privacyNotes', true);
        requireString(content.reviewVerdict, path + '.reviewVerdict', true);
    }

    function validateArticle(content, path) {
        requireString(content.body, path + '.body', true);
        requireNumberOrNull(content.readingTimeMinutes, path + '.readingTimeMinutes', true);
        requireUrl(content.sourceUrl, path + '.sourceUrl');
    }

    function validateVideo(content, path) {
        requireString(content.provider, path + '.provider', true);
        requireUrl(content.videoUrl, path + '.videoUrl');
        requireUrl(content.embedUrl, path + '.embedUrl');
        requireNumberOrNull(content.durationSeconds, path + '.durationSeconds', true);
    }

    function validateLink(content, path) {
        requireUrl(content.url, path + '.url');
        requireString(content.siteName, path + '.siteName', true);
        requireString(content.description, path + '.description', true);
    }

    function validateDownload(content, path) {
        requireUrl(content.fileUrl, path + '.fileUrl');
        requireString(content.fileName, path + '.fileName', true);
        requireString(content.fileFormat, path + '.fileFormat', true);
        requireNumberOrNull(content.fileSizeBytes, path + '.fileSizeBytes', true);
        requireString(content.version, path + '.version', true);
        requireString(content.description, path + '.description', true);
    }

    function validateEvent(content, path) {
        requireString(content.host, path + '.host', true);
        requireDateTime(content.startDateTime, path + '.startDateTime');
        requireDateTime(content.endDateTime, path + '.endDateTime');
        if (content.startDateTime && content.endDateTime && new Date(content.endDateTime).getTime() <= new Date(content.startDateTime).getTime()) {
            invalid(path + '.endDateTime', 'must be later than startDateTime.');
        }
        requireString(content.timezone, path + '.timezone', true);
        requireEnum(content.locationType, LOCATION_TYPES, path + '.locationType');
        requireString(content.location, path + '.location', true);
        requireUrl(content.onlineUrl, path + '.onlineUrl');
        requireString(content.description, path + '.description', true);
        requireNumberOrNull(content.capacity, path + '.capacity', true);
        requireUrl(content.bookingUrl, path + '.bookingUrl');
        requireBoolean(content.bookingRequired, path + '.bookingRequired');
    }

    function validateShowcase(content, path) {
        requireString(content.problem, path + '.problem', true);
        requireString(content.approach, path + '.approach', true);
        requireString(content.outcome, path + '.outcome', true);
        requireString(content.reflection, path + '.reflection', true);
        requireStringArray(content.toolsUsed, path + '.toolsUsed');
        requireUrl(content.projectUrl, path + '.projectUrl');
    }

    function validateContent(type, content, path) {
        requireObject(content, path);
        if (type === 'prompt') validatePrompt(content, path);
        else if (type === 'workflow') validateWorkflow(content, path);
        else if (type === 'tool') validateTool(content, path);
        else if (type === 'article') validateArticle(content, path);
        else if (type === 'video') validateVideo(content, path);
        else if (type === 'link') validateLink(content, path);
        else if (type === 'download') validateDownload(content, path);
        else if (type === 'event') validateEvent(content, path);
        else if (type === 'showcase') validateShowcase(content, path);
    }

    function validateResource(resource, index, seenIds) {
        var path = 'resources[' + index + ']';
        requireObject(resource, path);
        requireString(resource.id, path + '.id', false);
        if (!ID_PATTERN.test(resource.id)) invalid(path + '.id', 'expected lowercase letters, numbers and single hyphens.');
        if (seenIds[resource.id]) invalid(path + '.id', 'duplicate resource id "' + resource.id + '".');
        seenIds[resource.id] = true;
        requireEnum(resource.type, RESOURCE_TYPES, path + '.type');
        requireString(resource.title, path + '.title', false);
        requireString(resource.summary, path + '.summary', true);
        validateAuthor(resource.author, path + '.author');
        requireDate(resource.datePublished, path + '.datePublished');
        requireDate(resource.dateUpdated, path + '.dateUpdated');
        requireEnum(resource.librarySection, LIBRARY_SECTIONS, path + '.librarySection');
        requireStringArray(resource.skillAreas, path + '.skillAreas', SKILL_AREAS);
        requireStringArray(resource.tags, path + '.tags');
        requireBoolean(resource.featured, path + '.featured');
        requireBoolean(resource.published, path + '.published');
        validateThumbnail(resource.thumbnail, path + '.thumbnail');
        validateContent(resource.type, resource.content, path + '.content');
    }

    function validatePayload(payload) {
        requireObject(payload, 'payload');
        if (payload.schemaVersion !== SCHEMA_VERSION) {
            invalid('schemaVersion', 'expected "' + SCHEMA_VERSION + '".');
        }
        requireString(payload.lastUpdated, 'lastUpdated', false);
        requireDateTime(payload.lastUpdated, 'lastUpdated');
        if (!Array.isArray(payload.resources)) invalid('resources', 'expected an array.');
        var seenIds = Object.create(null);
        payload.resources.forEach(function (resource, index) {
            validateResource(resource, index, seenIds);
        });
        return payload;
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

    function load() {
        if (loadedData) return Promise.resolve(loadedData);
        if (inFlightRequest) return inFlightRequest;
        if (typeof window.fetch !== 'function') {
            return Promise.reject(new Error('This browser cannot load the GenAI Hub resource data.'));
        }

        inFlightRequest = window.fetch(DATA_URL, {
            method: 'GET',
            credentials: 'omit',
            headers: { Accept: 'application/json' }
        }).then(function (response) {
            if (!response.ok) throw new Error('The resource data endpoint returned HTTP ' + response.status + '.');
            return response.json();
        }).then(function (payload) {
            loadedData = deepFreeze(validatePayload(payload));
            buildIndex(loadedData.resources);
            inFlightRequest = null;
            return loadedData;
        }).catch(function (error) {
            inFlightRequest = null;
            throw error;
        });

        return inFlightRequest;
    }

    hub.resourceLoader = {
        load: load,
        getData: function () { return loadedData; },
        getResources: function () { return loadedData ? loadedData.resources.slice() : []; },
        getById: function (id) {
            return typeof id === 'string' && resourceIndex[id] ? resourceIndex[id] : null;
        }
    };
    window.GenAIHub = hub;
})(window);
