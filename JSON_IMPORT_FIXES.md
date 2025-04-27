# JSON Import Fixes in Node.js ESM

This document explains the fixes implemented to resolve JSON import issues in the Node.js ESM environment.

## Problem

When running the application in ESM mode, errors like these may occur:

```
TypeError [ERR_IMPORT_ATTRIBUTE_MISSING]: Module "file://...@openzeppelin/contracts/build/contracts/ERC20Permit.json" needs an import attribute of "type: json"
```

This happens because Node.js ESM requires explicit import assertions for JSON files, but some dependencies might be importing JSON files without these assertions.

## Solutions Implemented

### 1. Updated `fix-esm.js`

We enhanced the compatibility layer to handle JSON imports:

- Added a `loadJsonModule` helper function for safe JSON importing
- Added a patch for problematic modules that import JSON files

### 2. Created Safe ABI Loader

Added `utils/solana-abi-loader.js` that provides:
- CommonJS-based JSON loading that bypasses ESM restrictions
- Helper functions to load OpenZeppelin contract ABIs safely

### 3. Patched Solana Agent

Created `utils/solana-agent-patched.js` that:
- Uses dynamic imports for plugins to avoid direct JSON imports
- Implements safe fallbacks if imports fail
- Provides the same functionality but works around JSON import issues

### 4. Updated Start Scripts

Modified scripts to include needed flags:
- Added `--no-warnings` to suppress Node.js warnings
- Updated Dockerfile's CMD to include required flags

## How to Run

Use one of the following commands to start the application:

```bash
# Production
npm start

# Development with hot reload
npm run dev

# Direct Node.js execution
node --no-warnings index.js

# Docker
docker build -t send-nft-bot .
docker run -p 3001:3001 --env-file .env send-nft-bot
```

## Troubleshooting

If you encounter JSON import issues:

1. Check that you're running with the needed flags:
   ```
   --experimental-json-modules --no-warnings
   ```

2. For dependencies requiring JSON imports, add fallback loaders in the `solana-abi-loader.js`

3. If specific plugins fail to load, check the console logs and implement fallback behavior for those modules 