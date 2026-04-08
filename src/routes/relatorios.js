const express = require('express');
const router = express.Router();
const db = require('../models/db');

// Dashboard - resumo geral
router.get('/dashboard', (req, res) => {
  const hoje = new Date().toISOString().split('T')[0];

  const vendasHoje = db.prepare(`SELECT COUNT(*) as qtd, COALESCE(SUM(total),0) as total FROM vendas WHERE date(criado_em) = ? AND status = 'finalizada'`).get(hoje);
  const vendasMes = db.prepare(`SELECT COUNT(*) as qtd, COALESCE(SUM(total),0) as total FROM vendas WHERE strftime('%Y-%m', criado_em) = strftime('%Y-%m', 'now') AND status = 'finalizada'`).get();
  const totalProdutos = db.prepare(`SELECT COUNT(*) as total FROM produtos WHERE ativo = 1`).get();
  const estoqueBaixo = db.prepare(`SELECT COUNT(*) as total FROM produtos WHERE ativo = 1 AND estoque_atual <= estoque_minimo AND estoque_minimo > 0`).get();
  const vencendo = db.prepare(`SELECT COUNT(*) as total FROM lotes WHERE quantidade > 0 AND data_validade <= date('now', '+30 days') AND data_validade >= date('now')`).get();
  const vencidos = db.prepare(`SELECT COUNT(*) as total FROM lotes WHERE quantidade > 0 AND data_validade < date('now')`).get();

  // Vendas por hora (hoje)
  const vendasPorHora = db.prepare(`
    SELECT strftime('%H', criado_em) as hora, COUNT(*) as qtd, SUM(total) as total
    FROM vendas WHERE date(criado_em) = ? AND status = 'finalizada'
    GROUP BY strftime('%H', criado_em) ORDER BY hora
  `).all(hoje);

  // Vendas últimos 7 dias
  const vendas7dias = db.prepare(`
    SELECT date(criado_em) as dia, COUNT(*) as qtd, SUM(total) as total
    FROM vendas WHERE criado_em >= date('now', '-7 days') AND status = 'finalizada'
    GROUP BY date(criado_em) ORDER BY dia
  `).all();

  // Top 10 produtos mais vendidos (mês)
  const topProdutos = db.prepare(`
    SELECT iv.nome_produto, SUM(iv.quantidade) as qtd_vendida, SUM(iv.subtotal) as total_vendido
    FROM itens_venda iv
    JOIN vendas v ON iv.venda_id = v.id
    WHERE strftime('%Y-%m', v.criado_em) = strftime('%Y-%m', 'now') AND v.status = 'finalizada'
    GROUP BY iv.produto_id ORDER BY qtd_vendida DESC LIMIT 10
  `).all();

  // Formas de pagamento (mês)
  const formasPagamento = db.prepare(`
    SELECT forma_pagamento, COUNT(*) as qtd, SUM(valor - troco) as total
    FROM pagamentos p JOIN vendas v ON p.venda_id = v.id
    WHERE strftime('%Y-%m', v.criado_em) = strftime('%Y-%m', 'now') AND v.status = 'finalizada'
    GROUP BY forma_pagamento
  `).all();

  res.json({
    vendas_hoje: vendasHoje,
    vendas_mes: vendasMes,
    total_produtos: totalProdutos.total,
    estoque_baixo: estoqueBaixo.total,
    produtos_vencendo: vencendo.total,
    produtos_vencidos: vencidos.total,
    vendas_por_hora: vendasPorHora,
    vendas_7_dias: vendas7dias,
    top_produtos: topProdutos,
    formas_pagamento: formasPagamento
  });
});

// Relatório de vendas por período
router.get('/vendas', (req, res) => {
  const { data_inicio, data_fim, agrupamento = 'dia' } = req.query;
  let groupBy = "date(v.criado_em)";
  if (agrupamento === 'mes') groupBy = "strftime('%Y-%m', v.criado_em)";
  if (agrupamento === 'hora') groupBy = "strftime('%Y-%m-%d %H', v.criado_em)";

  let sql = `
    SELECT ${groupBy} as periodo, COUNT(*) as qtd_vendas, SUM(v.total) as total_vendas,
           SUM(v.desconto) as total_descontos, AVG(v.total) as ticket_medio
    FROM vendas v WHERE v.status = 'finalizada'
  `;
  const params = [];
  if (data_inicio) { sql += ` AND v.criado_em >= ?`; params.push(data_inicio); }
  if (data_fim) { sql += ` AND v.criado_em <= ?`; params.push(data_fim + ' 23:59:59'); }
  sql += ` GROUP BY ${groupBy} ORDER BY periodo`;

  res.json(db.prepare(sql).all(...params));
});

// Relatório de estoque
router.get('/estoque', (req, res) => {
  const produtos = db.prepare(`
    SELECT p.*, c.nome as categoria_nome,
           ROUND(p.estoque_atual * p.preco_custo, 2) as valor_estoque_custo,
           ROUND(p.estoque_atual * p.preco_venda, 2) as valor_estoque_venda
    FROM produtos p
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE p.ativo = 1
    ORDER BY p.nome
  `).all();

  const totalCusto = produtos.reduce((acc, p) => acc + (p.valor_estoque_custo || 0), 0);
  const totalVenda = produtos.reduce((acc, p) => acc + (p.valor_estoque_venda || 0), 0);

  res.json({ produtos, total_custo: totalCusto, total_venda: totalVenda });
});

// Relatório de produtos mais vendidos
router.get('/produtos-mais-vendidos', (req, res) => {
  const { data_inicio, data_fim, limit = 20 } = req.query;
  let sql = `
    SELECT iv.produto_id, iv.nome_produto, p.codigo_barras, c.nome as categoria,
           SUM(iv.quantidade) as qtd_vendida, SUM(iv.subtotal) as total_vendido,
           AVG(iv.preco_unitario) as preco_medio
    FROM itens_venda iv
    JOIN vendas v ON iv.venda_id = v.id
    JOIN produtos p ON iv.produto_id = p.id
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE v.status = 'finalizada'
  `;
  const params = [];
  if (data_inicio) { sql += ` AND v.criado_em >= ?`; params.push(data_inicio); }
  if (data_fim) { sql += ` AND v.criado_em <= ?`; params.push(data_fim + ' 23:59:59'); }
  sql += ` GROUP BY iv.produto_id ORDER BY qtd_vendida DESC LIMIT ?`;
  params.push(Number(limit));

  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
