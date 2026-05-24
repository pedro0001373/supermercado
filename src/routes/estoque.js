const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { registrarLog } = require('../middleware/logger');

// Produtos com estoque baixo
router.get('/alertas', (req, res) => {
  const produtos = db.prepare(`
    SELECT p.*, c.nome as categoria_nome
    FROM produtos p
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE p.ativo = 1 AND p.estoque_atual <= p.estoque_minimo AND p.estoque_minimo > 0
    ORDER BY (p.estoque_atual - p.estoque_minimo) ASC
  `).all();
  res.json(produtos);
});

// Histórico de movimentações
router.get('/movimentacoes', (req, res) => {
  const { produto_id, tipo, data_inicio, data_fim, page = 1, limit = 50 } = req.query;
  let sql = `SELECT m.*, p.nome as produto_nome, p.codigo_barras
    FROM movimentacoes_estoque m
    JOIN produtos p ON m.produto_id = p.id WHERE 1=1`;
  const params = [];

  if (produto_id) { sql += ` AND m.produto_id = ?`; params.push(produto_id); }
  if (tipo) { sql += ` AND m.tipo = ?`; params.push(tipo); }
  if (data_inicio) { sql += ` AND m.criado_em >= ?`; params.push(data_inicio); }
  if (data_fim) { sql += ` AND m.criado_em <= ?`; params.push(data_fim + ' 23:59:59'); }

  const countSql = sql.replace(/SELECT m\.\*.*FROM/, 'SELECT COUNT(*) as total FROM');
  const total = db.prepare(countSql).get(...params).total;

  sql += ` ORDER BY m.criado_em DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), (Number(page) - 1) * Number(limit));

  res.json({ movimentacoes: db.prepare(sql).all(...params), total });
});

// Entrada manual de estoque
router.post('/entrada', (req, res) => {
  const { produto_id, quantidade, motivo, usuario } = req.body;
  if (!produto_id || !quantidade) return res.status(400).json({ error: 'Produto e quantidade são obrigatórios' });

  const produto = db.prepare(`SELECT * FROM produtos WHERE id = ?`).get(produto_id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });

  const novoEstoque = produto.estoque_atual + Number(quantidade);

  const transaction = db.transaction(() => {
    db.prepare(`UPDATE produtos SET estoque_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(novoEstoque, produto_id);
    db.prepare(`
      INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, motivo, usuario)
      VALUES (?, 'entrada', ?, ?, ?, ?, ?)
    `).run(produto_id, quantidade, produto.estoque_atual, novoEstoque, motivo || 'Entrada manual', usuario || 'sistema' || null);
  });
  transaction();

  registrarLog(null, usuario, 'entrada_estoque', 'estoque', produto.nome + ': +' + quantidade + ' (estoque: ' + novoEstoque + ')', req.ip);
  res.json({ message: 'Entrada registrada', estoque_atual: novoEstoque });
});

// Saída manual de estoque
router.post('/saida', (req, res) => {
  const { produto_id, quantidade, motivo, usuario } = req.body;
  if (!produto_id || !quantidade) return res.status(400).json({ error: 'Produto e quantidade são obrigatórios' });

  const produto = db.prepare(`SELECT * FROM produtos WHERE id = ?`).get(produto_id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });

  const novoEstoque = produto.estoque_atual - Number(quantidade);

  const transaction = db.transaction(() => {
    db.prepare(`UPDATE produtos SET estoque_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(novoEstoque, produto_id);
    db.prepare(`
      INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, motivo, usuario)
      VALUES (?, 'saida', ?, ?, ?, ?, ?)
    `).run(produto_id, quantidade, produto.estoque_atual, novoEstoque, motivo || 'Saída manual', usuario || 'sistema' || null);
  });
  transaction();

  registrarLog(null, usuario, 'saida_estoque', 'estoque', produto.nome + ': -' + quantidade + ' (estoque: ' + novoEstoque + ')', req.ip);
  res.json({ message: 'Saída registrada', estoque_atual: novoEstoque });
});

// Ajuste de inventário
router.post('/inventario', (req, res) => {
  const { itens, usuario } = req.body;
  // itens = [{ produto_id, quantidade_contada }]
  if (!itens || !itens.length) return res.status(400).json({ error: 'Itens são obrigatórios' });

  const transaction = db.transaction(() => {
    for (const item of itens) {
      const produto = db.prepare(`SELECT * FROM produtos WHERE id = ?`).get(item.produto_id);
      if (!produto) continue;

      const diferenca = item.quantidade_contada - produto.estoque_atual;
      db.prepare(`UPDATE produtos SET estoque_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(item.quantidade_contada, item.produto_id);
      db.prepare(`
        INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, motivo, usuario)
        VALUES (?, 'inventario', ?, ?, ?, 'Ajuste de inventário', ?)
      `).run(item.produto_id, Math.abs(diferenca), produto.estoque_atual, item.quantidade_contada, usuario || 'sistema');
    }
  });
  transaction();

  registrarLog(null, usuario, 'inventario', 'estoque', 'Inventario ajustado: ' + itens.length + ' itens', req.ip);
  res.json({ message: `Inventário atualizado: ${itens.length} itens` });
});

