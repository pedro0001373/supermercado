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

// Margem de lucro por produto
router.get('/margem-lucro', (req, res) => {
  const { data_inicio, data_fim, categoria_id } = req.query;
  let sql = `
    SELECT iv.produto_id, iv.nome_produto, p.codigo_barras, p.preco_custo, p.preco_venda,
           c.nome as categoria,
           SUM(iv.quantidade) as qtd_vendida,
           SUM(iv.subtotal) as receita_total,
           SUM(iv.quantidade * p.preco_custo) as custo_total,
           SUM(iv.subtotal) - SUM(iv.quantidade * p.preco_custo) as lucro_total,
           CASE WHEN SUM(iv.subtotal) > 0
             THEN ROUND((SUM(iv.subtotal) - SUM(iv.quantidade * p.preco_custo)) / SUM(iv.subtotal) * 100, 2)
             ELSE 0 END as margem_pct
    FROM itens_venda iv
    JOIN vendas v ON iv.venda_id = v.id
    JOIN produtos p ON iv.produto_id = p.id
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE v.status = 'finalizada' AND iv.cancelado = 0
  `;
  const params = [];
  if (data_inicio) { sql += ` AND v.criado_em >= ?`; params.push(data_inicio); }
  if (data_fim) { sql += ` AND v.criado_em <= ?`; params.push(data_fim + ' 23:59:59'); }
  if (categoria_id) { sql += ` AND p.categoria_id = ?`; params.push(categoria_id); }
  sql += ` GROUP BY iv.produto_id ORDER BY lucro_total DESC`;

  const produtos = db.prepare(sql).all(...params);
  const totais = produtos.reduce((acc, p) => ({
    receita: acc.receita + (p.receita_total || 0),
    custo: acc.custo + (p.custo_total || 0),
    lucro: acc.lucro + (p.lucro_total || 0)
  }), { receita: 0, custo: 0, lucro: 0 });
  totais.margem_pct = totais.receita > 0 ? Math.round((totais.lucro / totais.receita) * 10000) / 100 : 0;

  res.json({ produtos, totais });
});

// Margem por categoria
router.get('/margem-categoria', (req, res) => {
  const { data_inicio, data_fim } = req.query;
  let sql = `
    SELECT COALESCE(c.nome, 'Sem Categoria') as categoria, c.id as categoria_id,
           COUNT(DISTINCT iv.produto_id) as qtd_produtos,
           SUM(iv.quantidade) as qtd_vendida,
           SUM(iv.subtotal) as receita_total,
           SUM(iv.quantidade * p.preco_custo) as custo_total,
           SUM(iv.subtotal) - SUM(iv.quantidade * p.preco_custo) as lucro_total,
           CASE WHEN SUM(iv.subtotal) > 0
             THEN ROUND((SUM(iv.subtotal) - SUM(iv.quantidade * p.preco_custo)) / SUM(iv.subtotal) * 100, 2)
             ELSE 0 END as margem_pct
    FROM itens_venda iv
    JOIN vendas v ON iv.venda_id = v.id
    JOIN produtos p ON iv.produto_id = p.id
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE v.status = 'finalizada' AND iv.cancelado = 0
  `;
  const params = [];
  if (data_inicio) { sql += ` AND v.criado_em >= ?`; params.push(data_inicio); }
  if (data_fim) { sql += ` AND v.criado_em <= ?`; params.push(data_fim + ' 23:59:59'); }
  sql += ` GROUP BY c.id ORDER BY lucro_total DESC`;
  res.json(db.prepare(sql).all(...params));
});

// Curva ABC
router.get('/curva-abc', (req, res) => {
  const { data_inicio, data_fim } = req.query;
  let sql = `
    SELECT iv.produto_id, iv.nome_produto, p.codigo_barras,
           SUM(iv.subtotal) as total_vendido,
           SUM(iv.quantidade) as qtd_vendida
    FROM itens_venda iv
    JOIN vendas v ON iv.venda_id = v.id
    JOIN produtos p ON iv.produto_id = p.id
    WHERE v.status = 'finalizada' AND iv.cancelado = 0
  `;
  const params = [];
  if (data_inicio) { sql += ` AND v.criado_em >= ?`; params.push(data_inicio); }
  if (data_fim) { sql += ` AND v.criado_em <= ?`; params.push(data_fim + ' 23:59:59'); }
  sql += ` GROUP BY iv.produto_id ORDER BY total_vendido DESC`;

  const produtos = db.prepare(sql).all(...params);
  const totalGeral = produtos.reduce((a, p) => a + (p.total_vendido || 0), 0);
  let acumulado = 0;
  const resultado = produtos.map((p, i) => {
    acumulado += p.total_vendido || 0;
    const pctAcumulado = totalGeral > 0 ? Math.round(acumulado / totalGeral * 10000) / 100 : 0;
    const classe = pctAcumulado <= 80 ? 'A' : pctAcumulado <= 95 ? 'B' : 'C';
    return { ...p, posicao: i + 1, pct_individual: totalGeral > 0 ? Math.round(p.total_vendido / totalGeral * 10000) / 100 : 0, pct_acumulado: pctAcumulado, classe };
  });

  const resumo = {
    A: resultado.filter(r => r.classe === 'A').length,
    B: resultado.filter(r => r.classe === 'B').length,
    C: resultado.filter(r => r.classe === 'C').length,
    total_geral: totalGeral
  };
  res.json({ produtos: resultado, resumo });
});

