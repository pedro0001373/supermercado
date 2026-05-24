const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');
const db = require('../models/db');

const MODELOS = {
  epson:    PrinterTypes.EPSON,
  bematech: PrinterTypes.EPSON,
  elgin:    PrinterTypes.EPSON,
  daruma:   PrinterTypes.EPSON,
  star:     PrinterTypes.STAR,
};

function config(chave) {
  const row = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave);
  return row ? row.valor : '';
}

function normalizarEndereco(endereco) {
  if (!endereco) return null;
  if (endereco.startsWith('tcp://') || endereco.startsWith('printer:')) return endereco;
  if (/^\d+\.\d+\.\d+\.\d+/.test(endereco)) {
    return 'tcp://' + endereco + (endereco.includes(':') ? '' : ':9100');
  }
  return 'printer:' + endereco;
}

function criarPrinter() {
  const modelo = (config('impressora_modelo') || 'epson').toLowerCase();
  const endereco = normalizarEndereco(config('impressora_endereco'));
  const largura = Number(config('impressora_largura')) || 48;

  if (!endereco) throw new Error('Impressora nao configurada. Defina o endereco em Configuracoes.');

  return new ThermalPrinter({
    type: MODELOS[modelo] || PrinterTypes.EPSON,
    interface: endereco,
    width: largura,
    options: { timeout: 5000 },
    removeSpecialCharacters: false,
  });
}

function formatMoney(v) {
  return 'R$ ' + (Number(v) || 0).toFixed(2).replace('.', ',');
}

function nomeComercio() {
  return config('empresa_nome_fantasia') || config('empresa_razao_social') || 'Comercio';
}

function linhaCabecalho(printer) {
  printer.alignCenter();
  printer.bold(true);
  printer.println(nomeComercio());
  printer.bold(false);
  const cnpj = config('empresa_cnpj');
  const endereco = config('empresa_endereco');
  const cidadeUf = [config('empresa_cidade'), config('empresa_uf')].filter(Boolean).join('/');
  if (cnpj) printer.println('CNPJ: ' + cnpj);
  if (endereco) printer.println(endereco);
  if (cidadeUf) printer.println(cidadeUf);
  printer.drawLine();
  printer.alignLeft();
}

async function imprimirCupom(venda) {
  const printer = criarPrinter();

  linhaCabecalho(printer);

  printer.println('CUPOM NAO FISCAL');
  printer.println('Venda #' + (venda.numero_venda || venda.id));
  printer.println(new Date(venda.criado_em || Date.now()).toLocaleString('pt-BR'));
  if (venda.cliente_nome) printer.println('Cliente: ' + venda.cliente_nome);
  if (venda.cliente_cpf) printer.println('CPF: ' + venda.cliente_cpf);
  printer.drawLine();

  printer.tableCustom([
    { text: 'ITEM', align: 'LEFT', width: 0.55, bold: true },
    { text: 'QTD', align: 'CENTER', width: 0.15, bold: true },
    { text: 'TOTAL', align: 'RIGHT', width: 0.30, bold: true },
  ]);

  for (const item of venda.itens || []) {
    printer.tableCustom([
      { text: (item.nome_produto || '').substring(0, 24), align: 'LEFT', width: 0.55 },
      { text: String(item.quantidade), align: 'CENTER', width: 0.15 },
      { text: formatMoney(item.subtotal), align: 'RIGHT', width: 0.30 },
    ]);
    printer.println('  ' + formatMoney(item.preco_unitario) + ' x ' + item.quantidade);
  }

  printer.drawLine();
  printer.leftRight('Subtotal:', formatMoney(venda.subtotal));
  if (venda.desconto > 0) printer.leftRight('Desconto:', '-' + formatMoney(venda.desconto));
  if (venda.acrescimo > 0) printer.leftRight('Acrescimo:', formatMoney(venda.acrescimo));
  printer.bold(true);
  printer.leftRight('TOTAL:', formatMoney(venda.total));
  printer.bold(false);

  if (venda.pagamentos && venda.pagamentos.length) {
    printer.newLine();
    printer.println('Forma(s) de pagamento:');
    for (const p of venda.pagamentos) {
      printer.leftRight('  ' + (p.forma_pagamento || ''), formatMoney(p.valor));
      if (p.troco > 0) printer.leftRight('  Troco:', formatMoney(p.troco));
    }
  }

  printer.drawLine();
  printer.alignCenter();
  try { await printer.printQR(`venda:${venda.id}`, { cellSize: 5 }); } catch (e) {}
  printer.newLine();
  printer.println('Obrigado pela preferencia!');
  printer.println(nomeComercio());
  printer.newLine();
  printer.cut();

  return printer.execute();
}

async function imprimirTeste() {
  const printer = criarPrinter();
  linhaCabecalho(printer);
  printer.alignCenter();
  printer.bold(true);
  printer.println('TESTE DE IMPRESSAO');
  printer.bold(false);
  printer.println(new Date().toLocaleString('pt-BR'));
  printer.newLine();
  printer.alignLeft();
  printer.println('Impressora: ' + (config('impressora_modelo') || 'epson'));
  printer.println('Endereco:   ' + config('impressora_endereco'));
  printer.println('Largura:    ' + config('impressora_largura') + ' cols');
  printer.newLine();
  printer.alignCenter();
  printer.println('Se este cupom imprimiu corretamente,');
  printer.println('a impressora esta OK.');
  printer.newLine();
  printer.cut();
  return printer.execute();
}

async function imprimirRelatorio(titulo, linhas) {
  const printer = criarPrinter();
  linhaCabecalho(printer);
  printer.alignCenter();
  printer.bold(true);
  printer.println(titulo);
  printer.bold(false);
  printer.println(new Date().toLocaleString('pt-BR'));
  printer.drawLine();
  printer.alignLeft();
  for (const linha of linhas || []) {
    if (typeof linha === 'string') { printer.println(linha); continue; }
    if (linha.separador) { printer.drawLine(); continue; }
    if (linha.esquerda != null && linha.direita != null) {
      printer.leftRight(String(linha.esquerda), String(linha.direita));
      continue;
    }
    if (linha.titulo) { printer.bold(true); printer.println(linha.titulo); printer.bold(false); continue; }
  }
  printer.newLine();
  printer.cut();
  return printer.execute();
}

module.exports = { imprimirCupom, imprimirTeste, imprimirRelatorio };
