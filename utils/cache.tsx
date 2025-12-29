const fs = require('fs');
const path = require('path');

// Define cache file path
const cacheFilePath = path.resolve(__dirname, 'cache.json');

// Function to read the cache from the JSON file
function readCache() {
  try {
    const data = fs.readFileSync(cacheFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading cache file:', error);
    return { contractNames: {}, methodNames: {} }; // Return empty cache structure if error
  }
}

// Function to write to the cache JSON file
function writeCache(cache: any) {
  try {
    fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));
    console.log('Cache file updated.');
  } catch (error) {
    console.error('Error writing cache file:', error);
  }
}
