const fs = require('fs');
const path = require('path');

const BASE_PATH = path.resolve(__dirname); // Current folder
const IGNORE_DIRS = ['node_modules', 'logs', '.git', '.vscode'];

function printTree(dir, indent = '') {
    const items = fs.readdirSync(dir).sort((a, b) => {
        const aPath = path.join(dir, a);
        const bPath = path.join(dir, b);
        const aIsDir = fs.statSync(aPath).isDirectory();
        const bIsDir = fs.statSync(bPath).isDirectory();
        return aIsDir === bIsDir ? a.localeCompare(b) : bIsDir - aIsDir;
    });

    for (const item of items) {
        const fullPath = path.join(dir, item);
        const isDir = fs.statSync(fullPath).isDirectory();

        if (IGNORE_DIRS.includes(item)) continue;

        const prefix = isDir ? '📁' : '📄';
        console.log(`${indent}${prefix} ${item}`);

        if (isDir) {
            printTree(fullPath, indent + '   ');
        }
    }
}

console.log(`📂 Folder structure of: ${BASE_PATH}\n`);
printTree(BASE_PATH);
