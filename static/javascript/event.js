const streamHooks = {
    preExecute: [],
    execute: [],
    postExecute: [],

    trigger: function(eventName, data) {
        if (this[eventName]) {
            this[eventName].forEach(callback => callback(data));
        }
    }
};