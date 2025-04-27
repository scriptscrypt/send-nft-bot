# Patches Directory

This directory contains patched/modified versions of utilities to fix various issues:

## Files

- **contracts.js**: Helper utilities for loading contract ABIs and other JSON imports safely in ESM context
- **fix-esm.js**: Global ESM compatibility fixes for Node.js to handle JSON imports and fetch API compatibility
- **solana-abi-loader.js**: Utility for loading Solana ABIs safely to work around ESM JSON import issues
- **solana-agent-patched.js**: Patched version of Solana Agent integration with fixes for JSON imports and tool handling

## Purpose

These files are modified versions of utilities with workarounds for:

1. JSON import issues in ESM modules (particularly in Node.js v23+)
2. OpenAI API tool formatting issues
3. Dynamic loading of dependencies to avoid direct JSON imports
4. Global patching of Node.js module system for ESM/CommonJS interoperability

## Usage

Import these patched utilities instead of their original versions when working with Solana Agent Kit or when dealing with JSON imports in ESM context. 