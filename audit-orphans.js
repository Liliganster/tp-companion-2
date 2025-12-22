import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.resolve(__dirname, 'src');
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css'];

// Helper to recursively get files
function getFiles(dir) {
    const subdirs = fs.readdirSync(dir);
    const files = awaitPromise(subdirs.map(async (subdir) => {
        const res = path.resolve(dir, subdir);
        return (fs.statSync(res).isDirectory()) ? getFiles(res) : res;
    }));
    return files.reduce((a, f) => a.concat(f), []);
}

function normalizePath(filePath) {
    return filePath.split(path.sep).join('/');
}

// Simple recursive sync file walker
function walkSync(dir, filelist = []) {
    fs.readdirSync(dir).forEach(file => {
        const filepath = path.join(dir, file);
        if (fs.statSync(filepath).isDirectory()) {
            filelist = walkSync(filepath, filelist);
        } else {
            if (EXTENSIONS.includes(path.extname(file))) {
                filelist.push(normalizePath(filepath));
            }
        }
    });
    return filelist;
}

const allFiles = walkSync(SRC_DIR);
const importedFiles = new Set();

// Regex for imports
const importRegex = /import\s+(?:[\w\s{},*]*\s+from\s+)?['"](.*?)['"]/g;
const dynamicImportRegex = /import\(['"](.*?)['"]\)/g;
const requireRegex = /require\(['"](.*?)['"]\)/g;
const cssImportRegex = /@import\s+['"](.*?)['"]/g; // Basic CSS import support

allFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8');

    [importRegex, dynamicImportRegex, requireRegex, cssImportRegex].forEach(regex => {
        let match;
        while ((match = regex.exec(content)) !== null) {
            const importPath = match[1];
            resolveImport(file, importPath);
        }
    });
});

function resolveImport(sourceFile, importPath) {
    // Handle aliases
    let targetPath = importPath;
    if (importPath.startsWith('@/')) {
        targetPath = path.join(SRC_DIR, importPath.slice(2));
    } else if (importPath.startsWith('.')) {
        targetPath = path.resolve(path.dirname(sourceFile), importPath);
    } else {
        // Node modules or other aliases we don't track for orphan detection in src
        return;
    }

    // Try extensions
    let resolved = null;
    const attempts = [
        targetPath,
        targetPath + '.ts',
        targetPath + '.tsx',
        targetPath + '.js',
        targetPath + '.jsx',
        targetPath + '/index.ts',
        targetPath + '/index.tsx',
        targetPath + '/index.js',
        targetPath + '.css'
    ];

    for (const attempt of attempts) {
        const normalized = normalizePath(attempt);
        if (allFiles.includes(normalized)) {
            importedFiles.add(normalized);
            resolved = normalized;
            break;
        }
    }
}

// Entry points whitelist (files that are okay to not be imported)
const ENTRY_POINTS = [
    'src/main.tsx',
    'src/App.tsx',
    'src/vite-env.d.ts',
    'src/index.css', // Often imported by main.tsx, but let's whitelist just in case scanning misses it
];

const orphans = allFiles.filter(f => {
    // Check if imported
    if (importedFiles.has(f)) return false;

    // Check entry points
    if (ENTRY_POINTS.some(ep => f.endsWith(ep))) return false;

    return true;
});

console.log("Found " + orphans.length + " potential orphans:");
orphans.forEach(o => console.log(o));
