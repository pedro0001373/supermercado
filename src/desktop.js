/**
 * SUPERMERCADO PERES - Launcher Desktop
 * Inicia o servidor e abre automaticamente no navegador
 * Outros computadores na rede acessam pelo IP
 */
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const PORT = 3000;
process.env.PORT = String(PORT);

// Ajustar diretório de trabalho para a raiz do projeto
const rootDir = path.resolve(__dirname, '..');
process.chdir(rootDir);

// Descobrir IPs da rede local
function getLocalIPs() {
  var ips = [];
  var nets = os.networkInterfaces();
  for (var name in nets) {
    for (var net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push({ name: name, ip: net.address });
      }
    }
  }
  return ips;
}

console.log('');
console.log('  =============================================');
console.log('  |   SUPERMERCADO PERES - Sistema de Gestao  |');
console.log('  =============================================');
console.log('');
console.log('  Iniciando sistema...');
console.log('');

// Importar e iniciar o servidor
require('./server');

// Aguardar servidor iniciar e abrir navegador
setTimeout(function() {
  var url = 'http://localhost:' + PORT;
  var ips = getLocalIPs();

  console.log('');
  console.log('  =============================================');
  console.log('  NESTE COMPUTADOR:');
  console.log('    ' + url);
  console.log('');
  if (ips.length > 0) {
    console.log('  OUTROS COMPUTADORES NA REDE:');
    ips.forEach(function(item) {
      console.log('    http://' + item.ip + ':' + PORT);
    });
    console.log('');
    console.log('  Compartilhe o endereco acima com os outros PCs.');
    console.log('  Basta abrir o navegador e digitar o endereco.');
  }
  console.log('  =============================================');
  console.log('');
  console.log('  *** NAO FECHE ESTA JANELA ***');
  console.log('  O sistema funciona enquanto esta janela estiver aberta.');
  console.log('  Todos os computadores da rede dependem desta maquina.');
  console.log('  Para encerrar, feche esta janela ou pressione Ctrl+C');
  console.log('');

  // Abrir no navegador padrão
  var cmd;
  if (process.platform === 'win32') {
    cmd = 'start "" "' + url + '"';
  } else if (process.platform === 'darwin') {
    cmd = 'open "' + url + '"';
  } else {
    cmd = 'xdg-open "' + url + '"';
  }
  exec(cmd);
}, 3000);

// Manter o processo rodando
process.on('SIGINT', function() {
  console.log('\n  Sistema encerrado.');
  process.exit(0);
});
