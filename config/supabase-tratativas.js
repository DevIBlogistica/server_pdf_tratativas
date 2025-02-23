const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Criando o cliente Supabase para o projeto de tratativas
const supabaseTratativas = createClient(
    process.env.SUPABASE_TRATATIVAS_URL,
    process.env.SUPABASE_TRATATIVAS_SERVICE_KEY
);

module.exports = supabaseTratativas; 