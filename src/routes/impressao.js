const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { imprimirCupom, imprimirTeste, imprimirRelatorio } = require('../utils/impressao');

router.post('/teste', async (req, res, next) => {
  try {
    await imprimirTeste();
    res.json({ message: 'Teste enviado para a impressora' });
  } catch (e) {
    e.status = 400;
    next(e);
  }
});

router.post('/cupom/:vendaId', async (req, res, next) => {
  try {
    const venda = db.prepare('SELECT * FROM vendas WHERE id = ?').get(req.params.vendaId);
    if (!venda) return res.status(404).json({ error: 'Venda nao encontrada' });
    venda.itens = db.prepare('SELECT * FROM itens_venda WHERE venda_id = ?').all(venda.id);
    venda.pagamentos = db.prepare('SELECT * FROM pagamentos WHERE venda_id = ?').all(venda.id);
    await imprimirCupom(venda);
    res.json({ message: 'Cupom impresso' });
  } catch (e) {
    e.status = 400;
    next(e);
  }
});

router.post('/relatorio', async (req, res, next) => {
  try {
    const { titulo, linhas } = req.body;
    if (!titulo) return res.status(400).json({ error: 'Titulo obrigatorio' });
    await imprimirRelatorio(titulo, linhas || []);
    res.json({ message: 'Relatorio impresso' });
  } catch (e) {
    e.status = 400;
    next(e);
  }
});

module.exports = router;
