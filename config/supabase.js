const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Criando o cliente Supabase com as credenciais do .env
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

module.exports = supabase; 