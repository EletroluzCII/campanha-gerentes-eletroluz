import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadLocalEnv() {
  const envPath = resolve('.env');
  if (!existsSync(envPath)) return;
  readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  });
}

function readCredentials() {
  const accessPath = resolve('ACESSOS_INICIAIS.txt');
  if (!existsSync(accessPath)) {
    throw new Error('Arquivo ACESSOS_INICIAIS.txt não encontrado na raiz do projeto.');
  }
  return readFileSync(accessPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.match(/^([a-z0-9_]+)\s*=\s*(\S+)$/))
    .filter(Boolean)
    .map((match) => ({ username: match[1], password: match[2] }));
}

async function findUserByEmail(client, email) {
  let page = 1;
  while (page <= 10) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find((user) => user.email === email);
    if (found) return found;
    if (data.users.length < 100) return null;
    page += 1;
  }
  return null;
}

loadLocalEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env local.');
}

const credentials = readCredentials();
if (credentials.length !== 13) {
  throw new Error(`Esperadas 13 credenciais; encontradas ${credentials.length}.`);
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: branches, error: branchesError } = await client
  .from('branches')
  .select('id, slug, name');
if (branchesError) throw branchesError;

for (const credential of credentials) {
  const isAdmin = credential.username === 'admin';
  const branch = isAdmin ? null : branches.find((item) => item.slug === credential.username);
  if (!isAdmin && !branch) throw new Error(`Filial não encontrada para ${credential.username}.`);

  const email = `${credential.username}@campanha.eletroluz.local`;
  let user = await findUserByEmail(client, email);

  if (!user) {
    const { data, error } = await client.auth.admin.createUser({
      email,
      password: credential.password,
      email_confirm: true,
      user_metadata: { username: credential.username },
    });
    if (error) throw error;
    user = data.user;
  }

  const { error: profileError } = await client.from('profiles').upsert({
    id: user.id,
    branch_id: branch?.id ?? null,
    role: isAdmin ? 'admin' : 'manager',
    display_name: isAdmin ? 'Administrador da campanha' : branch.name,
  });
  if (profileError) throw profileError;

  process.stdout.write(`Conta configurada: ${credential.username}\n`);
}

process.stdout.write('\n13 contas configuradas. As senhas não foram exibidas no terminal.\n');
