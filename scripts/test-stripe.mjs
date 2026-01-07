
import fs from 'fs';
import path from 'path';
import Stripe from 'stripe';

const envPath = path.resolve(process.cwd(), '.env.local');
console.log('Reading .env.local from:', envPath);

if (!fs.existsSync(envPath)) {
  console.error('.env.local not found');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
const lines = envContent.split(/\r?\n/);
console.log(`Parsed ${lines.length} lines.`);

lines.forEach(line => {
  const cleanLine = line.trim();
  if (!cleanLine || cleanLine.startsWith('#')) return;
  
  // Remove 'export ' if present
  const content = cleanLine.replace(/^export\s+/, '');
  
  const equalsIndex = content.indexOf('=');
  if (equalsIndex !== -1) {
    const key = content.substring(0, equalsIndex).trim();
    let value = content.substring(equalsIndex + 1).trim();
    
    // Handle quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    
    env[key] = value;
  }
});

console.log('Found keys:', Object.keys(env));

const key = env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('STRIPE_SECRET_KEY not found in .env.local');
  process.exit(1);
}

const cleanKey = key.replace(/\s/g, "");
console.log('Stripe Key found (length):', cleanKey.length);
console.log('Stripe Key prefix:', cleanKey.substring(0, 10) + '...');

try {
  const stripe = new Stripe(cleanKey, {
    apiVersion: '2025-01-27.acacia', // Or whatever version is installed, default is usually fine
  });

  console.log('Attempting to list customers to verify authentication...');
  const customers = await stripe.customers.list({ limit: 1 });
  console.log('Success! Stripe connection working.');
  console.log('Found customers:', customers.data.length);

} catch (error) {
  console.error('Stripe Error:', error.message);
  if (error.type) console.error('Error Type:', error.type);
}
