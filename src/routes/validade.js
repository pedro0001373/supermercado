const express = require('express');
const router = express.Router();
const db = require('../models/db');

// Produtos próximos do vencimento
router.get('/alertas', (req, res) => {
  const dias = req.query.dias || 30;
  const lotes = db.prepare(`
    SELECT l.*, p.nome as produto_nome, p.codigo_barras, p.preco_venda,
           f.nome_fantasia as fornecedor_nome,
           CAST(julianday(l.data_validade) - julianday('now') AS INTEGER) as dias_restantes
    FROM lotes l
    JOIN produtos p ON l.produto_id = p.id
    LEFT JOIN fornecedores f ON l.fornecedor_id = f.id
    WHERE l.quantidade > 0
      AND l.data_validade <= date('now', '+' || ? || ' days')
    ORDER BY l.data_validade ASC
  `).all(dias);
  res.json(lotes);
});

// Produtos já vencidos
router.get('/vencidos', (req, res) => {
  const lotes = db.prepare(`
    SELECT l.*, p.nome as produto_nome, p.codigo_barras, p.preco_venda, p.preco_custo,
           f.nome_fantasia as fornecedor_nome,
           CAST(julianday('now') - julianday(l.data_validade) AS INTEGER) as dias_vencido
    FROM lotes l
    JOIN produtos p ON l.produto_id = p.id
    LEFT JOIN fornecedores f ON l.fornecedor_id = f.id
    WHERE l.quantidade > 0 AND l.data_validade < date('now')
    ORDER BY l.data_validade ASC
  `).all();
  res.json(lotes);
});

// Sugestões de promoção (vence em até 7 dias)
router.get('/promocoes', (req, res) => {
  const lotes = db.prepare(`
    SELECT l.*, p.nome as produto_nome, p.codigo_barras, p.preco_venda, p.preco_custo,
           CAST(julianday(l.data_validade) - julianday('now') AS INTEGER) as dias_restantes,
           ROUND(p.preco_venda * 0.7, 2) as preco_sugerido
    FROM lotes l
    JOIN produtos p ON l.produto_id = p.id
    WHERE l.quantidade > 0
      AND l.data_validade > date('now')
      AND l.data_validade <= date('now', '+7 days')
    ORDER BY l.data_validade ASC
  `).all();
  res.json(lotes);
});

// Cadastrar lote
router.post('/lotes', (req, res) => {
  const { produto_id, numero_lote, data_fabricacao, data_validade, quantidade, custo_unitario, fornecedor_id, nota_entrada_id } = req.body;
  if (!produto_id || !data_validade) return res.status(400).json({ error: 'Produto e data de validade são obrigatórios' });

  const result = db.prepare(`
    INSERT INTO lotes (produto_id, numero_lote, data_fabricacao, data_validade, quantidade, custo_unitario, fornecedor_id, nota_entrada_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(produto_id, numero_lote, data_fabricacao, data_validade, quantidade || 0, custo_unitario || 0, fornecedor_id, nota_entrada_id);

  res.status(201).json({ id: result.lastInsertRowid, message: 'Lote cadastrado' });
});

// Listar lotes de um produto
router.get('/lotes/:produto_id', (req, res) => {
  const lotes = db.prepare(`
    SELECT l.*, f.nome_fantasia as fornecedor_nome,
           CAST(julianday(l.data_validade) - julianday('now') AS INTEGER) as dias_restantes
    FROM lotes l
    LEFT JOIN fornecedores f ON l.fornecedor_id = f.id
    WHERE l.produto_id = ?
    ORDER BY l.data_validade ASC
  `).all(req.params.produto_id);
  res.json(lotes);
});

// Relatório de perdas por vencimento
router.get('/relatorio-perdas', (req, res) => {
  const { data_inicio, data_fim } = req.query;
  let sql = `
    SELECT m.*, p.nome as produto_nome, p.preco_custo,
           ROUND(m.quantidade * p.preco_custo, 2) as valor_perda
    FROM movimentacoes_estoque m
    JOIN produtos p ON m.produto_id = p.id
    WHERE m.tipo = 'perda' AND m.motivo LIKE '%vencimento%'
  `;
  const params = [];
  if (data_inicio) { sql += ` AND m.criado_em >= ?`; params.push(data_inicio); }
  if (data_fim) { sql += ` AND m.criado_em <= ?`; params.push(data_fim + ' 23:59:59'); }
  sql += ` ORDER BY m.criado_em DESC`;

  const perdas = db.prepare(sql).all(...params);
  const totalPerda = perdas.reduce((acc, p) => acc + (p.valor_perda || 0), 0);
  res.json({ perdas, total_perda: totalPerda });
});

module.exports = router;
