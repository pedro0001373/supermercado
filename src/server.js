const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Inicializa banco de dados e depois inicia o servidor
const { dbReady } = require('./models/database');

dbReady.then(() => {
  console.log('Banco de dados inicializado com sucesso!');

  const { authMiddleware } = require('./middleware/authMiddleware');

  // Rotas publicas (login) - auth.js trata internamente quais rotas sao protegidas
  app.use('/api/auth', require('./routes/auth'));

  // Rotas protegidas - exigem JWT
  app.use('/api/produtos', authMiddleware, require('./routes/produtos'));
  app.use('/api/categorias', authMiddleware, require('./routes/categorias'));
  app.use('/api/fornecedores', authMiddleware, require('./routes/fornecedores'));
  app.use('/api/estoque', authMiddleware, require('./routes/estoque'));
  app.use('/api/validade', authMiddleware, require('./routes/validade'));
  app.use('/api/notas-entrada', authMiddleware, require('./routes/notasEntrada'));
  app.use('/api/caixa', authMiddleware, require('./routes/caixa'));
  app.use('/api/vendas', authMiddleware, require('./routes/vendas'));
  app.use('/api/nfce', authMiddleware, require('./routes/nfce'));
  app.use('/api/relatorios', authMiddleware, require('./routes/relatorios'));
  app.use('/api/configuracoes', authMiddleware, require('./routes/configuracoes'));
  app.use('/api/clientes', authMiddleware, require('./routes/clientes'));
  app.use('/api/financeiro', authMiddleware, require('./routes/financeiro'));
  app.use('/api/impressao', authMiddleware, require('./routes/impressao'));

  // Busca global
  const dbBusca = require('./models/db');
  app.get('/api/busca-global', authMiddleware, (req, res) => {
    try {
      const { q } = req.query;
      if (!q || q.length < 2) return res.json({ produtos: [], fornecedores: [], vendas: [] });
      const termo = '%' + q + '%';

      const produtos = dbBusca.prepare(
        `SELECT id, nome, codigo_barras, preco_venda, estoque_atual FROM produtos WHERE nome LIKE ? OR codigo_barras LIKE ? LIMIT 8`
      ).all(termo, termo);

      const fornecedores = dbBusca.prepare(
        `SELECT id, razao_social, cnpj, telefone FROM fornecedores WHERE razao_social LIKE ? OR cnpj LIKE ? LIMIT 5`
      ).all(termo, termo);

      const vendas = dbBusca.prepare(
        `SELECT v.id, v.numero_venda, v.total, v.criado_em as data_venda FROM vendas v WHERE v.numero_venda LIKE ? OR CAST(v.id AS TEXT) LIKE ? ORDER BY v.id DESC LIMIT 5`
      ).all(termo, termo);

      res.json({ produtos, fornecedores, vendas });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 404 para rotas de API nao encontradas
  app.use('/api', (req, res, next) => {
    res.status(404).json({ error: 'Endpoint nao encontrado: ' + req.method + ' ' + req.originalUrl });
  });

  // Middleware global de erros - retorna JSON estruturado em vez de HTML
  app.use('/api', (err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    const isValidation = err.name === 'ValidationError' || status === 400;

    console.error('[API Error]', req.method, req.originalUrl, '-', err.message);
    if (status >= 500 && err.stack) console.error(err.stack);

    const body = { error: err.message || 'Erro interno do servidor' };
    if (isValidation && err.fields) body.fields = err.fields;
    res.status(status).json(body);
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
    console.log(`  SISTEMA DE GESTAO COMERCIAL`);
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
