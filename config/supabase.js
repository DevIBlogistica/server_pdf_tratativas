const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Adicionando log para debug das credenciais
console.log('[Supabase] Inicializando cliente com URL:', process.env.SUPABASE_TRATATIVAS_URL);

const supabase = createClient(
    process.env.SUPABASE_TRATATIVAS_URL,
    process.env.SUPABASE_TRATATIVAS_KEY
);

module.exports = supabase; 