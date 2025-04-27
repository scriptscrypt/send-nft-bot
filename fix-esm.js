// This file patches various ESM compatibility issues

// 1. Fix node-fetch ESM/CommonJS compatibility
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// This makes node-fetch v2 available globally to avoid ESM issues with dependencies
global.fetch = require('node-fetch');
global.Headers = fetch.Headers;
global.Request = fetch.Request;
global.Response = fetch.Response;

// 2. Helper function to load JSON files in ESM context
export async function loadJsonModule(path) {
  try {
    // For newer Node.js versions supporting import assertions
    if (parseInt(process.versions.node.split('.')[0]) >= 18) {
      // Dynamic import with assertion
      return await import(path, { assert: { type: 'json' } });
    } else {
      // Fallback for older Node.js versions
      const fs = await import('fs/promises');
      const content = await fs.readFile(new URL(path, import.meta.url), 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`Error loading JSON module from ${path}:`, error);
    throw error;
  }
}

// 3. Patch JSON imports for specific problematic modules
// This needs to run before any imports that might need JSON files
const originalLoad = process.binding('fs').internalModuleReadJSON;
if (originalLoad) {
  const patchedLoad = (path) => {
    const result = originalLoad(path);
    // If the path includes these patterns, try to handle JSON specially
    if (path.includes('@openzeppelin/contracts') && path.endsWith('.json')) {
      console.log(`[ESM Patch] Loading JSON file: ${path}`);
      try {
        const fs = require('fs');
        return JSON.parse(fs.readFileSync(path, 'utf8'));
      } catch (err) {
        console.error(`[ESM Patch] Error loading JSON: ${err.message}`);
        return result;
      }
    }
    return result;
  };
  
  // Only apply patch if we can safely do so
  try {
    process.binding('fs').internalModuleReadJSON = patchedLoad;
  } catch (err) {
    console.warn('[ESM Patch] Unable to patch module loader:', err.message);
  }
} 