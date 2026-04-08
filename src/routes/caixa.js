const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { registrarLog } = require('../middleware/logger');

function wrap(fn) {
  return (req, res, next) => { try { const r = fn(req, res, next); if (r && r.catch) r.catch(e => res.status(500).json({ error: e.message })); } catch (e) { res.status(500).json({ error: e.message }); } };
}

// Caixa aberto atual
router.get('/aberto', wrap((req, res) => {
  const caixa = db.prepare(`SELECT * FROM caixas WHERE status = 'aberto' ORDER BY aberto_em DESC LIMIT 1`).get();
  if (!caixa) return res.json(null);

  const vendas = db.prepare(`SELECT SUM(total) as total FROM vendas WHERE caixa_id = ? AND status = 'finalizada'`).get(caixa.id);
  const sangrias = db.prepare(`SELECT SUM(valor) as total FROM movimentacoes_caixa WHERE caixa_id = ? AND tipo = 'sangria'`).get(caixa.id);
  const suprimentos = db.prepare(`SELECT SUM(valor) as total FROM movimentacoes_caixa WHERE caixa_id = ? AND tipo = 'suprimento'`).get(caixa.id);

  const pagamentos = db.prepare(`
    SELECT forma_pagamento, SUM(valor) as total
    FROM pagamentos p
    JOIN vendas v ON p.venda_id = v.id
    WHERE v.caixa_id = ? AND v.status = 'finalizada'
    GROUP BY forma_pagamento
  `).all(caixa.id);

  caixa.total_vendas = vendas.total || 0;
  caixa.total_sangrias = sangrias.total || 0;
  caixa.total_suprimentos = suprimentos.total || 0;
  caixa.pagamentos_por_tipo = pagamentos;

  res.json(caixa);
}));

// Abrir caixa
router.post('/abrir', wrap((req, res) => {
  const { operador, numero_caixa, valor_abertura } = req.body;
  if (!operador) return res.status(400).json({ error: 'Operador é obrigatório' });

  const caixaAberto = db.prepare(`SELECT id FROM caixas WHERE status = 'aberto'`).get();
  if (caixaAberto) return res.status(400).json({ error: 'Já existe um caixa aberto.' });

  const result = db.prepare(`INSERT INTO caixas (operador, numero_caixa, valor_abertura) VALUES (?, ?, ?)`)
    .run(operador, numero_caixa || 1, valor_abertura || 0);

  registrarLog(null, operador, 'abrir_caixa', 'caixa', 'Caixa #' + (numero_caixa||1) + ' aberto - R$ ' + (valor_abertura||0).toFixed(2), req.ip);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Caixa aberto com sucesso' });
}));

