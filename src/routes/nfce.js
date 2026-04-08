const express = require('express');
const router = express.Router();
const db = require('../models/db');

// Listar NFC-e emitidas
router.get('/', (req, res) => {
  const { status, data_inicio, data_fim } = req.query;
  let sql = `SELECT n.*, v.numero_venda FROM nfce n LEFT JOIN vendas v ON n.venda_id = v.id WHERE 1=1`;
  const params = [];
  if (status) { sql += ` AND n.status = ?`; params.push(status); }
  if (data_inicio) { sql += ` AND n.data_emissao >= ?`; params.push(data_inicio); }
  if (data_fim) { sql += ` AND n.data_emissao <= ?`; params.push(data_fim + ' 23:59:59'); }
  sql += ` ORDER BY n.data_emissao DESC`;
  res.json(db.prepare(sql).all(...params));
});

// Emitir NFC-e (simulação - em produção integraria com SEFAZ)
router.post('/emitir', (req, res) => {
  const { venda_id } = req.body;
  if (!venda_id) return res.status(400).json({ error: 'ID da venda é obrigatório' });

  const venda = db.prepare(`SELECT * FROM vendas WHERE id = ? AND status = 'finalizada'`).get(venda_id);
  if (!venda) return res.status(400).json({ error: 'Venda não encontrada ou não finalizada' });

  // Verificar se já tem NFC-e
  const existente = db.prepare(`SELECT id FROM nfce WHERE venda_id = ? AND status = 'autorizada'`).get(venda_id);
  if (existente) return res.status(400).json({ error: 'NFC-e já emitida para esta venda' });

  const config = {};
  const configs = db.prepare(`SELECT chave, valor FROM configuracoes WHERE chave LIKE 'nfce_%' OR chave LIKE 'empresa_%'`).all();
  for (const c of configs) config[c.chave] = c.valor;

  // Próximo número
  const ultimoNum = Number(config.nfce_ultimo_numero || 0) + 1;
  db.prepare(`UPDATE configuracoes SET valor = ? WHERE chave = 'nfce_ultimo_numero'`).run(String(ultimoNum));

  // Gerar chave de acesso simulada (44 dígitos)
  const uf = '35'; // SP
  const aamm = new Date().toISOString().slice(2, 4) + new Date().toISOString().slice(5, 7);
  const cnpj = (config.empresa_cnpj || '').replace(/\D/g, '').padStart(14, '0');
  const mod = '65'; // NFC-e
  const serie = (config.nfce_serie || '1').padStart(3, '0');
  const num = String(ultimoNum).padStart(9, '0');
  const tpEmis = '1';
  const cNF = String(Math.floor(Math.random() * 99999999)).padStart(8, '0');
  const chaveBase = `${uf}${aamm}${cnpj}${mod}${serie}${num}${tpEmis}${cNF}`;
  const chave = chaveBase + '0'; // DV simplificado

  // Em produção: aqui faria a comunicação com SEFAZ
  const ambiente = config.nfce_ambiente || 'homologacao';

  const itens = db.prepare(`SELECT iv.*, p.ncm, p.cfop, p.cst FROM itens_venda iv JOIN produtos p ON iv.produto_id = p.id WHERE iv.venda_id = ?`).all(venda_id);
  const pagamentos = db.prepare(`SELECT * FROM pagamentos WHERE venda_id = ?`).all(venda_id);

  // Simular XML (em produção seria gerado pelo componente de NF-e)
  const xmlEnvio = gerarXmlNfce(config, venda, itens, pagamentos, ultimoNum, chave);

  const result = db.prepare(`
    INSERT INTO nfce (venda_id, numero, serie, chave_acesso, protocolo, data_emissao, valor_total, xml_envio, status, ambiente)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, 'autorizada', ?)
  `).run(venda_id, ultimoNum, config.nfce_serie || '1', chave, 'SIM' + Date.now(), venda.total, xmlEnvio, ambiente);

  res.status(201).json({
    id: result.lastInsertRowid,
    numero: ultimoNum,
    chave_acesso: chave,
    status: 'autorizada',
    ambiente,
    message: ambiente === 'homologacao' ? 'NFC-e emitida em HOMOLOGAÇÃO (teste)' : 'NFC-e emitida com sucesso'
  });
});

