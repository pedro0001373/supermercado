#!/usr/bin/env node
// ====================================================================
// BACKUP EXTERNO DO BANCO DE DADOS
// --------------------------------------------------------------------
// Executa um dump consistente do arquivo .db, compacta em .gz e envia
// para um destino externo configurado via variaveis de ambiente.
//
// Destinos suportados (ordem de prioridade):
//   1) BACKUP_RCLONE_REMOTE       - envia via rclone (se instalado no sistema)
//      ex: BACKUP_RCLONE_REMOTE="meu-s3:bucket/backups"
//   2) BACKUP_EXTERNAL_DIR        - copia para um diretorio externo
//      ex: BACKUP_EXTERNAL_DIR="D:/backups-externos" (HD externo, pen drive, etc)
//   3) Default: apenas mantem o backup compactado em data/backups-externos/
//
// Outras variaveis:
//   BACKUP_RETENTION_DAYS (default: 30) - dias de retencao
//
// Agendamento sugerido (Windows): abra "Task Scheduler" e crie uma tarefa
// diaria que execute:  node scripts/backupExterno.js
// No Linux, adicione em crontab -e:
//   0 2 * * * cd /caminho/para/projeto && node scripts/backupExterno.js >> logs/backup.log 2>&1
// ====================================================================

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');
const { execFile } = require('child_process');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data', 'supermercado.db');
const BACKUP_LOCAL_DIR = path.join(ROOT, 'data', 'backups-externos');
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS) || 30;

function log(msg) {
  console.log('[' + new Date().toISOString() + '] ' + msg);
}

function erro(msg) {
  console.error('[' + new Date().toISOString() + '] ERRO: ' + msg);
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

function registrarStatus(sucesso, arquivo, destino, tamanho, mensagem) {
  try {
    const db = new Database(DB_PATH);
    db.exec(`CREATE TABLE IF NOT EXISTS backups_externos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      arquivo TEXT,
      destino TEXT,
      tamanho INTEGER,
      sucesso INTEGER NOT NULL,
      mensagem TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.prepare('INSERT INTO backups_externos (arquivo, destino, tamanho, sucesso, mensagem) VALUES (?, ?, ?, ?, ?)')
      .run(arquivo || null, destino || null, tamanho || null, sucesso ? 1 : 0, mensagem || null);
    db.close();
  } catch (e) {
    erro('Nao consegui registrar status no banco: ' + e.message);
  }
}

async function dumpConsistente(destino) {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    await db.backup(destino);
  } finally {
    db.close();
  }
}

async function compactar(origem, destinoGz) {
  await pipeline(
    fs.createReadStream(origem),
    zlib.createGzip({ level: 9 }),
    fs.createWriteStream(destinoGz)
  );
}

function rcloneUpload(origem, remoto) {
  return new Promise((resolve, reject) => {
    execFile('rclone', ['copy', origem, remoto, '--transfers=1', '--no-traverse'], (err, stdout, stderr) => {
      if (err) return reject(new Error('rclone falhou: ' + (stderr || err.message)));
      resolve(stdout);
    });
  });
}

function limparAntigos(diretorio, diasRetencao) {
  if (!fs.existsSync(diretorio)) return 0;
  const agora = Date.now();
  const limite = diasRetencao * 24 * 60 * 60 * 1000;
  let removidos = 0;
  const arquivos = fs.readdirSync(diretorio);
  for (const nome of arquivos) {
    if (!nome.startsWith('backup_') || !nome.endsWith('.db.gz')) continue;
    const p = path.join(diretorio, nome);
    try {
      const st = fs.statSync(p);
      if (agora - st.mtimeMs > limite) {
        fs.unlinkSync(p);
        removidos++;
      }
    } catch (e) { /* ignora */ }
  }
  return removidos;
}

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    erro('Banco de dados nao encontrado: ' + DB_PATH);
    registrarStatus(false, null, null, null, 'Banco nao encontrado em ' + DB_PATH);
    process.exit(1);
  }

  if (!fs.existsSync(BACKUP_LOCAL_DIR)) fs.mkdirSync(BACKUP_LOCAL_DIR, { recursive: true });

  const ts = timestamp();
  const nomeDb = 'backup_' + ts + '.db';
  const nomeGz = nomeDb + '.gz';
  const dbTemp = path.join(BACKUP_LOCAL_DIR, nomeDb);
  const gzPath = path.join(BACKUP_LOCAL_DIR, nomeGz);

  let destinoUsado = 'local';
  let tamanho = 0;

  try {
    log('Iniciando backup externo...');

    log('1/4 - Criando snapshot consistente do banco...');
    await dumpConsistente(dbTemp);

    log('2/4 - Compactando (gzip)...');
    await compactar(dbTemp, gzPath);
    tamanho = fs.statSync(gzPath).size;
    try { fs.unlinkSync(dbTemp); } catch (e) {}

    log('3/4 - Enviando para destino externo...');
    const rcloneRemote = process.env.BACKUP_RCLONE_REMOTE;
    const dirExterno = process.env.BACKUP_EXTERNAL_DIR;

    if (rcloneRemote) {
      destinoUsado = 'rclone:' + rcloneRemote;
      await rcloneUpload(gzPath, rcloneRemote);
      log('  -> enviado via rclone para ' + rcloneRemote);
    } else if (dirExterno) {
      destinoUsado = 'dir:' + dirExterno;
      if (!fs.existsSync(dirExterno)) fs.mkdirSync(dirExterno, { recursive: true });
      const destExt = path.join(dirExterno, nomeGz);
      fs.copyFileSync(gzPath, destExt);
      log('  -> copiado para ' + destExt);
    } else {
      log('  -> nenhum destino externo configurado (BACKUP_RCLONE_REMOTE ou BACKUP_EXTERNAL_DIR)');
      log('  -> mantendo apenas copia local em ' + BACKUP_LOCAL_DIR);
    }

    log('4/4 - Limpando backups antigos (> ' + RETENTION_DAYS + ' dias)...');
    const removidosLocal = limparAntigos(BACKUP_LOCAL_DIR, RETENTION_DAYS);
    let removidosExt = 0;
    if (dirExterno) removidosExt = limparAntigos(dirExterno, RETENTION_DAYS);
    log('  -> removidos: ' + removidosLocal + ' local, ' + removidosExt + ' externo');

    const mb = (tamanho / 1024 / 1024).toFixed(2);
    log('CONCLUIDO: ' + nomeGz + ' (' + mb + ' MB) -> ' + destinoUsado);
    registrarStatus(true, nomeGz, destinoUsado, tamanho, 'OK (' + mb + ' MB)');
  } catch (e) {
    erro(e.message);
    registrarStatus(false, nomeGz, destinoUsado, tamanho, e.message);
    process.exit(1);
  }
}

main();
