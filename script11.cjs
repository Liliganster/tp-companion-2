const fs = require('fs');
let s = fs.readFileSync('api/external.ts', 'utf-8');

// Remove both instances of the if/else _debug block and fix payload: any
s = s.replace(
  /const payload: any = \{ fuelType([\s\S]*?historic_user_fallback[\s\S]*?)\};\s*if \(typeof attempt !== "undefined"\) \{[\s\S]*?\} else \{[\s\S]*?\}\s*return sendJson\(res, 200, payload\);/g,
  (match, inner) => {
    return `const payload = { fuelType${inner}};\n      return sendJson(res, 200, payload);`;
  }
);

fs.writeFileSync('api/external.ts', s);
const remaining = (s.match(/_debug/g)||[]).length;
console.log('done. _debug remaining:', remaining);
