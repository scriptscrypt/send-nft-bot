// Utility for loading Solana ABIs safely to work around ESM JSON import issues
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Set up CommonJS require function
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Safely loads a JSON file without relying on ESM JSON imports
 * @param {string} filePath - Path to the JSON file
 * @returns {Object} Parsed JSON data
 */
export function loadJsonFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Failed to load JSON file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Wrapper for the Solana Agent Kit to avoid direct JSON imports
 * @returns {Object} Configuration for Solana Agent Kit
 */
export function getSolanaAgentConfig() {
  // These are common ABIs and configurations needed by Solana Agent Kit
  // that might trigger JSON import issues
  return {
    // Return an empty object if no special configs are needed
  };
}

/**
 * Get OpenZeppelin contract ABI by name
 * @param {string} contractName - Name of the contract (e.g., 'ERC20', 'ERC721')
 * @returns {Object|null} Contract ABI or null if not found
 */
export function getOpenZeppelinABI(contractName) {
  try {
    // Try to resolve the path to the contract using require.resolve
    const contractPath = require.resolve(`@openzeppelin/contracts/build/contracts/${contractName}.json`);
    return loadJsonFile(contractPath);
  } catch (error) {
    console.warn(`Could not load OpenZeppelin contract ${contractName}:`, error.message);
    return null;
  }
}

export default {
  loadJsonFile,
  getSolanaAgentConfig,
  getOpenZeppelinABI
}; 