// Registrar perda
router.post('/perda', (req, res) => {
  const { produto_id, quantidade, motivo, usuario } = req.body;
  if (!produto_id || !quantidade) return res.status(400).json({ error: 'Produto e quantidade são obrigatórios' });

  const produto = db.prepare(`SELECT * FROM produtos WHERE id = ?`).get(produto_id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });

  const novoEstoque = produto.estoque_atual - Number(quantidade);

  const transaction = db.transaction(() => {
    db.prepare(`UPDATE produtos SET estoque_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(novoEstoque, produto_id);
    db.prepare(`
      INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, motivo, usuario)
      VALUES (?, 'perda', ?, ?, ?, ?, ?)
    `).run(produto_id, quantidade, produto.estoque_atual, novoEstoque, motivo || 'Perda', usuario || 'sistema' || null);
  });
  transaction();

  registrarLog(null, usuario, 'perda', 'estoque', produto.nome + ': -' + quantidade + ' (' + (motivo || 'Perda') + ')', req.ip);
  res.json({ message: 'Perda registrada', estoque_atual: novoEstoque });
});

// ============ PEDIDO DE COMPRA AUTOMÁTICO ============

// Sugerir pedido baseado no consumo
router.get('/sugestao-pedido', (req, res) => {
  // Calcular consumo médio dos últimos 30 dias
  const produtos = db.prepare(`
    SELECT p.id, p.nome, p.codigo_barras, p.estoque_atual, p.estoque_minimo,
           p.preco_custo, p.ultimo_fornecedor_id, p.unidade,
           f.razao_social as fornecedor_nome,
           COALESCE(SUM(CASE WHEN m.tipo IN ('saida','perda') AND m.criado_em >= date('now','-30 days') THEN m.quantidade ELSE 0 END), 0) as consumo_30d,
           COALESCE(SUM(CASE WHEN m.tipo IN ('saida','perda') AND m.criado_em >= date('now','-7 days') THEN m.quantidade ELSE 0 END), 0) as consumo_7d
    FROM produtos p
    LEFT JOIN movimentacoes_estoque m ON p.id = m.produto_id
    LEFT JOIN fornecedores f ON p.ultimo_fornecedor_id = f.id
    WHERE p.ativo = 1 AND p.estoque_minimo > 0
    GROUP BY p.id
    HAVING p.estoque_atual <= p.estoque_minimo * 1.5
    ORDER BY (p.estoque_atual - p.estoque_minimo) ASC
  `).all();

  const sugestoes = produtos.map(p => {
    const consumoDiario = p.consumo_30d / 30;
    const diasEstoque = consumoDiario > 0 ? Math.floor(p.estoque_atual / consumoDiario) : 999;
    // Sugerir quantidade para 30 dias de estoque + margem
    const qtdSugerida = Math.max(
      p.estoque_minimo * 2 - p.estoque_atual,
      Math.ceil(consumoDiario * 30) - p.estoque_atual
    );
    return {
      ...p,
      consumo_diario: Math.round(consumoDiario * 100) / 100,
      dias_estoque: diasEstoque,
      quantidade_sugerida: Math.max(0, Math.ceil(qtdSugerida)),
      custo_estimado: Math.max(0, Math.ceil(qtdSugerida)) * (p.preco_custo || 0)
    };
  }).filter(p => p.quantidade_sugerida > 0);

  res.json(sugestoes);
});

// Criar pedido de compra
router.post('/pedido-compra', (req, res) => {
  const { fornecedor_id, itens, observacoes, usuario } = req.body;
  if (!itens || !itens.length) return res.status(400).json({ error: 'Itens são obrigatórios' });

  const transaction = db.transaction(() => {
    let total = 0;
    for (const item of itens) { total += (item.quantidade || 0) * (item.custo_estimado || 0); }

    const result = db.prepare(`
      INSERT INTO pedidos_compra (fornecedor_id, total, observacoes, criado_por) VALUES (?, ?, ?, ?)
    `).run(fornecedor_id || null, total, observacoes || null, usuario || 'sistema');

    const pedidoId = result.lastInsertRowid;
    for (const item of itens) {
      db.prepare(`
        INSERT INTO itens_pedido_compra (pedido_id, produto_id, quantidade_sugerida, quantidade, custo_estimado)
        VALUES (?, ?, ?, ?, ?)
      `).run(pedidoId, item.produto_id, item.quantidade_sugerida || 0, item.quantidade, item.custo_estimado || 0);
    }
    return pedidoId;
  });

  try {
    const id = transaction();
    registrarLog(null, usuario, 'pedido_compra', 'estoque', 'Pedido #' + id + ' criado com ' + itens.length + ' itens', req.ip);
    res.status(201).json({ id, message: 'Pedido de compra criado' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Listar pedidos de compra
router.get('/pedidos-compra', (req, res) => {
  const pedidos = db.prepare(`
    SELECT pc.*, f.razao_social as fornecedor_nome,
           (SELECT COUNT(*) FROM itens_pedido_compra WHERE pedido_id = pc.id) as qtd_itens
    FROM pedidos_compra pc
    LEFT JOIN fornecedores f ON pc.fornecedor_id = f.id
    ORDER BY pc.criado_em DESC LIMIT 50
  `).all();
  res.json(pedidos);
});

// Detalhes pedido de compra
router.get('/pedido-compra/:id', (req, res) => {
  const pedido = db.prepare(`
    SELECT pc.*, f.razao_social as fornecedor_nome
    FROM pedidos_compra pc LEFT JOIN fornecedores f ON pc.fornecedor_id = f.id WHERE pc.id = ?
  `).get(req.params.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
  pedido.itens = db.prepare(`
    SELECT ipc.*, p.nome as produto_nome, p.codigo_barras, p.unidade
    FROM itens_pedido_compra ipc JOIN produtos p ON ipc.produto_id = p.id WHERE ipc.pedido_id = ?
  `).all(req.params.id);
  res.json(pedido);
});

// ============ CÓDIGO DE BARRAS ============

// Gerar código de barras EAN-13 interno
router.post('/gerar-codigo-barras', (req, res) => {
  const { produto_id } = req.body;
  if (!produto_id) return res.status(400).json({ error: 'Produto é obrigatório' });

  const produto = db.prepare('SELECT * FROM produtos WHERE id = ?').get(produto_id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
  if (produto.codigo_barras) return res.status(400).json({ error: 'Produto já possui código de barras' });

  const prefixo = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'codigo_barras_prefixo'").get();
  const proximo = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'codigo_barras_proximo'").get();

  const prefix = (prefixo && prefixo.valor) || '789';
  let seq = Number((proximo && proximo.valor) || '1');

  // Gerar EAN-13: prefixo (3) + sequencial (9) + dígito verificador (1)
  const base = prefix + seq.toString().padStart(9, '0');
  const digito = calcEan13Check(base);
  const codigoBarras = base + digito;

  // Atualizar produto e incrementar sequencial
  db.prepare('UPDATE produtos SET codigo_barras = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(codigoBarras, produto_id);
  db.prepare("UPDATE configuracoes SET valor = ? WHERE chave = 'codigo_barras_proximo'").run(String(seq + 1));

  registrarLog(null, null, 'gerar_codigo_barras', 'estoque', produto.nome + ': ' + codigoBarras, req.ip);
  res.json({ codigo_barras: codigoBarras, message: 'Código de barras gerado' });
});

// Gerar em lote
router.post('/gerar-codigo-barras-lote', (req, res) => {
  const produtos = db.prepare("SELECT id, nome FROM produtos WHERE ativo = 1 AND (codigo_barras IS NULL OR codigo_barras = '') ORDER BY nome").all();
  if (!produtos.length) return res.json({ gerados: 0, message: 'Todos os produtos já possuem código de barras' });

  const prefixo = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'codigo_barras_prefixo'").get();
  const proximo = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'codigo_barras_proximo'").get();
  const prefix = (prefixo && prefixo.valor) || '789';
  let seq = Number((proximo && proximo.valor) || '1');

  const transaction = db.transaction(() => {
    let count = 0;
    for (const p of produtos) {
      const base = prefix + seq.toString().padStart(9, '0');
      const digito = calcEan13Check(base);
      const codigo = base + digito;
      db.prepare('UPDATE produtos SET codigo_barras = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?').run(codigo, p.id);
      seq++; count++;
    }
    db.prepare("UPDATE configuracoes SET valor = ? WHERE chave = 'codigo_barras_proximo'").run(String(seq));
    return count;
  });

  const gerados = transaction();
  registrarLog(null, null, 'gerar_codigo_barras_lote', 'estoque', gerados + ' codigos gerados', req.ip);
  res.json({ gerados, message: gerados + ' códigos de barras gerados' });
});

// Produtos sem código de barras
router.get('/sem-codigo-barras', (req, res) => {
  const produtos = db.prepare(`
    SELECT id, nome, preco_venda, estoque_atual, unidade
    FROM produtos WHERE ativo = 1 AND (codigo_barras IS NULL OR codigo_barras = '') ORDER BY nome
  `).all();
  res.json(produtos);
});

// Gerar dados para etiqueta
router.get('/etiqueta/:id', (req, res) => {
  const produto = db.prepare('SELECT id, nome, codigo_barras, preco_venda, unidade FROM produtos WHERE id = ?').get(req.params.id);
  if (!produto) return res.status(404).json({ error: 'Produto não encontrado' });
  const empresa = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'empresa_nome_fantasia'").get();
  res.json({ ...produto, empresa: (empresa && empresa.valor) || 'Meu Comercio' });
});

// ============ CONTROLE DE LOTES ============

// Listar lotes de um produto
router.get('/lotes/:produtoId', (req, res) => {
  const lotes = db.prepare(`
    SELECT l.*, f.razao_social as fornecedor_nome,
           CASE WHEN l.data_validade < date('now') THEN 'vencido'
                WHEN l.data_validade <= date('now', '+30 days') THEN 'proximo'
                ELSE 'ok' END as status_validade,
           CAST(julianday(l.data_validade) - julianday('now') AS INTEGER) as dias_restantes
    FROM lotes l
    LEFT JOIN fornecedores f ON l.fornecedor_id = f.id
    WHERE l.produto_id = ? AND l.quantidade > 0
    ORDER BY l.data_validade ASC
  `).all(req.params.produtoId);
  res.json(lotes);
});

// Criar lote manual
router.post('/lotes', (req, res) => {
  const { produto_id, numero_lote, data_fabricacao, data_validade, quantidade, custo_unitario, fornecedor_id, usuario } = req.body;
  if (!produto_id || !data_validade) return res.status(400).json({ error: 'Produto e data de validade são obrigatórios' });

  const result = db.prepare(`
    INSERT INTO lotes (produto_id, numero_lote, data_fabricacao, data_validade, quantidade, custo_unitario, fornecedor_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(produto_id, numero_lote || null, data_fabricacao || null, data_validade, quantidade || 0, custo_unitario || 0, fornecedor_id || null);

  registrarLog(null, usuario, 'cadastrar_lote', 'estoque', 'Lote ' + (numero_lote || '#' + result.lastInsertRowid) + ' criado', req.ip);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Lote cadastrado' });
});

// Rastreabilidade: histórico completo de um lote
router.get('/lote-rastreio/:loteId', (req, res) => {
  const lote = db.prepare(`
    SELECT l.*, p.nome as produto_nome, p.codigo_barras, f.razao_social as fornecedor_nome, ne.numero_nota
    FROM lotes l
    JOIN produtos p ON l.produto_id = p.id
    LEFT JOIN fornecedores f ON l.fornecedor_id = f.id
    LEFT JOIN notas_entrada ne ON l.nota_entrada_id = ne.id
    WHERE l.id = ?
  `).get(req.params.loteId);
  if (!lote) return res.status(404).json({ error: 'Lote não encontrado' });

  // Buscar vendas que usaram este lote
  const vendas = db.prepare(`
    SELECT iv.*, v.numero_venda, v.criado_em as data_venda
    FROM itens_venda iv
    JOIN vendas v ON iv.venda_id = v.id
    WHERE iv.lote_id = ?
    ORDER BY v.criado_em DESC
  `).all(req.params.loteId);

  res.json({ ...lote, vendas });
});

// Enviar alerta manual
router.post('/enviar-alerta', (req, res) => {
  const { dbWrapper } = require('../models/database');
  dbWrapper._verificarAlertas().then(() => {
    res.json({ message: 'Alerta enviado (se houver produtos com estoque baixo)' });
  }).catch(e => {
    res.status(500).json({ error: e.message });
  });
});

// Calcular dígito verificador EAN-13
function calcEan13Check(code12) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(code12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

module.exports = router;