// Comparativo mensal
router.get('/comparativo-mensal', (req, res) => {
  const meses = db.prepare(`
    SELECT strftime('%Y-%m', v.criado_em) as mes,
           COUNT(*) as qtd_vendas,
           SUM(v.total) as total_vendas,
           SUM(v.desconto) as total_descontos,
           AVG(v.total) as ticket_medio
    FROM vendas v
    WHERE v.status = 'finalizada' AND v.criado_em >= date('now', '-12 months')
    GROUP BY strftime('%Y-%m', v.criado_em)
    ORDER BY mes
  `).all();
  res.json(meses);
});

// Vendas por dia da semana
router.get('/vendas-dia-semana', (req, res) => {
  const { data_inicio, data_fim } = req.query;
  let sql = `
    SELECT CAST(strftime('%w', v.criado_em) AS INTEGER) as dia_semana,
           COUNT(*) as qtd_vendas,
           SUM(v.total) as total_vendas,
           AVG(v.total) as ticket_medio
    FROM vendas v WHERE v.status = 'finalizada'
  `;
  const params = [];
  if (data_inicio) { sql += ` AND v.criado_em >= ?`; params.push(data_inicio); }
  if (data_fim) { sql += ` AND v.criado_em <= ?`; params.push(data_fim + ' 23:59:59'); }
  sql += ` GROUP BY dia_semana ORDER BY dia_semana`;
  res.json(db.prepare(sql).all(...params));
});

// Vendas por hora do dia
router.get('/vendas-por-hora', (req, res) => {
  const { data_inicio, data_fim } = req.query;
  let sql = `
    SELECT CAST(strftime('%H', v.criado_em) AS INTEGER) as hora,
           COUNT(*) as qtd_vendas,
           SUM(v.total) as total_vendas
    FROM vendas v WHERE v.status = 'finalizada'
  `;
  const params = [];
  if (data_inicio) { sql += ` AND v.criado_em >= ?`; params.push(data_inicio); }
  if (data_fim) { sql += ` AND v.criado_em <= ?`; params.push(data_fim + ' 23:59:59'); }
  sql += ` GROUP BY hora ORDER BY hora`;
  res.json(db.prepare(sql).all(...params));
});

// Relatório de perdas completo (vencimento + avaria + qualquer motivo)
router.get('/perdas-completo', (req, res) => {
  const { data_inicio, data_fim } = req.query;
  let sql = `
    SELECT m.*, p.nome as produto_nome, p.preco_custo, p.preco_venda,
           c.nome as categoria,
           ROUND(m.quantidade * p.preco_custo, 2) as valor_custo_perda,
           ROUND(m.quantidade * p.preco_venda, 2) as valor_venda_perda
    FROM movimentacoes_estoque m
    JOIN produtos p ON m.produto_id = p.id
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE m.tipo = 'perda'
  `;
  const params = [];
  if (data_inicio) { sql += ` AND m.criado_em >= ?`; params.push(data_inicio); }
  if (data_fim) { sql += ` AND m.criado_em <= ?`; params.push(data_fim + ' 23:59:59'); }
  sql += ` ORDER BY m.criado_em DESC`;

  const perdas = db.prepare(sql).all(...params);

  // Agrupar por tipo de perda
  const porTipo = {};
  perdas.forEach(p => {
    const motivo = (p.motivo || 'Outros').toLowerCase();
    const tipo = motivo.includes('venciment') ? 'Vencimento' : motivo.includes('avaria') ? 'Avaria' : motivo.includes('furto') || motivo.includes('roubo') ? 'Furto/Roubo' : 'Outros';
    if (!porTipo[tipo]) porTipo[tipo] = { qtd: 0, valor_custo: 0, valor_venda: 0 };
    porTipo[tipo].qtd += p.quantidade;
    porTipo[tipo].valor_custo += p.valor_custo_perda || 0;
    porTipo[tipo].valor_venda += p.valor_venda_perda || 0;
  });

  // Agrupar por categoria
  const porCategoria = {};
  perdas.forEach(p => {
    const cat = p.categoria || 'Sem Categoria';
    if (!porCategoria[cat]) porCategoria[cat] = { qtd: 0, valor_custo: 0 };
    porCategoria[cat].qtd += p.quantidade;
    porCategoria[cat].valor_custo += p.valor_custo_perda || 0;
  });

  const totalCusto = perdas.reduce((a, p) => a + (p.valor_custo_perda || 0), 0);
  const totalVenda = perdas.reduce((a, p) => a + (p.valor_venda_perda || 0), 0);

  res.json({ perdas, por_tipo: porTipo, por_categoria: porCategoria, total_custo: totalCusto, total_venda: totalVenda });
});