// Cancelar NFC-e
router.post('/:id/cancelar', (req, res) => {
  const { motivo } = req.body;
  if (!motivo || motivo.length < 15) return res.status(400).json({ error: 'Motivo deve ter pelo menos 15 caracteres' });

  const nfce = db.prepare(`SELECT * FROM nfce WHERE id = ? AND status = 'autorizada'`).get(req.params.id);
  if (!nfce) return res.status(400).json({ error: 'NFC-e não encontrada ou não pode ser cancelada' });

  // Em produção: enviar cancelamento para SEFAZ
  db.prepare(`UPDATE nfce SET status = 'cancelada', motivo_cancelamento = ?, protocolo_cancelamento = ? WHERE id = ?`)
    .run(motivo, 'CANCEL' + Date.now(), req.params.id);

  res.json({ message: 'NFC-e cancelada' });
});

// Inutilizar numeração
router.post('/inutilizar', (req, res) => {
  const { numero_inicio, numero_fim, motivo } = req.body;
  if (!numero_inicio || !numero_fim) return res.status(400).json({ error: 'Informe a faixa de numeração' });

  // Em produção: enviar inutilização para SEFAZ
  for (let n = Number(numero_inicio); n <= Number(numero_fim); n++) {
    db.prepare(`INSERT OR IGNORE INTO nfce (numero, serie, status, ambiente, data_emissao, valor_total) VALUES (?, '1', 'inutilizada', 'homologacao', CURRENT_TIMESTAMP, 0)`)
      .run(n);
  }

  res.json({ message: `Numeração ${numero_inicio} a ${numero_fim} inutilizada` });
});

// Dados para impressão (cupom)
router.get('/:id/cupom', (req, res) => {
  const nfce = db.prepare(`SELECT * FROM nfce WHERE id = ?`).get(req.params.id);
  if (!nfce) return res.status(404).json({ error: 'NFC-e não encontrada' });

  const venda = db.prepare(`SELECT * FROM vendas WHERE id = ?`).get(nfce.venda_id);
  const itens = db.prepare(`SELECT * FROM itens_venda WHERE venda_id = ?`).all(nfce.venda_id);
  const pagamentos = db.prepare(`SELECT * FROM pagamentos WHERE venda_id = ?`).all(nfce.venda_id);

  const config = {};
  const configs = db.prepare(`SELECT chave, valor FROM configuracoes WHERE chave LIKE 'empresa_%'`).all();
  for (const c of configs) config[c.chave] = c.valor;

  res.json({ nfce, venda, itens, pagamentos, empresa: config });
});

function gerarXmlNfce(config, venda, itens, pagamentos, numero, chave) {
  // Estrutura simplificada do XML da NFC-e
  return `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe versao="4.00" Id="NFe${chave}">
    <ide>
      <cUF>35</cUF>
      <natOp>VENDA</natOp>
      <mod>65</mod>
      <serie>${config.nfce_serie || '1'}</serie>
      <nNF>${numero}</nNF>
      <tpAmb>${config.nfce_ambiente === 'producao' ? '1' : '2'}</tpAmb>
      <tpEmis>1</tpEmis>
    </ide>
    <emit>
      <CNPJ>${(config.empresa_cnpj || '').replace(/\D/g, '')}</CNPJ>
      <xNome>${config.empresa_razao_social || ''}</xNome>
      <xFant>${config.empresa_nome_fantasia || ''}</xFant>
    </emit>
    <total>
      <ICMSTot>
        <vNF>${venda.total.toFixed(2)}</vNF>
      </ICMSTot>
    </total>
  </infNFe>
</NFe>`;
}

module.exports = router;
