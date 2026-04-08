const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { registrarLog } = require('../middleware/logger');

// Listar vendas
router.get('/', (req, res) => {
  const { data_inicio, data_fim, status, page = 1, limit = 50 } = req.query;
  let sql = `SELECT * FROM vendas WHERE 1=1`;
  const params = [];
  if (data_inicio) { sql += ` AND criado_em >= ?`; params.push(data_inicio); }
  if (data_fim) { sql += ` AND criado_em <= ?`; params.push(data_fim + ' 23:59:59'); }
  if (status) { sql += ` AND status = ?`; params.push(status); }

  const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const total = db.prepare(countSql).get(...params).total;

  sql += ` ORDER BY criado_em DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), (Number(page) - 1) * Number(limit));

  res.json({ vendas: db.prepare(sql).all(...params), total });
});

// Detalhe da venda
router.get('/:id', (req, res) => {
  const venda = db.prepare(`SELECT * FROM vendas WHERE id = ?`).get(req.params.id);
  if (!venda) return res.status(404).json({ error: 'Venda não encontrada' });
  venda.itens = db.prepare(`SELECT * FROM itens_venda WHERE venda_id = ?`).all(req.params.id);
  venda.pagamentos = db.prepare(`SELECT * FROM pagamentos WHERE venda_id = ?`).all(req.params.id);
  res.json(venda);
});

// Nova venda (PDV)
router.post('/', (req, res) => {
  const { itens, pagamentos: pgtos, cliente_cpf, cliente_nome, cliente_id, desconto, acrescimo, observacoes } = req.body;

  const caixa = db.prepare(`SELECT * FROM caixas WHERE status = 'aberto'`).get();
  if (!caixa) return res.status(400).json({ error: 'Nenhum caixa aberto. Abra o caixa antes de vender.' });

  if (!itens || !itens.length) return res.status(400).json({ error: 'Adicione ao menos um item' });
  if (!pgtos || !pgtos.length) return res.status(400).json({ error: 'Adicione ao menos uma forma de pagamento' });

  const transaction = db.transaction(() => {
    // Calcular subtotal
    let subtotal = 0;
    for (const item of itens) {
      subtotal += (item.preco_unitario * item.quantidade) - (item.desconto || 0);
    }

    const total = subtotal - (desconto || 0) + (acrescimo || 0);

    // Número da venda
    const ultimaVenda = db.prepare(`SELECT MAX(numero_venda) as ultimo FROM vendas`).get();
    const numero_venda = (ultimaVenda.ultimo || 0) + 1;

    // Criar venda
    const vendaResult = db.prepare(`
      INSERT INTO vendas (caixa_id, numero_venda, cliente_cpf, cliente_nome, cliente_id, subtotal, desconto, acrescimo, total, status, observacoes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'finalizada', ?)
    `).run(caixa.id, numero_venda, cliente_cpf || null, cliente_nome || null, cliente_id || null, subtotal, desconto || 0, acrescimo || 0, total, observacoes || null);

    const venda_id = vendaResult.lastInsertRowid;

    // Atualizar pontos do cliente fidelidade
    if (cliente_id) {
      const pontos = Math.floor(total);
      db.prepare('UPDATE clientes SET pontos = pontos + ?, total_compras = total_compras + ?, qtd_compras = qtd_compras + 1, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?')
        .run(pontos, total, cliente_id);
    }

    // Inserir itens e baixar estoque
    const stmtItem = db.prepare(`
      INSERT INTO itens_venda (venda_id, produto_id, codigo_barras, nome_produto, quantidade, preco_unitario, desconto, subtotal)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of itens) {
      const itemSubtotal = (item.preco_unitario * item.quantidade) - (item.desconto || 0);
      stmtItem.run(venda_id, item.produto_id, item.codigo_barras || null, item.nome_produto || null, item.quantidade, item.preco_unitario, item.desconto || 0, itemSubtotal);

      // Baixar estoque
      const produto = db.prepare(`SELECT * FROM produtos WHERE id = ?`).get(item.produto_id);
      if (produto) {
        const novoEstoque = produto.estoque_atual - item.quantidade;
        db.prepare(`UPDATE produtos SET estoque_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`).run(novoEstoque, item.produto_id);
        db.prepare(`
          INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, motivo, referencia_tipo, referencia_id)
          VALUES (?, 'saida', ?, ?, ?, 'Venda PDV', 'venda', ?)
        `).run(item.produto_id, item.quantidade, produto.estoque_atual, novoEstoque, venda_id);
      }
    }

    // Inserir pagamentos
    const stmtPgto = db.prepare(`
      INSERT INTO pagamentos (venda_id, forma_pagamento, valor, troco, bandeira, nsu, autorizacao, parcelas)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const pgto of pgtos) {
      stmtPgto.run(venda_id, pgto.forma_pagamento, pgto.valor, pgto.troco || 0, pgto.bandeira || null, pgto.nsu || null, pgto.autorizacao || null, pgto.parcelas || 1);
    }

    return { venda_id, numero_venda, total };
  });

  try {
    const resultado = transaction();
    registrarLog(null, null, 'nova_venda', 'vendas', 'Venda #' + resultado.numero_venda + ' - ' + resultado.total.toFixed(2), req.ip);
    res.status(201).json(resultado);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancelar venda
router.post('/:id/cancelar', (req, res) => {
  const venda = db.prepare(`SELECT * FROM vendas WHERE id = ? AND status = 'finalizada'`).get(req.params.id);
  if (!venda) return res.status(400).json({ error: 'Venda não encontrada ou já cancelada' });

  const transaction = db.transaction(() => {
    // Devolver estoque
    const itens = db.prepare(`SELECT * FROM itens_venda WHERE venda_id = ?`).all(req.params.id);
    for (const item of itens) {
      const produto = db.prepare(`SELECT * FROM produtos WHERE id = ?`).get(item.produto_id);
      if (produto) {
        const novoEstoque = produto.estoque_atual + item.quantidade;
        db.prepare(`UPDATE produtos SET estoque_atual = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`).run(novoEstoque, item.produto_id);
        db.prepare(`
          INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, estoque_anterior, estoque_posterior, motivo, referencia_tipo, referencia_id)
          VALUES (?, 'entrada', ?, ?, ?, 'Cancelamento de venda', 'venda', ?)
        `).run(item.produto_id, item.quantidade, produto.estoque_atual, novoEstoque, venda.id);
      }
    }

    db.prepare(`UPDATE vendas SET status = 'cancelada' WHERE id = ?`).run(req.params.id);
  });
  transaction();

  registrarLog(null, null, 'cancelar_venda', 'vendas', 'Venda #' + venda.numero_venda + ' cancelada - R$ ' + venda.total.toFixed(2), req.ip);
  res.json({ message: 'Venda cancelada e estoque devolvido' });
});

module.exports = router;
