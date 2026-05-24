const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { registrarLog } = require('../middleware/logger');

function wrap(fn) {
  return (req, res, next) => { try { const r = fn(req, res, next); if (r && r.catch) r.catch(e => res.status(500).json({ error: e.message })); } catch (e) { res.status(500).json({ error: e.message }); } };
}

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

router.post('/abrir', wrap((req, res) => {
  const { numero_caixa, valor_abertura } = req.body;
  const operador = req.body.operador || (req.user && req.user.nome);
  if (!operador) return res.status(400).json({ error: 'Operador e obrigatorio' });

  const caixaAberto = db.prepare(`SELECT id, operador FROM caixas WHERE status = 'aberto'`).get();
  if (caixaAberto) {
    return res.status(400).json({ error: 'Ja existe um caixa aberto (operador: ' + (caixaAberto.operador || 'desconhecido') + '). Feche-o antes de abrir outro.' });
  }

  const userId = req.user ? req.user.id : null;
  const result = db.prepare(`INSERT INTO caixas (operador, numero_caixa, valor_abertura, aberto_por_id) VALUES (?, ?, ?, ?)`)
    .run(operador, numero_caixa || 1, valor_abertura || 0, userId);

  registrarLog(userId, operador, 'abrir_caixa', 'caixa', 'Caixa #' + (numero_caixa||1) + ' aberto - R$ ' + (Number(valor_abertura)||0).toFixed(2), req.ip);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Caixa aberto com sucesso' });
}));

router.post('/fechar', wrap((req, res) => {
  const { valor_fechamento, observacoes } = req.body;
  const caixa = db.prepare(`SELECT * FROM caixas WHERE status = 'aberto' ORDER BY aberto_em DESC LIMIT 1`).get();
  if (!caixa) return res.status(400).json({ error: 'Nenhum caixa aberto' });

  const user = req.user || {};
  const ehDono = caixa.aberto_por_id && caixa.aberto_por_id === user.id;
  const ehSupervisor = user.perfil === 'gerente' || user.perfil === 'admin';
  if (!ehDono && !ehSupervisor) {
    return res.status(403).json({ error: 'Apenas o operador que abriu o caixa ou um gerente/admin pode fecha-lo.' });
  }

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
    total_suprimentos = ?, diferenca = ?, observacoes = ?,
    fechado_por_id = ?, fechado_por_nome = ?
    WHERE id = ?
  `).run(vf, valorDinheiro, valorDebito, valorCredito, valorPix, valorOutros, totalVendas, totalSangrias, totalSuprimentos, diferenca, observacoes || null, user.id || null, user.nome || null, caixa.id);

  const detalheFechador = ehDono ? '' : ' (fechado por ' + (user.perfil || 'supervisor') + ' ' + (user.nome || '') + ')';
  registrarLog(user.id || null, user.nome || null, 'fechar_caixa', 'caixa', 'Caixa #' + caixa.numero_caixa + ' fechado - Vendas: R$ ' + totalVendas.toFixed(2) + ' Dif: R$ ' + diferenca.toFixed(2) + detalheFechador, req.ip);
  res.json({
    message: 'Caixa fechado com sucesso',
    resumo: { totalVendas, valorDinheiro, valorDebito, valorCredito, valorPix, totalSangrias, totalSuprimentos, esperadoEmCaixa, diferenca }
  });
}));

router.post('/sangria', wrap((req, res) => {
  const { valor, motivo } = req.body;
  const operador = req.body.operador || (req.user && req.user.nome);
  if (!valor) return res.status(400).json({ error: 'Valor e obrigatorio' });

  const caixa = db.prepare(`SELECT * FROM caixas WHERE status = 'aberto'`).get();
  if (!caixa) return res.status(400).json({ error: 'Nenhum caixa aberto' });

  db.prepare(`INSERT INTO movimentacoes_caixa (caixa_id, tipo, valor, motivo, operador) VALUES (?, 'sangria', ?, ?, ?)`)
    .run(caixa.id, valor, motivo || null, operador || null);
  registrarLog(req.user ? req.user.id : null, operador, 'sangria', 'caixa', 'Sangria R$ ' + Number(valor).toFixed(2) + (motivo ? ' - ' + motivo : ''), req.ip);
  res.json({ message: 'Sangria registrada' });
}));

router.post('/suprimento', wrap((req, res) => {
  const { valor, motivo } = req.body;
  const operador = req.body.operador || (req.user && req.user.nome);
  if (!valor) return res.status(400).json({ error: 'Valor e obrigatorio' });

  const caixa = db.prepare(`SELECT * FROM caixas WHERE status = 'aberto'`).get();
  if (!caixa) return res.status(400).json({ error: 'Nenhum caixa aberto' });

  db.prepare(`INSERT INTO movimentacoes_caixa (caixa_id, tipo, valor, motivo, operador) VALUES (?, 'suprimento', ?, ?, ?)`)
    .run(caixa.id, valor, motivo || null, operador || null);
  registrarLog(req.user ? req.user.id : null, operador, 'suprimento', 'caixa', 'Suprimento R$ ' + Number(valor).toFixed(2) + (motivo ? ' - ' + motivo : ''), req.ip);
  res.json({ message: 'Suprimento registrado' });
}));

router.get('/historico', wrap((req, res) => {
  const caixas = db.prepare(`SELECT * FROM caixas ORDER BY aberto_em DESC LIMIT 30`).all();
  res.json(caixas);
}));

router.get('/:id/movimentacoes', wrap((req, res) => {
  const movs = db.prepare(`SELECT * FROM movimentacoes_caixa WHERE caixa_id = ? ORDER BY criado_em`).all(req.params.id);
  res.json(movs);
}));

module.exports = router;
