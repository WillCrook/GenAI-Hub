/* Data controller for the featured resources on the Learn AI page. */
(function (window) {
    'use strict';

    var hub = window.GenAIHub || {};
    hub.controllers = hub.controllers || {};
    if (hub.controllers.learnAiFeatured) return;

    var state = { status: 'idle', resources: [], error: null };
    var request = null;

    function selectResources(resources) {
        return resources.filter(function (resource) {
            return resource.published === true && resource.featured === true && resource.librarySection === 'learn-ai';
        });
    }

    function load() {
        if (state.status === 'ready') return Promise.resolve(state.resources.slice());
        if (request) return request;
        if (!hub.resourceLoader) {
            state.status = 'error';
            state.error = new Error('The global GenAI Hub resource loader is unavailable.');
            return Promise.reject(state.error);
        }

        state.status = 'loading';
        state.error = null;
        request = hub.resourceLoader.load().then(function () {
            state.resources = selectResources(hub.resourceLoader.getResources());
            state.status = 'ready';
            request = null;
            return state.resources.slice();
        }, function (error) {
            state.resources = [];
            state.status = 'error';
            state.error = error;
            request = null;
            throw error;
        });
        return request;
    }

    var controller = {
        ready: null,
        load: load,
        getResources: function () { return state.resources.slice(); },
        getState: function () {
            return { status: state.status, resources: state.resources.slice(), error: state.error };
        }
    };
    hub.controllers.learnAiFeatured = controller;
    window.GenAIHub = hub;
    controller.ready = load();
    controller.ready.catch(function (error) {
        if (window.console && console.error) console.error('Learn AI featured resource loading failed.', error);
    });
})(window);
