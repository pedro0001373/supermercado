/**
 * Script para empacotar o sistema para distribuicao
 * Cria uma pasta "SupermercadoPeres" pronta para copiar em outros PCs
 *
 * Uso: node scripts/empacotar.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist', 'SupermercadoPeres');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  var entries = fs.readdirSync(src, { withFileTypes: true });
  for (var entry of entries) {
    var srcPath = path.join(src, entry.name);
    var destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('');
console.log('=== EMPACOTANDO SUPERMERCADO PERES ===');
console.log('');

// Limpar dist anterior
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
  console.log('[OK] Pasta anterior removida');
}
fs.mkdirSync(DIST, { recursive: true });

// Copiar arquivos necessarios
var pastas = ['src', 'public', 'node_modules'];
for (var pasta of pastas) {
  var src = path.join(ROOT, pasta);
  if (fs.existsSync(src)) {
    console.log('[...] Copiando ' + pasta + '...');
    copyDir(src, path.join(DIST, pasta));
    console.log('[OK] ' + pasta);
  }
}

// Copiar arquivos da raiz
var arquivos = ['package.json', 'Iniciar Supermercado Peres.bat'];
for (var arq of arquivos) {
  var src = path.join(ROOT, arq);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(DIST, arq));
    console.log('[OK] ' + arq);
  }
}

// Criar LEIA-ME
var leiame = [
  '=============================================',
  '  SUPERMERCADO PERES - Sistema de Gestao',
  '=============================================',
  '',
  'COMO INSTALAR:',
  '',
  '1. Instale o Node.js no computador:',
  '   - Acesse: https://nodejs.org',
  '   - Baixe a versao LTS (recomendada)',
  '   - Instale com as opcoes padrao (Next, Next, Next...)',
  '',
  '2. Copie esta pasta inteira para o computador',
  '',
  '3. De duplo clique em "Iniciar Supermercado Peres.bat"',
  '',
  '4. O sistema vai abrir automaticamente no navegador',
  '',
  'LOGIN PADRAO:',
  '  Admin:    admin / admin123',
  '  Gerente:  gerente / 123456',
  '  Operador: operador / 123456',
  '',
  'OBSERVACOES:',
  '  - NAO feche a janela preta (terminal) enquanto estiver usando',
  '  - O banco de dados fica na pasta "data/"',
  '  - Para fazer backup, copie a pasta "data/"',
  '',
  '=============================================',
].join('\r\n');

fs.writeFileSync(path.join(DIST, 'LEIA-ME.txt'), leiame);
console.log('[OK] LEIA-ME.txt');

// Criar pasta data vazia
fs.mkdirSync(path.join(DIST, 'data'), { recursive: true });
console.log('[OK] pasta data/');

console.log('');
console.log('=== EMPACOTAMENTO CONCLUIDO! ===');
console.log('');
console.log('Pasta pronta em:');
console.log(DIST);
console.log('');
console.log('Para distribuir:');
console.log('1. Compacte a pasta "SupermercadoPeres" em um .zip');
console.log('2. Envie o .zip para o outro computador');
console.log('3. Descompacte e siga o LEIA-ME.txt');
console.log('');
