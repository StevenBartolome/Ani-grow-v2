const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const urlMatch = env.match(/EXPO_PUBLIC_SUPABASE_URL=([^\r\n]+)/);
const keyMatch = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/);

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function check() {
    const { data, error } = await supabase.from('devices').select('animal_type').limit(1);
    console.log('Data:', data, 'Error:', error);
}

check();