// Fluxo de caixa
router.get('/fluxo-caixa', (req, res) => {
  const { agrupamento = 'dia', data_inicio, data_fim } = req.query;
  let groupBy = "date(criado_em)";
  if (agrupamento === 'semana') groupBy = "strftime('%Y-W%W', criado_em)";
  if (agrupamento === 'mes') groupBy = "strftime('%Y-%m', criado_em)";

  // Entradas (vendas)
  let sqlEntradas = `
    SELECT ${groupBy} as periodo, SUM(total) as total
    FROM vendas WHERE status = 'finalizada'
  `;
  const paramsE = [];
  if (data_inicio) { sqlEntradas += ` AND criado_em >= ?`; paramsE.push(data_inicio); }
  if (data_fim) { sqlEntradas += ` AND criado_em <= ?`; paramsE.push(data_fim + ' 23:59:59'); }
  sqlEntradas += ` GROUP BY periodo ORDER BY periodo`;

  // Saídas (perdas + sangrias)
  let sqlSangrias = `
    SELECT ${groupBy.replace('criado_em', 'mc.criado_em')} as periodo, SUM(mc.valor) as total
    FROM movimentacoes_caixa mc WHERE mc.tipo = 'sangria'
  `;
  const paramsS = [];
  if (data_inicio) { sqlSangrias += ` AND mc.criado_em >= ?`; paramsS.push(data_inicio); }
  if (data_fim) { sqlSangrias += ` AND mc.criado_em <= ?`; paramsS.push(data_fim + ' 23:59:59'); }
  sqlSangrias += ` GROUP BY periodo ORDER BY periodo`;

  // Compras (notas de entrada confirmadas)
  let sqlCompras = `
    SELECT ${groupBy.replace('criado_em', 'ne.data_entrada')} as periodo, SUM(ne.valor_total) as total
    FROM notas_entrada ne WHERE ne.status = 'confirmada'
  `;
  const paramsC = [];
  if (data_inicio) { sqlCompras += ` AND ne.data_entrada >= ?`; paramsC.push(data_inicio); }
  if (data_fim) { sqlCompras += ` AND ne.data_entrada <= ?`; paramsC.push(data_fim); }
  sqlCompras += ` GROUP BY periodo ORDER BY periodo`;

  const entradas = db.prepare(sqlEntradas).all(...paramsE);
  const sangrias = db.prepare(sqlSangrias).all(...paramsS);
  const compras = db.prepare(sqlCompras).all(...paramsC);

  // Consolidar periodos
  const periodos = {};
  entradas.forEach(e => {
    if (!periodos[e.periodo]) periodos[e.periodo] = { periodo: e.periodo, entradas: 0, sangrias: 0, compras: 0 };
    periodos[e.periodo].entradas = e.total || 0;
  });
  sangrias.forEach(s => {
    if (!periodos[s.periodo]) periodos[s.periodo] = { periodo: s.periodo, entradas: 0, sangrias: 0, compras: 0 };
    periodos[s.periodo].sangrias = s.total || 0;
  });
  compras.forEach(c => {
    if (!periodos[c.periodo]) periodos[c.periodo] = { periodo: c.periodo, entradas: 0, sangrias: 0, compras: 0 };
    periodos[c.periodo].compras = c.total || 0;
  });

  const resultado = Object.values(periodos).sort((a, b) => a.periodo.localeCompare(b.periodo)).map(p => ({
    ...p,
    saidas: p.sangrias + p.compras,
    saldo: p.entradas - p.sangrias - p.compras
  }));

  const totalEntradas = resultado.reduce((a, r) => a + r.entradas, 0);
  const totalSaidas = resultado.reduce((a, r) => a + r.saidas, 0);

  res.json({ fluxo: resultado, total_entradas: totalEntradas, total_saidas: totalSaidas, saldo: totalEntradas - totalSaidas });
});

// Exportar dados (CSV genérico)
router.post('/exportar', (req, res) => {
  const { tipo, dados, colunas, titulo } = req.body;
  if (!dados || !dados.length) return res.status(400).json({ error: 'Sem dados para exportar' });

  if (tipo === 'csv') {
    const header = colunas.map(c => c.label).join(';');
    const rows = dados.map(row => colunas.map(c => {
      let val = row[c.key];
      if (val === null || val === undefined) val = '';
      if (typeof val === 'string' && val.includes(';')) val = '"' + val + '"';
      return val;
    }).join(';'));
    const csv = header + '\n' + rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + (titulo || 'relatorio') + '.csv"');
    res.send('\uFEFF' + csv); // BOM for Excel UTF-8
  } else {
    res.status(400).json({ error: 'Tipo não suportado. Use csv.' });
  }
});

module.exports = router;