// Fechar caixa
router.post('/fechar', wrap((req, res) => {
  const { valor_fechamento, observacoes } = req.body;
  const caixa = db.prepare(`SELECT * FROM caixas WHERE status = 'aberto' ORDER BY aberto_em DESC LIMIT 1`).get();
  if (!caixa) return res.status(400).json({ error: 'Nenhum caixa aberto' });

  const vendas = db.prepare(`SELECT SUM(total) as total FROM vendas WHERE caixa_id = ? AND status = 'finalizada'`).get(caixa.id);
  const sangrias = db.prepare(`SELECT SUM(valor) as total FROM movimentacoes_caixa WHERE caixa_id = ? AND tipo = 'sangria'`).get(caixa.id);
  const suprimentos = db.prepare(`SELECT SUM(valor) as total FROM movimentacoes_caixa WHERE caixa_id = ? AND tipo = 'suprimento'`).get(caixa.id);

  const pagTipos = db.prepare(`
    SELECT forma_pagamento, SUM(valor - troco) as total FROM pagamentos p
    JOIN vendas v ON p.venda_id = v.id
    WHERE v.caixa_id = ? AND v.status = 'finalizada'
    GROUP BY forma_pagamento
  `).all(caixa.id);

  const totalVendas = vendas.total || 0;
  const totalSangrias = sangrias.total || 0;
  const totalSuprimentos = suprimentos.total || 0;

  let valorDinheiro = 0, valorDebito = 0, valorCredito = 0, valorPix = 0, valorOutros = 0;
  for (const p of pagTipos) {
    if (p.forma_pagamento === 'dinheiro') valorDinheiro = p.total;
    else if (p.forma_pagamento === 'cartao_debito') valorDebito = p.total;
    else if (p.forma_pagamento === 'cartao_credito') valorCredito = p.total;
    else if (p.forma_pagamento === 'pix') valorPix = p.total;
    else valorOutros += (p.total || 0);
  }

  const esperadoEmCaixa = caixa.valor_abertura + valorDinheiro - totalSangrias + totalSuprimentos;
  const vf = valor_fechamento !== undefined && valor_fechamento !== null ? valor_fechamento : esperadoEmCaixa;
  const diferenca = vf - esperadoEmCaixa;

  db.prepare(`
    UPDATE caixas SET status = 'fechado', fechado_em = CURRENT_TIMESTAMP,
    valor_fechamento = ?, valor_dinheiro = ?, valor_cartao_debito = ?, valor_cartao_credito = ?,
    valor_pix = ?, valor_outros = ?, total_vendas = ?, total_sangrias = ?,
    total_suprimentos = ?, diferenca = ?, observacoes = ?
    WHERE id = ?
  `).run(vf, valorDinheiro, valorDebito, valorCredito, valorPix, valorOutros, totalVendas, totalSangrias, totalSuprimentos, diferenca, observacoes || null, caixa.id);

  registrarLog(null, null, 'fechar_caixa', 'caixa', 'Caixa #' + caixa.numero_caixa + ' fechado - Vendas: R$ ' + totalVendas.toFixed(2) + ' Dif: R$ ' + diferenca.toFixed(2), req.ip);
  res.json({
    message: 'Caixa fechado com sucesso',
    resumo: { totalVendas, valorDinheiro, valorDebito, valorCredito, valorPix, totalSangrias, totalSuprimentos, esperadoEmCaixa, diferenca }
  });
}));

// Sangria
router.post('/sangria', wrap((req, res) => {
  const { valor, motivo, operador } = req.body;
  if (!valor) return res.status(400).json({ error: 'Valor é obrigatório' });

  const caixa = db.prepare(`SELECT * FROM caixas WHERE status = 'aberto'`).get();
  if (!caixa) return res.status(400).json({ error: 'Nenhum caixa aberto' });

  db.prepare(`INSERT INTO movimentacoes_caixa (caixa_id, tipo, valor, motivo, operador) VALUES (?, 'sangria', ?, ?, ?)`)
    .run(caixa.id, valor, motivo || null, operador || null);
  registrarLog(null, operador, 'sangria', 'caixa', 'Sangria R$ ' + valor.toFixed(2) + (motivo ? ' - ' + motivo : ''), req.ip);
  res.json({ message: 'Sangria registrada' });
}));

// Suprimento
router.post('/suprimento', wrap((req, res) => {
  const { valor, motivo, operador } = req.body;
  if (!valor) return res.status(400).json({ error: 'Valor é obrigatório' });

  const caixa = db.prepare(`SELECT * FROM caixas WHERE status = 'aberto'`).get();
  if (!caixa) return res.status(400).json({ error: 'Nenhum caixa aberto' });

  db.prepare(`INSERT INTO movimentacoes_caixa (caixa_id, tipo, valor, motivo, operador) VALUES (?, 'suprimento', ?, ?, ?)`)
    .run(caixa.id, valor, motivo || null, operador || null);
  registrarLog(null, operador, 'suprimento', 'caixa', 'Suprimento R$ ' + valor.toFixed(2) + (motivo ? ' - ' + motivo : ''), req.ip);
  res.json({ message: 'Suprimento registrado' });
}));

// Histórico de caixas
router.get('/historico', wrap((req, res) => {
  const caixas = db.prepare(`SELECT * FROM caixas ORDER BY aberto_em DESC LIMIT 30`).all();
  res.json(caixas);
}));

// Movimentações de um caixa
router.get('/:id/movimentacoes', wrap((req, res) => {
  const movs = db.prepare(`SELECT * FROM movimentacoes_caixa WHERE caixa_id = ? ORDER BY criado_em`).all(req.params.id);
  res.json(movs);
}));

module.exports = router;
