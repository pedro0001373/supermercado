const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Inicializa banco de dados e depois inicia o servidor
const { dbReady } = require('./models/database');

dbReady.then(() => {
  console.log('Banco de dados inicializado com sucesso!');

  // Rotas da API
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/produtos', require('./routes/produtos'));
  app.use('/api/categorias', require('./routes/categorias'));
  app.use('/api/fornecedores', require('./routes/fornecedores'));
  app.use('/api/estoque', require('./routes/estoque'));
  app.use('/api/validade', require('./routes/validade'));
  app.use('/api/notas-entrada', require('./routes/notasEntrada'));
  app.use('/api/caixa', require('./routes/caixa'));
  app.use('/api/vendas', require('./routes/vendas'));
  app.use('/api/nfce', require('./routes/nfce'));
  app.use('/api/relatorios', require('./routes/relatorios'));
  app.use('/api/configuracoes', require('./routes/configuracoes'));
  app.use('/api/clientes', require('./routes/clientes'));

  // Middleware de erro para API - retorna JSON em vez de HTML
  app.use('/api', (err, req, res, next) => {
    console.error('API Error:', err.message);
    res.status(500).json({ error: err.message });
  });

  // Rota principal - serve o frontend
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    const nets = os.networkInterfaces();
    var ips = [];
    for (var name in nets) {
      for (var net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          ips.push(net.address);
        }
      }
    }
    console.log(`===========================================`);
    console.log(`  SUPERMERCADO PERES - Sistema de Gestão`);
    console.log(`  Servidor rodando em: http://localhost:${PORT}`);
    if (ips.length > 0) {
      console.log(`  `);
      console.log(`  Acesso pela rede local:`);
      ips.forEach(ip => console.log(`  => http://${ip}:${PORT}`));
    }
    console.log(`===========================================`);
  });
}).catch(err => {
  console.error('Erro ao inicializar banco de dados:', err);
  process.exit(1);
});
