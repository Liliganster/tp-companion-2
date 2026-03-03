const fs = require('fs');
let lines = fs.readFileSync('api/external.ts', 'utf-8').split('\n');

// Remove lines with _debug and the surrounding if/else block
const keep = [];
let skip = 0;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  // Detect start of the debug if block
  if (l.includes('typeof attempt !== "undefined"')) { skip = 1; continue; }
  if (skip > 0) {
    // Count braces to find end of if/else block
    skip += (l.match(/{/g)||[]).length;
    skip -= (l.match(/}/g)||[]).length;
    if (skip <= 0) skip = 0;
    continue;
  }
  // Replace `payload: any` with just `payload`
  keep.push(l.replace('const payload: any = {', 'const payload = {'));
}

fs.writeFileSync('api/external.ts', keep.join('\n'));
console.log('cleaned. _debug left:', keep.filter(l => l.includes('_debug')).length);
