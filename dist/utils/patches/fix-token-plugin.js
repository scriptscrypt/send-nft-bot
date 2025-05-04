import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// Patch the token plugin to use require instead of import
const originalPlugin = require('@solana-agent-kit/plugin-token');
// Create a properly typed plugin object
const patchedPlugin = {
    name: originalPlugin.name || 'token-plugin',
    methods: originalPlugin.methods || {},
    actions: originalPlugin.actions || {},
    initialize: async (agent) => {
        // Initialize the plugin with the agent
        if (typeof originalPlugin.initialize === 'function') {
            await originalPlugin.initialize(agent);
        }
        return agent;
    }
};
export default patchedPlugin;
