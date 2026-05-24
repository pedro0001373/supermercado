const express = require('express');
const router = express.Router();
const db = require('../models/db');
const v = require('../middleware/validators');

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function atualizarStatusVencidas() {
  const hoje = hojeISO();
  db.prepare("UPDATE contas_pagar SET status = 'atrasado' WHERE status = 'aberto' AND vencimento < ?").run(hoje);
  db.prepare("UPDATE contas_receber SET status = 'atrasado' WHERE status = 'aberto' AND vencimento < ?").run(hoje);
}

function csvEscape(valor) {
  if (valor == null) return '';
  const s = String(valor);
  if (/[";,\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

router.get('/contas-pagar', (req, res, next) => {
  try {
    atualizarStatusVencidas();
    const { status, inicio, fim, fornecedor_id, page = 1, limit = 25 } = req.query;
    let sql = `SELECT cp.*, f.razao_social as fornecedor_nome
               FROM contas_pagar cp
               LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
               WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND cp.status = ?'; params.push(status); }
    if (inicio) { sql += ' AND cp.vencimento >= ?'; params.push(inicio); }
    if (fim) { sql += ' AND cp.vencimento <= ?'; params.push(fim); }
    if (fornecedor_id) { sql += ' AND cp.fornecedor_id = ?'; params.push(fornecedor_id); }

    const countSql = sql.replace(/SELECT[\s\S]+?FROM/, 'SELECT COUNT(*) as total FROM').replace(/LEFT JOIN[\s\S]+?ON cp\.fornecedor_id = f\.id/, '');
    const total = db.prepare(countSql).get(...params).total;

    const lim = Math.min(Number(limit) || 25, 200);
    const pg = Math.max(Number(page) || 1, 1);
    sql += ' ORDER BY cp.vencimento ASC LIMIT ? OFFSET ?';
    params.push(lim, (pg - 1) * lim);

    const dados = db.prepare(sql).all(...params);
    res.json({ dados, total, page: pg, pages: Math.ceil(total / lim) });
  } catch (e) { next(e); }
});

router.get('/contas-pagar/resumo', (req, res, next) => {
  try {
    atualizarStatusVencidas();
    const hoje = hojeISO();
    const em7 = new Date(); em7.setDate(em7.getDate() + 7);
    const em7ISO = em7.toISOString().slice(0, 10);

    const vencidas = db.prepare("SELECT COUNT(*) as qtd, COALESCE(SUM(valor),0) as total FROM contas_pagar WHERE status = 'atrasado'").get();
    const vencem7 = db.prepare("SELECT COUNT(*) as qtd, COALESCE(SUM(valor),0) as total FROM contas_pagar WHERE status = 'aberto' AND vencimento BETWEEN ? AND ?").get(hoje, em7ISO);
    const abertas = db.prepare("SELECT COUNT(*) as qtd, COALESCE(SUM(valor),0) as total FROM contas_pagar WHERE status IN ('aberto','atrasado')").get();
    res.json({ vencidas, vencem_7_dias: vencem7, abertas });
  } catch (e) { next(e); }
});

router.get('/contas-pagar/:id', (req, res, next) => {
  try {
    const conta = db.prepare(`SELECT cp.*, f.razao_social as fornecedor_nome
                              FROM contas_pagar cp
                              LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
                              WHERE cp.id = ?`).get(req.params.id);
    if (!conta) return res.status(404).json({ error: 'Conta nao encontrada' });
    res.json(conta);
  } catch (e) { next(e); }
});

router.post('/contas-pagar', (req, res, next) => {
  try {
    v.req(req.body, ['descricao', 'valor', 'vencimento']);
    v.strLen(req.body.descricao, 'descricao', 2, 200);
    const valor = v.num(req.body.valor, 'valor', { obrigatorio: true, min: 0.01 });
    v.data(req.body.vencimento, 'vencimento', { obrigatorio: true });

    const b = req.body;
    const result = db.prepare(`INSERT INTO contas_pagar (descricao, fornecedor_id, categoria, valor, vencimento, status, observacoes)
                               VALUES (?, ?, ?, ?, ?, 'aberto', ?)`)
      .run(b.descricao.trim(), b.fornecedor_id || null, b.categoria || null, valor, b.vencimento, b.observacoes || null);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Conta a pagar cadastrada' });
  } catch (e) { next(e); }
});

router.put('/contas-pagar/:id', (req, res, next) => {
  try {
    v.req(req.body, ['descricao', 'valor', 'vencimento']);
    v.strLen(req.body.descricao, 'descricao', 2, 200);
    const valor = v.num(req.body.valor, 'valor', { obrigatorio: true, min: 0.01 });
    v.data(req.body.vencimento, 'vencimento', { obrigatorio: true });

    const b = req.body;
    const info = db.prepare(`UPDATE contas_pagar SET descricao=?, fornecedor_id=?, categoria=?, valor=?, vencimento=?, observacoes=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=?`)
      .run(b.descricao.trim(), b.fornecedor_id || null, b.categoria || null, valor, b.vencimento, b.observacoes || null, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Conta nao encontrada' });
    res.json({ message: 'Conta atualizada' });
  } catch (e) { next(e); }
});

router.post('/contas-pagar/:id/pagar', (req, res, next) => {
  try {
    const conta = db.prepare('SELECT * FROM contas_pagar WHERE id = ?').get(req.params.id);
    if (!conta) return res.status(404).json({ error: 'Conta nao encontrada' });
    if (conta.status === 'pago') return res.status(400).json({ error: 'Conta ja foi paga' });

    const data = req.body.data_pagamento || hojeISO();
    v.data(data, 'data_pagamento');
    if (req.body.forma_pagamento) v.oneOf(req.body.forma_pagamento, 'forma_pagamento', ['dinheiro', 'cartao_debito', 'cartao_credito', 'pix', 'boleto', 'transferencia']);

    db.prepare("UPDATE contas_pagar SET status='pago', data_pagamento=?, forma_pagamento=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=?")
      .run(data, req.body.forma_pagamento || null, req.params.id);
    res.json({ message: 'Pagamento registrado' });
  } catch (e) { next(e); }
});

router.delete('/contas-pagar/:id', (req, res, next) => {
  try {
    const info = db.prepare('DELETE FROM contas_pagar WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Conta nao encontrada' });
    res.json({ message: 'Conta excluida' });
  } catch (e) { next(e); }
});

router.get('/contas-receber', (req, res, next) => {
  try {
    atualizarStatusVencidas();
    const { status, inicio, fim, cliente_id, page = 1, limit = 25 } = req.query;
    let sql = `SELECT cr.*, c.nome as cliente_nome, v.numero_venda
               FROM contas_receber cr
               LEFT JOIN clientes c ON cr.cliente_id = c.id
               LEFT JOIN vendas v ON cr.venda_id = v.id
               WHERE 1=1`;
    const params = [];
    if (status) { sql += ' AND cr.status = ?'; params.push(status); }
    if (inicio) { sql += ' AND cr.vencimento >= ?'; params.push(inicio); }
    if (fim) { sql += ' AND cr.vencimento <= ?'; params.push(fim); }
    if (cliente_id) { sql += ' AND cr.cliente_id = ?'; params.push(cliente_id); }

    const total = db.prepare('SELECT COUNT(*) as total FROM contas_receber cr WHERE 1=1' +
      (status ? ' AND cr.status = ?' : '') +
      (inicio ? ' AND cr.vencimento >= ?' : '') +
      (fim ? ' AND cr.vencimento <= ?' : '') +
      (cliente_id ? ' AND cr.cliente_id = ?' : '')
    ).get(...params).total;

    const lim = Math.min(Number(limit) || 25, 200);
    const pg = Math.max(Number(page) || 1, 1);
    sql += ' ORDER BY cr.vencimento ASC LIMIT ? OFFSET ?';
    params.push(lim, (pg - 1) * lim);

    const dados = db.prepare(sql).all(...params);
    res.json({ dados, total, page: pg, pages: Math.ceil(total / lim) });
  } catch (e) { next(e); }
});

router.get('/contas-receber/resumo', (req, res, next) => {
  try {
    atualizarStatusVencidas();
    const hoje = hojeISO();
    const em3 = new Date(); em3.setDate(em3.getDate() + 3);
    const em3ISO = em3.toISOString().slice(0, 10);

    const vencidas = db.prepare("SELECT COUNT(*) as qtd, COALESCE(SUM(valor),0) as total FROM contas_receber WHERE status = 'atrasado'").get();
    const vencem3 = db.prepare("SELECT COUNT(*) as qtd, COALESCE(SUM(valor),0) as total FROM contas_receber WHERE status = 'aberto' AND vencimento BETWEEN ? AND ?").get(hoje, em3ISO);
    const abertas = db.prepare("SELECT COUNT(*) as qtd, COALESCE(SUM(valor),0) as total FROM contas_receber WHERE status IN ('aberto','atrasado')").get();
    res.json({ vencidas, vencem_3_dias: vencem3, abertas });
  } catch (e) { next(e); }
});

router.get('/contas-receber/:id', (req, res, next) => {
  try {
    const conta = db.prepare(`SELECT cr.*, c.nome as cliente_nome, v.numero_venda
                              FROM contas_receber cr
                              LEFT JOIN clientes c ON cr.cliente_id = c.id
                              LEFT JOIN vendas v ON cr.venda_id = v.id
                              WHERE cr.id = ?`).get(req.params.id);
    if (!conta) return res.status(404).json({ error: 'Conta nao encontrada' });
    res.json(conta);
  } catch (e) { next(e); }
});

router.post('/contas-receber', (req, res, next) => {
  try {
    v.req(req.body, ['descricao', 'valor', 'vencimento']);
    v.strLen(req.body.descricao, 'descricao', 2, 200);
    const valor = v.num(req.body.valor, 'valor', { obrigatorio: true, min: 0.01 });
    v.data(req.body.vencimento, 'vencimento', { obrigatorio: true });

    const b = req.body;
    const result = db.prepare(`INSERT INTO contas_receber (descricao, cliente_id, venda_id, valor, vencimento, status, observacoes)
                               VALUES (?, ?, ?, ?, ?, 'aberto', ?)`)
      .run(b.descricao.trim(), b.cliente_id || null, b.venda_id || null, valor, b.vencimento, b.observacoes || null);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Conta a receber cadastrada' });
  } catch (e) { next(e); }
});

router.put('/contas-receber/:id', (req, res, next) => {
  try {
    v.req(req.body, ['descricao', 'valor', 'vencimento']);
    v.strLen(req.body.descricao, 'descricao', 2, 200);
    const valor = v.num(req.body.valor, 'valor', { obrigatorio: true, min: 0.01 });
    v.data(req.body.vencimento, 'vencimento', { obrigatorio: true });

    const b = req.body;
    const info = db.prepare(`UPDATE contas_receber SET descricao=?, cliente_id=?, valor=?, vencimento=?, observacoes=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=?`)
      .run(b.descricao.trim(), b.cliente_id || null, valor, b.vencimento, b.observacoes || null, req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Conta nao encontrada' });
    res.json({ message: 'Conta atualizada' });
  } catch (e) { next(e); }
});

router.post('/contas-receber/:id/receber', (req, res, next) => {
  try {
    const conta = db.prepare('SELECT * FROM contas_receber WHERE id = ?').get(req.params.id);
    if (!conta) return res.status(404).json({ error: 'Conta nao encontrada' });
    if (conta.status === 'recebido') return res.status(400).json({ error: 'Conta ja foi recebida' });

    const data = req.body.data_recebimento || hojeISO();
    v.data(data, 'data_recebimento');
    if (req.body.forma_recebimento) v.oneOf(req.body.forma_recebimento, 'forma_recebimento', ['dinheiro', 'cartao_debito', 'cartao_credito', 'pix', 'boleto', 'transferencia']);

    db.prepare("UPDATE contas_receber SET status='recebido', data_recebimento=?, forma_recebimento=?, atualizado_em=CURRENT_TIMESTAMP WHERE id=?")
      .run(data, req.body.forma_recebimento || null, req.params.id);
    res.json({ message: 'Recebimento registrado' });
  } catch (e) { next(e); }
});

router.delete('/contas-receber/:id', (req, res, next) => {
  try {
    const info = db.prepare('DELETE FROM contas_receber WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Conta nao encontrada' });
    res.json({ message: 'Conta excluida' });
  } catch (e) { next(e); }
});

function calcularFluxo(inicio, fim, agrupamento) {
  const group = agrupamento === 'mensal' ? "strftime('%Y-%m', criado_em)" : "date(criado_em)";
  const groupCol = agrupamento === 'mensal' ? "strftime('%Y-%m', data_pagamento)" : "date(data_pagamento)";
  const groupColR = agrupamento === 'mensal' ? "strftime('%Y-%m', data_recebimento)" : "date(data_recebimento)";

  const vendas = db.prepare(
    `SELECT ${group} as periodo, COALESCE(SUM(total),0) as total
     FROM vendas WHERE status='finalizada' AND date(criado_em) BETWEEN ? AND ?
     GROUP BY periodo`
  ).all(inicio, fim);

  const recebimentos = db.prepare(
    `SELECT ${groupColR} as periodo, COALESCE(SUM(valor),0) as total
     FROM contas_receber WHERE status='recebido' AND data_recebimento BETWEEN ? AND ?
     GROUP BY periodo`
  ).all(inicio, fim);

  const pagamentos = db.prepare(
    `SELECT ${groupCol} as periodo, COALESCE(SUM(valor),0) as total
     FROM contas_pagar WHERE status='pago' AND data_pagamento BETWEEN ? AND ?
     GROUP BY periodo`
  ).all(inicio, fim);

  const periodos = new Set();
  vendas.forEach(r => periodos.add(r.periodo));
  recebimentos.forEach(r => periodos.add(r.periodo));
  pagamentos.forEach(r => periodos.add(r.periodo));

  const mapa = {};
  periodos.forEach(p => { mapa[p] = { periodo: p, vendas: 0, recebimentos: 0, pagamentos: 0 }; });
  vendas.forEach(r => { mapa[r.periodo].vendas = r.total; });
  recebimentos.forEach(r => { mapa[r.periodo].recebimentos = r.total; });
  pagamentos.forEach(r => { mapa[r.periodo].pagamentos = r.total; });

  const lista = Object.values(mapa).sort((a, b) => a.periodo.localeCompare(b.periodo));

  let saldo = 0;
  const final = lista.map(d => {
    const entradas = (d.vendas || 0) + (d.recebimentos || 0);
    const saidas = d.pagamentos || 0;
    saldo += entradas - saidas;
    return { ...d, entradas, saidas, saldo_acumulado: Number(saldo.toFixed(2)) };
  });

  const totais = {
    entradas: final.reduce((s, d) => s + d.entradas, 0),
    saidas: final.reduce((s, d) => s + d.saidas, 0),
    saldo: final.length ? final[final.length - 1].saldo_acumulado : 0,
  };
  totais.entradas = Number(totais.entradas.toFixed(2));
  totais.saidas = Number(totais.saidas.toFixed(2));

  return { linhas: final, totais };
}

function normalizarAgrupamentoFinanceiro(valor) {
  return valor === 'mensal' || valor === 'mes' ? 'mensal' : 'diario';
}

router.get('/fluxo-caixa', (req, res, next) => {
  try {
    const agrupamento = normalizarAgrupamentoFinanceiro(req.query.agrupamento || req.query.agrupar);
    const inicio = req.query.inicio || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const fim = req.query.fim || hojeISO();
    v.data(inicio, 'inicio'); v.data(fim, 'fim');
    const fluxo = calcularFluxo(inicio, fim, agrupamento);
    res.json({ ...fluxo, dados: fluxo.linhas });
  } catch (e) { next(e); }
});

router.get('/fluxo-caixa/csv', (req, res, next) => {
  try {
    const agrupamento = normalizarAgrupamentoFinanceiro(req.query.agrupamento || req.query.agrupar);
    const inicio = req.query.inicio || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const fim = req.query.fim || hojeISO();
    const { linhas, totais } = calcularFluxo(inicio, fim, agrupamento);

    const header = ['Periodo', 'Vendas', 'Recebimentos', 'Entradas', 'Pagamentos', 'Saidas', 'Saldo Acumulado'];
    const lines = [header.join(';')];
    linhas.forEach(l => {
      lines.push([l.periodo, l.vendas, l.recebimentos, l.entradas, l.pagamentos, l.saidas, l.saldo_acumulado].map(csvEscape).join(';'));
    });
    lines.push('');
    lines.push(['TOTAL', '', '', totais.entradas, '', totais.saidas, totais.saldo].map(csvEscape).join(';'));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="fluxo_caixa_${inicio}_a_${fim}.csv"`);
    res.send('\uFEFF' + lines.join('\r\n'));
  } catch (e) { next(e); }
});

router.get('/relatorios/despesas-por-categoria', (req, res, next) => {
  try {
    const ano = req.query.ano;
    const inicio = req.query.inicio || (ano ? ano + '-01-01' : new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10));
    const fim = req.query.fim || (ano ? ano + '-12-31' : hojeISO());
    const dados = db.prepare(`
      SELECT COALESCE(categoria, 'Sem categoria') as categoria, COUNT(*) as qtd, SUM(valor) as total
      FROM contas_pagar
      WHERE status = 'pago' AND data_pagamento BETWEEN ? AND ?
      GROUP BY categoria ORDER BY total DESC
    `).all(inicio, fim);
    res.json({ inicio, fim, dados });
  } catch (e) { next(e); }
});

router.get('/relatorios/faturamento-mensal', (req, res, next) => {
  try {
    const ano = req.query.ano;
    const meses = Number(req.query.meses) || 12;
    if (ano) {
      const dadosAno = db.prepare(`
        SELECT strftime('%Y-%m', criado_em) as mes,
               COUNT(*) as qtd,
               COALESCE(SUM(total),0) as total,
               COALESCE(SUM(total),0) as faturamento,
               CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(total),0) / COUNT(*) ELSE 0 END as ticket_medio
        FROM vendas
        WHERE status = 'finalizada'
          AND strftime('%Y', criado_em) = ?
        GROUP BY mes ORDER BY mes
      `).all(ano);
      return res.json({ ano, dados: dadosAno });
    }
    const dados = db.prepare(`
      SELECT strftime('%Y-%m', criado_em) as mes,
             COUNT(*) as qtd,
             COALESCE(SUM(total),0) as total,
             COALESCE(SUM(total),0) as faturamento,
             CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(total),0) / COUNT(*) ELSE 0 END as ticket_medio
      FROM vendas
      WHERE status = 'finalizada'
        AND date(criado_em) >= date('now', ?)
      GROUP BY mes ORDER BY mes
    `).all('-' + meses + ' months');
    res.json({ meses, dados });
  } catch (e) { next(e); }
});

router.get('/relatorios/resumo-anual', (req, res, next) => {
  try {
    const ano = req.query.ano || String(new Date().getFullYear());
    const vendas = db.prepare(`SELECT COUNT(*) as qtd, COALESCE(SUM(total),0) as total FROM vendas WHERE status='finalizada' AND strftime('%Y', criado_em) = ?`).get(ano);
    const pagamentos = db.prepare(`SELECT COUNT(*) as qtd, COALESCE(SUM(valor),0) as total FROM contas_pagar WHERE status='pago' AND strftime('%Y', data_pagamento) = ?`).get(ano);
    const recebimentos = db.prepare(`SELECT COUNT(*) as qtd, COALESCE(SUM(valor),0) as total FROM contas_receber WHERE status='recebido' AND strftime('%Y', data_recebimento) = ?`).get(ano);
    const ticket_medio = vendas.qtd > 0 ? vendas.total / vendas.qtd : 0;
    res.json({
      ano,
      vendas,
      pagamentos,
      recebimentos,
      lucro_bruto: Number((vendas.total + recebimentos.total - pagamentos.total).toFixed(2)),
      ticket_medio: Number(ticket_medio.toFixed(2)),
    });
  } catch (e) { next(e); }
});

module.exports = router;
