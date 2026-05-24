const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', '..', 'data', 'supermercado.db');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

class DatabaseWrapper {
  constructor() {
    this.db = null;
    this.ready = false;
  }

  async init() {
    this.db = new Database(dbPath);

    // WAL: melhor concorrencia (leitores nao bloqueiam gravadores)
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');

    this.ready = true;
    this._createTables();
    return this;
  }

  // No-op: mantido para compatibilidade com codigo antigo que chamava save()
  save() {}
  saveSync() {}

  exec(sql) {
    this.db.exec(sql);
  }

  _sanitize(params) {
    return params.map((p) => (p === undefined ? null : p));
  }

  prepare(sql) {
    const self = this;
    const stmt = self.db.prepare(sql);
    return {
      run(...params) {
        const clean = self._sanitize(params);
        const info = stmt.run(...clean);
        return { lastInsertRowid: info.lastInsertRowid, changes: info.changes };
      },
      get(...params) {
        const clean = self._sanitize(params);
        return stmt.get(...clean);
      },
      all(...params) {
        const clean = self._sanitize(params);
        return stmt.all(...clean);
      },
    };
  }

  transaction(fn) {
    return this.db.transaction(fn);
  }

  _createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS fornecedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        razao_social TEXT NOT NULL,
        nome_fantasia TEXT,
        cnpj TEXT UNIQUE,
        ie TEXT,
        endereco TEXT,
        cidade TEXT,
        uf TEXT,
        cep TEXT,
        telefone TEXT,
        email TEXT,
        contato TEXT,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL UNIQUE,
        descricao TEXT,
        ativo INTEGER DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_barras TEXT UNIQUE,
        nome TEXT NOT NULL,
        descricao TEXT,
        categoria_id INTEGER,
        unidade TEXT DEFAULT 'UN',
        preco_custo REAL DEFAULT 0,
        preco_venda REAL NOT NULL,
        margem_lucro REAL DEFAULT 0,
        estoque_atual REAL DEFAULT 0,
        estoque_minimo REAL DEFAULT 0,
        ncm TEXT,
        cst TEXT,
        cfop TEXT,
        icms_aliquota REAL DEFAULT 0,
        pis_aliquota REAL DEFAULT 0,
        cofins_aliquota REAL DEFAULT 0,
        peso_liquido REAL DEFAULT 0,
        usa_balanca INTEGER DEFAULT 0,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (categoria_id) REFERENCES categorias(id)
      );
      CREATE TABLE IF NOT EXISTS lotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER NOT NULL,
        numero_lote TEXT,
        data_fabricacao DATE,
        data_validade DATE NOT NULL,
        quantidade REAL DEFAULT 0,
        custo_unitario REAL DEFAULT 0,
        fornecedor_id INTEGER,
        nota_entrada_id INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (produto_id) REFERENCES produtos(id),
        FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
      );
      CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        quantidade REAL NOT NULL,
        estoque_anterior REAL,
        estoque_posterior REAL,
        motivo TEXT,
        usuario TEXT,
        referencia_tipo TEXT,
        referencia_id INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (produto_id) REFERENCES produtos(id)
      );
      CREATE TABLE IF NOT EXISTS notas_entrada (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fornecedor_id INTEGER,
        numero_nota TEXT,
        serie TEXT,
        chave_acesso TEXT UNIQUE,
        data_emissao DATE,
        data_entrada DATE DEFAULT (date('now')),
        valor_produtos REAL DEFAULT 0,
        valor_frete REAL DEFAULT 0,
        valor_seguro REAL DEFAULT 0,
        valor_desconto REAL DEFAULT 0,
        valor_ipi REAL DEFAULT 0,
        valor_icms REAL DEFAULT 0,
        valor_total REAL DEFAULT 0,
        xml_conteudo TEXT,
        status TEXT DEFAULT 'pendente',
        observacoes TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
      );
      CREATE TABLE IF NOT EXISTS itens_nota_entrada (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nota_entrada_id INTEGER NOT NULL,
        produto_id INTEGER,
        codigo_produto_fornecedor TEXT,
        descricao TEXT,
        ncm TEXT,
        cfop TEXT,
        unidade TEXT,
        quantidade REAL NOT NULL,
        valor_unitario REAL NOT NULL,
        valor_total REAL NOT NULL,
        valor_desconto REAL DEFAULT 0,
        valor_icms REAL DEFAULT 0,
        valor_ipi REAL DEFAULT 0,
        valor_pis REAL DEFAULT 0,
        valor_cofins REAL DEFAULT 0,
        FOREIGN KEY (nota_entrada_id) REFERENCES notas_entrada(id),
        FOREIGN KEY (produto_id) REFERENCES produtos(id)
      );
      CREATE TABLE IF NOT EXISTS caixas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operador TEXT NOT NULL,
        numero_caixa INTEGER DEFAULT 1,
        valor_abertura REAL DEFAULT 0,
        valor_fechamento REAL,
        valor_dinheiro REAL DEFAULT 0,
        valor_cartao_debito REAL DEFAULT 0,
        valor_cartao_credito REAL DEFAULT 0,
        valor_pix REAL DEFAULT 0,
        valor_outros REAL DEFAULT 0,
        total_vendas REAL DEFAULT 0,
        total_sangrias REAL DEFAULT 0,
        total_suprimentos REAL DEFAULT 0,
        diferenca REAL DEFAULT 0,
        status TEXT DEFAULT 'aberto',
        aberto_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        fechado_em DATETIME,
        observacoes TEXT
      );
      CREATE TABLE IF NOT EXISTS movimentacoes_caixa (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        caixa_id INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        valor REAL NOT NULL,
        motivo TEXT,
        operador TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (caixa_id) REFERENCES caixas(id)
      );
      CREATE TABLE IF NOT EXISTS vendas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        caixa_id INTEGER,
        numero_venda INTEGER,
        cliente_cpf TEXT,
        cliente_nome TEXT,
        subtotal REAL DEFAULT 0,
        desconto REAL DEFAULT 0,
        acrescimo REAL DEFAULT 0,
        total REAL NOT NULL,
        status TEXT DEFAULT 'finalizada',
        observacoes TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (caixa_id) REFERENCES caixas(id)
      );
      CREATE TABLE IF NOT EXISTS itens_venda (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venda_id INTEGER NOT NULL,
        produto_id INTEGER NOT NULL,
        codigo_barras TEXT,
        nome_produto TEXT,
        quantidade REAL NOT NULL,
        preco_unitario REAL NOT NULL,
        desconto REAL DEFAULT 0,
        subtotal REAL NOT NULL,
        cancelado INTEGER DEFAULT 0,
        FOREIGN KEY (venda_id) REFERENCES vendas(id),
        FOREIGN KEY (produto_id) REFERENCES produtos(id)
      );
      CREATE TABLE IF NOT EXISTS pagamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venda_id INTEGER NOT NULL,
        forma_pagamento TEXT NOT NULL,
        valor REAL NOT NULL,
        troco REAL DEFAULT 0,
        bandeira TEXT,
        nsu TEXT,
        autorizacao TEXT,
        parcelas INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (venda_id) REFERENCES vendas(id)
      );
      CREATE TABLE IF NOT EXISTS nfce (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venda_id INTEGER,
        numero INTEGER,
        serie TEXT DEFAULT '1',
        chave_acesso TEXT UNIQUE,
        protocolo TEXT,
        data_emissao DATETIME,
        valor_total REAL,
        xml_envio TEXT,
        xml_retorno TEXT,
        status TEXT DEFAULT 'pendente',
        motivo_cancelamento TEXT,
        protocolo_cancelamento TEXT,
        ambiente TEXT DEFAULT 'homologacao',
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (venda_id) REFERENCES vendas(id)
      );
      CREATE TABLE IF NOT EXISTS configuracoes (
        chave TEXT PRIMARY KEY,
        valor TEXT,
        descricao TEXT
      );
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        login TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        perfil TEXT DEFAULT 'operador',
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        cpf TEXT UNIQUE,
        telefone TEXT,
        email TEXT,
        pontos INTEGER DEFAULT 0,
        total_compras REAL DEFAULT 0,
        qtd_compras INTEGER DEFAULT 0,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER,
        usuario_nome TEXT,
        acao TEXT NOT NULL,
        modulo TEXT NOT NULL,
        detalhes TEXT,
        ip TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        arquivo TEXT NOT NULL,
        tamanho INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS pedidos_compra (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fornecedor_id INTEGER,
        status TEXT DEFAULT 'rascunho',
        observacoes TEXT,
        total REAL DEFAULT 0,
        criado_por TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
      );
      CREATE TABLE IF NOT EXISTS itens_pedido_compra (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido_id INTEGER NOT NULL,
        produto_id INTEGER NOT NULL,
        quantidade_sugerida REAL DEFAULT 0,
        quantidade REAL DEFAULT 0,
        custo_estimado REAL DEFAULT 0,
        FOREIGN KEY (pedido_id) REFERENCES pedidos_compra(id),
        FOREIGN KEY (produto_id) REFERENCES produtos(id)
      );
      CREATE TABLE IF NOT EXISTS alertas_enviados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL,
        produto_id INTEGER,
        canal TEXT NOT NULL,
        detalhes TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (produto_id) REFERENCES produtos(id)
      );

      CREATE TABLE IF NOT EXISTS contas_pagar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        descricao TEXT NOT NULL,
        fornecedor_id INTEGER,
        categoria TEXT,
        valor REAL NOT NULL,
        vencimento DATE NOT NULL,
        data_pagamento DATE,
        forma_pagamento TEXT,
        status TEXT NOT NULL DEFAULT 'aberto',
        observacoes TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
      );

      CREATE TABLE IF NOT EXISTS contas_receber (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        descricao TEXT NOT NULL,
        cliente_id INTEGER,
        venda_id INTEGER,
        valor REAL NOT NULL,
        vencimento DATE NOT NULL,
        data_recebimento DATE,
        forma_recebimento TEXT,
        status TEXT NOT NULL DEFAULT 'aberto',
        observacoes TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cliente_id) REFERENCES clientes(id),
        FOREIGN KEY (venda_id) REFERENCES vendas(id)
      );

      CREATE INDEX IF NOT EXISTS idx_contas_pagar_venc ON contas_pagar(vencimento);
      CREATE INDEX IF NOT EXISTS idx_contas_pagar_status ON contas_pagar(status);
      CREATE INDEX IF NOT EXISTS idx_contas_receber_venc ON contas_receber(vencimento);
      CREATE INDEX IF NOT EXISTS idx_contas_receber_status ON contas_receber(status);
      CREATE INDEX IF NOT EXISTS idx_contas_receber_cliente ON contas_receber(cliente_id);
      CREATE INDEX IF NOT EXISTS idx_movimentacoes_caixa_data ON movimentacoes_caixa(criado_em);

      CREATE INDEX IF NOT EXISTS idx_produtos_codigo_barras ON produtos(codigo_barras);
      CREATE INDEX IF NOT EXISTS idx_produtos_nome ON produtos(nome);
      CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos(categoria_id);
      CREATE INDEX IF NOT EXISTS idx_lotes_produto ON lotes(produto_id);
      CREATE INDEX IF NOT EXISTS idx_lotes_validade ON lotes(data_validade);
      CREATE INDEX IF NOT EXISTS idx_movimentacoes_produto ON movimentacoes_estoque(produto_id);
      CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas(criado_em);
      CREATE INDEX IF NOT EXISTS idx_vendas_caixa ON vendas(caixa_id);
      CREATE INDEX IF NOT EXISTS idx_itens_venda ON itens_venda(venda_id);
      CREATE INDEX IF NOT EXISTS idx_pagamentos_venda ON pagamentos(venda_id);
      CREATE INDEX IF NOT EXISTS idx_nfce_venda ON nfce(venda_id);
      CREATE INDEX IF NOT EXISTS idx_notas_entrada_fornecedor ON notas_entrada(fornecedor_id);
      CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(cpf);
      CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(nome);
      CREATE INDEX IF NOT EXISTS idx_logs_usuario ON logs(usuario_id);
      CREATE INDEX IF NOT EXISTS idx_logs_modulo ON logs(modulo);
      CREATE INDEX IF NOT EXISTS idx_logs_data ON logs(criado_em);
    `);

    // Migracoes additive (ignoram erro se coluna ja existe)
    const migracoes = [
      'ALTER TABLE vendas ADD COLUMN cliente_id INTEGER',
      'ALTER TABLE itens_nota_entrada ADD COLUMN lote_numero TEXT',
      'ALTER TABLE itens_nota_entrada ADD COLUMN lote_fabricacao DATE',
      'ALTER TABLE itens_nota_entrada ADD COLUMN lote_validade DATE',
      'ALTER TABLE itens_venda ADD COLUMN lote_id INTEGER',
      'ALTER TABLE produtos ADD COLUMN ultimo_fornecedor_id INTEGER',
      'ALTER TABLE usuarios ADD COLUMN ultimo_acesso DATETIME',
      'ALTER TABLE usuarios ADD COLUMN token_sessao TEXT',
      'ALTER TABLE usuarios ADD COLUMN sessao_expira DATETIME',
      'ALTER TABLE vendas ADD COLUMN a_prazo INTEGER DEFAULT 0',
      'ALTER TABLE vendas ADD COLUMN vencimento_prazo DATE',
      'ALTER TABLE caixas ADD COLUMN aberto_por_id INTEGER',
      'ALTER TABLE caixas ADD COLUMN fechado_por_id INTEGER',
      'ALTER TABLE caixas ADD COLUMN fechado_por_nome TEXT',
    ];
    for (const sql of migracoes) {
      try { this.db.exec(sql); } catch (e) { /* coluna ja existe */ }
    }

    // Configuracoes padrao
    const configPadrao = [
      ['empresa_razao_social', 'Nome do seu Comercio LTDA', 'Razão social da empresa'],
      ['empresa_nome_fantasia', 'Nome do seu Comercio', 'Nome fantasia'],
      ['empresa_cnpj', '00.000.000/0001-00', 'CNPJ da empresa'],
      ['empresa_ie', '', 'Inscrição estadual'],
      ['empresa_endereco', '', 'Endereço completo'],
      ['empresa_cidade', '', 'Cidade'],
      ['empresa_uf', 'SP', 'Estado'],
      ['empresa_cep', '', 'CEP'],
      ['empresa_telefone', '', 'Telefone'],
      ['nfce_serie', '1', 'Série da NFC-e'],
      ['nfce_ultimo_numero', '0', 'Último número de NFC-e emitida'],
      ['nfce_ambiente', 'homologacao', 'Ambiente SEFAZ'],
      ['nfce_csc_id', '', 'ID do CSC para NFC-e'],
      ['nfce_csc_token', '', 'Token CSC para NFC-e'],
      ['estoque_alerta_dias_validade', '30', 'Dias antes do vencimento para alertar'],
      ['pix_chave', '', 'Chave PIX para recebimentos'],
      ['pix_nome', '', 'Nome do recebedor PIX'],
      ['pix_cidade', '', 'Cidade do recebedor PIX'],
      ['alerta_email_ativo', '0', 'Ativar alertas por email'],
      ['alerta_email_destinatario', '', 'Email para receber alertas'],
      ['alerta_email_smtp_host', '', 'Servidor SMTP (ex: smtp.gmail.com)'],
      ['alerta_email_smtp_porta', '587', 'Porta SMTP'],
      ['alerta_email_smtp_usuario', '', 'Usuario SMTP'],
      ['alerta_email_smtp_senha', '', 'Senha SMTP'],
      ['alerta_whatsapp_ativo', '0', 'Ativar alertas por WhatsApp'],
      ['alerta_whatsapp_webhook', '', 'URL webhook WhatsApp (ex: API Evolution/Z-API)'],
      ['alerta_whatsapp_numero', '', 'Numero WhatsApp destino'],
      ['alerta_intervalo_horas', '24', 'Intervalo entre alertas (horas)'],
      ['codigo_barras_prefixo', '789', 'Prefixo para codigos de barras internos'],
      ['codigo_barras_proximo', '1', 'Proximo numero sequencial para codigo de barras'],
      ['impressora_modelo', '', 'Modelo da impressora termica (bematech/epson/elgin/daruma)'],
      ['impressora_endereco', '', 'Porta/endereco da impressora (ex: COM3 ou 192.168.1.100)'],
      ['impressora_largura', '48', 'Caracteres por linha (48 para 80mm, 32 para 58mm)'],
      ['impressora_auto_cupom', '0', 'Imprimir cupom automaticamente ao finalizar venda'],
      ['sessao_unica', '1', 'Bloquear login simultaneo do mesmo usuario em dispositivos diferentes'],
    ];
    const insertConfig = this.db.prepare('INSERT OR IGNORE INTO configuracoes (chave, valor, descricao) VALUES (?, ?, ?)');
    for (const [chave, valor, descricao] of configPadrao) {
      insertConfig.run(chave, valor, descricao);
    }

    // Usuario admin padrao
    const adminExists = this.db.prepare("SELECT id FROM usuarios WHERE login = 'admin'").get();
    if (!adminExists) {
      const hash = bcrypt.hashSync('admin123', 10);
      this.db.prepare("INSERT INTO usuarios (nome, login, senha, perfil) VALUES ('Administrador', 'admin', ?, 'admin')").run(hash);
    } else {
      this._migrarSenhas();
    }

    const categorias = ['Mercearia', 'Bebidas', 'Frios e Laticínios', 'Carnes', 'Hortifruti', 'Padaria', 'Limpeza', 'Higiene Pessoal', 'Congelados', 'Pet Shop', 'Bazar', 'Outros'];
    const insertCat = this.db.prepare('INSERT OR IGNORE INTO categorias (nome) VALUES (?)');
    for (const cat of categorias) insertCat.run(cat);

    this._seedExemplosFinanceiros();

    this._iniciarBackupAutomatico();
    this._iniciarVerificacaoAlertas();
  }

  _seedExemplosFinanceiros() {
    const totalP = this.db.prepare('SELECT COUNT(*) as c FROM contas_pagar').get().c;
    const totalR = this.db.prepare('SELECT COUNT(*) as c FROM contas_receber').get().c;
    if (totalP > 0 || totalR > 0) return;

    const hoje = new Date();
    const fmt = (offsetDias) => {
      const d = new Date(hoje);
      d.setDate(d.getDate() + offsetDias);
      return d.toISOString().slice(0, 10);
    };

    const insP = this.db.prepare(
      `INSERT INTO contas_pagar (descricao, categoria, valor, vencimento, status, data_pagamento, forma_pagamento, observacoes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insP.run('Aluguel da loja', 'Aluguel', 2500.00, fmt(-3), 'atrasado', null, null, 'Exemplo - vencida');
    insP.run('Conta de energia eletrica', 'Energia', 480.50, fmt(5), 'aberto', null, null, 'Exemplo - vence em 5 dias');
    insP.run('Internet fibra', 'Telecom', 199.90, fmt(15), 'aberto', null, null, 'Exemplo');
    insP.run('Fornecedor Distribuidora ABC', 'Mercadorias', 3450.00, fmt(-12), 'pago', fmt(-10), 'pix', 'Exemplo - paga');
    insP.run('Conta de agua', 'Agua', 145.30, fmt(20), 'aberto', null, null, 'Exemplo');

    const insR = this.db.prepare(
      `INSERT INTO contas_receber (descricao, valor, vencimento, status, data_recebimento, forma_recebimento, observacoes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insR.run('Venda a prazo - Cliente Joao Silva', 320.00, fmt(-5), 'atrasado', null, null, 'Exemplo - atrasada');
    insR.run('Venda a prazo - Cliente Maria Souza', 580.00, fmt(2), 'aberto', null, null, 'Exemplo - vence em 2 dias');
    insR.run('Venda a prazo - Padaria do Bairro', 1200.00, fmt(8), 'aberto', null, null, 'Exemplo');
    insR.run('Venda a prazo - Cliente Pedro', 250.00, fmt(-15), 'recebido', fmt(-14), 'dinheiro', 'Exemplo - recebida');
  }

  _migrarSenhas() {
    const users = this.db.prepare('SELECT id, senha FROM usuarios').all();
    const upd = this.db.prepare('UPDATE usuarios SET senha = ? WHERE id = ?');
    for (const u of users) {
      if (u.senha && !u.senha.startsWith('$2a$') && !u.senha.startsWith('$2b$')) {
        const hash = bcrypt.hashSync(u.senha, 10);
        upd.run(hash, u.id);
      }
    }
  }

  _iniciarBackupAutomatico() {
    const self = this;
    setTimeout(function () { self.fazerBackup(); }, 5000);
    setInterval(function () { self.fazerBackup(); }, 6 * 60 * 60 * 1000);
  }

  async fazerBackup() {
    try {
      const backupDir = path.join(__dirname, '..', '..', 'data', 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

      const agora = new Date();
      const nome = 'backup_' + agora.getFullYear() +
        ('0' + (agora.getMonth() + 1)).slice(-2) +
        ('0' + agora.getDate()).slice(-2) + '_' +
        ('0' + agora.getHours()).slice(-2) +
        ('0' + agora.getMinutes()).slice(-2) +
        ('0' + agora.getSeconds()).slice(-2) + '.db';
      const backupPath = path.join(backupDir, nome);

      await this.db.backup(backupPath);
      const tamanho = fs.statSync(backupPath).size;

      this.db.prepare('INSERT INTO backups (arquivo, tamanho) VALUES (?, ?)').run(nome, tamanho);

      const arquivos = fs.readdirSync(backupDir).filter((f) => f.startsWith('backup_')).sort();
      while (arquivos.length > 20) {
        const antigo = arquivos.shift();
        try { fs.unlinkSync(path.join(backupDir, antigo)); } catch (e) {}
      }

      console.log('[Backup] Salvo: ' + nome + ' (' + (tamanho / 1024).toFixed(1) + ' KB)');
    } catch (e) {
      console.error('[Backup] Erro:', e.message);
    }
  }

  _iniciarVerificacaoAlertas() {
    const self = this;
    setTimeout(function () { self._verificarAlertas(); }, 30000);
    setInterval(function () { self._verificarAlertas(); }, 60 * 60 * 1000);
  }

  async _verificarAlertas() {
    try {
      const getConfig = (chave) => {
        const row = this.db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave);
        return row ? row.valor : '';
      };

      const emailAtivo = getConfig('alerta_email_ativo') === '1';
      const whatsappAtivo = getConfig('alerta_whatsapp_ativo') === '1';
      if (!emailAtivo && !whatsappAtivo) return;

      const intervalo = Number(getConfig('alerta_intervalo_horas')) || 24;

      const ultimo = this.db.prepare('SELECT criado_em FROM alertas_enviados ORDER BY id DESC LIMIT 1').get();
      if (ultimo && ultimo.criado_em) {
        const diff = (Date.now() - new Date(ultimo.criado_em + 'Z').getTime()) / (1000 * 60 * 60);
        if (diff < intervalo) return;
      }

      const produtosBaixos = this.db.prepare(
        'SELECT p.nome, p.estoque_atual, p.estoque_minimo, p.codigo_barras FROM produtos p WHERE p.ativo = 1 AND p.estoque_atual <= p.estoque_minimo AND p.estoque_minimo > 0'
      ).all();

      if (produtosBaixos.length === 0) return;

      const mensagem = this._montarMensagemAlerta(produtosBaixos);

      if (emailAtivo) {
        const emailDest = getConfig('alerta_email_destinatario');
        const smtpHost = getConfig('alerta_email_smtp_host');
        const smtpPorta = getConfig('alerta_email_smtp_porta');
        const smtpUser = getConfig('alerta_email_smtp_usuario');
        const smtpSenha = getConfig('alerta_email_smtp_senha');
        if (emailDest && smtpHost) {
          this._enviarEmail(smtpHost, Number(smtpPorta) || 587, smtpUser, smtpSenha, emailDest, mensagem, produtosBaixos.length);
        }
      }

      if (whatsappAtivo) {
        const webhook = getConfig('alerta_whatsapp_webhook');
        const numero = getConfig('alerta_whatsapp_numero');
        if (webhook && numero) {
          this._enviarWhatsApp(webhook, numero, mensagem);
        }
      }

      this.db.prepare("INSERT INTO alertas_enviados (tipo, canal, detalhes) VALUES ('estoque_baixo', 'auto', ?)").run(
        produtosBaixos.length + ' produtos com estoque baixo'
      );

      console.log('[Alertas] Notificacao enviada: ' + produtosBaixos.length + ' produtos com estoque baixo');
    } catch (e) {
      console.error('[Alertas] Erro:', e.message);
    }
  }

  _montarMensagemAlerta(produtos) {
    const nomeRow = this.db.prepare("SELECT valor FROM configuracoes WHERE chave = 'empresa_nome_fantasia'").get();
    const nome = (nomeRow && nomeRow.valor) || 'Meu Comercio';
    let msg = '⚠️ ALERTA DE ESTOQUE BAIXO - ' + nome + '\n';
    msg += '━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += produtos.length + ' produto(s) com estoque abaixo do mínimo:\n\n';
    produtos.forEach(function (p) {
      msg += '• ' + p.nome + '\n';
      msg += '  Estoque: ' + p.estoque_atual + ' | Mínimo: ' + p.estoque_minimo + '\n';
      msg += '  Faltam: ' + (p.estoque_minimo - p.estoque_atual) + ' unidades\n\n';
    });
    msg += '━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += 'Data: ' + new Date().toLocaleString('pt-BR') + '\n';
    msg += 'Sistema ' + nome;
    return msg;
  }

  async _enviarEmail(host, porta, user, senha, dest, mensagem, qtdProdutos) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: host, port: porta, secure: porta === 465,
        auth: user ? { user: user, pass: senha } : undefined,
      });
      await transporter.sendMail({
        from: user || 'sistema@sistema.local',
        to: dest,
        subject: '⚠️ Alerta: ' + qtdProdutos + ' produto(s) com estoque baixo',
        text: mensagem,
      });
      console.log('[Alertas] Email enviado para ' + dest);
    } catch (e) {
      console.error('[Alertas] Erro ao enviar email:', e.message);
    }
  }

  async _enviarWhatsApp(webhook, numero, mensagem) {
    try {
      const http = require(webhook.startsWith('https') ? 'https' : 'http');
      const url = new URL(webhook);
      const body = JSON.stringify({ number: numero, text: mensagem });
      const opts = {
        hostname: url.hostname, port: url.port, path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      };
      const req = http.request(opts, (res) => {
        console.log('[Alertas] WhatsApp webhook respondeu: ' + res.statusCode);
      });
      req.on('error', (e) => console.error('[Alertas] Erro WhatsApp:', e.message));
      req.write(body); req.end();
    } catch (e) {
      console.error('[Alertas] Erro ao enviar WhatsApp:', e.message);
    }
  }
}

const dbWrapper = new DatabaseWrapper();
const dbReady = dbWrapper.init();

module.exports = { dbWrapper, dbReady };
