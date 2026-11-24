const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'front', 'src', 'locales', 'mg', 'translation.json');

const content = fs.readFileSync(filePath, 'utf8');
const json = JSON.parse(content);

function processString(str) {
  if (typeof str !== 'string') return str;
  // Find the TODO phrase
  const todoIndex = str.indexOf('TODO:');
  if (todoIndex === -1) {
    return str;
  }
  // Return the part before TODO, trimmed
  return str.slice(0, todoIndex).trimEnd();
}

function traverse(obj) {
  if (typeof obj === 'object' && obj !== null) {
    if (Array.isArray(obj)) {
      return obj.map(traverse);
    } else {
      const newObj = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          newObj[key] = traverse(obj[key]);
        }
      }
      return newObj;
    }
  } else if (typeof obj === 'string') {
    return processString(obj);
  } else {
    return obj;
  }
}

const updated = traverse(json);
const updatedContent = JSON.stringify(updated, null, 2);
fs.writeFileSync(filePath, updatedContent);
console.log(`Updated ${filePath}`);