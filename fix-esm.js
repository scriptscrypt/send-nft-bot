// This file patches the node-fetch ESM/CommonJS compatibility issue
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// This makes node-fetch v2 available globally to avoid ESM issues with dependencies
global.fetch = require('node-fetch');
global.Headers = fetch.Headers;
global.Request = fetch.Request;
global.Response = fetch.Response; 