const { Client } = require('pg');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
    const [k, v] = line.split('=');
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
}, {});

// Extract direct db url from SUPABASE_URL and SERVICE_ROLE_KEY or use something else.
// Actually, it's easier to use Supabase REST API via `pg` if we have a connection string.
// Let's check environment for direct db connection string:
console.log("DB URL inside env:", env.DATABASE_URL ? "Exists" : "Missing");
