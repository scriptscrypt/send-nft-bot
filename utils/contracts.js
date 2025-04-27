// Helper for loading contract ABIs and other JSON imports
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load a JSON file safely in ESM context
 * @param {string} filePath - Path to the JSON file
 * @returns {Object} Parsed JSON data
 */
export function loadJsonFile(filePath) {
  try {
    const jsonData = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(jsonData);
  } catch (error) {
    console.error(`Error loading JSON file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Safe wrapper to load contract ABIs from node_modules
 * Works around ESM import issues with JSON files
 */
export function getContractABIs() {
  try {
    // Use require.resolve to find paths to contract JSON files
    // This is more reliable than direct imports in ESM
    const contractPaths = {};
    
    try {
      contractPaths.erc20 = require.resolve('@openzeppelin/contracts/build/contracts/ERC20.json');
      contractPaths.erc721 = require.resolve('@openzeppelin/contracts/build/contracts/ERC721.json');
    } catch (error) {
      console.warn('OpenZeppelin contracts not found in node_modules:', error.message);
    }
    
    // Load the contract ABIs
    const contracts = {};
    
    // Only attempt to load contracts that were found
    for (const [name, path] of Object.entries(contractPaths)) {
      if (path) {
        try {
          contracts[name] = loadJsonFile(path);
          console.log(`Contract ${name} loaded successfully`);
        } catch (err) {
          console.error(`Failed to load contract ${name}:`, err);
        }
      }
    }
    
    return contracts;
  } catch (error) {
    console.error('Error loading contract ABIs:', error);
    return {}; // Return empty object in case of failure
  }
}

export default {
  loadJsonFile,
  getContractABIs
}; 