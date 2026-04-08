const express = require('express');
const router = express.Router();
const db = require('../models/db');

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

  res.json({ message: 'Perda registrada', estoque_atual: novoEstoque });
});

module.exports = router;
