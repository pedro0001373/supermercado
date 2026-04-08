const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', '..', 'data', 'supermercado.db');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Wrapper para manter compatibilidade com a API do better-sqlite3
class DatabaseWrapper {
  constructor() {
    this.db = null;
    this.ready = false;
    this._saveTimer = null;
  }

  async init() {
    const SQL = await initSqlJs();
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }
    this.db.run('PRAGMA foreign_keys = ON');
    this.ready = true;
    this._createTables();
    this.save();
    return this;
  }

  save() {
    if (!this.db) return;
    // Debounce saves
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
      } catch (e) {
        console.error('Erro ao salvar banco:', e.message);
      }
    }, 100);
  }

  saveSync() {
    if (!this.db) return;
    const data = this.db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
  }

  exec(sql) {
    this.db.run(sql);
    this.save();
  }

  // Sanitiza parâmetros: converte undefined para null
  _sanitize(params) {
    return params.map(p => p === undefined ? null : p);
  }

  // Compatível com better-sqlite3 prepare().run()
  prepare(sql) {
    const self = this;
    return {
      run(...params) {
        const clean = self._sanitize(params);
        if (clean.length > 0) {
          self.db.run(sql, clean);
        } else {
          self.db.run(sql);
        }
        self.save();
        const lastId = self.db.exec('SELECT last_insert_rowid() as id')[0]?.values[0][0] || 0;
        const changes = self.db.getRowsModified();
        return { lastInsertRowid: lastId, changes };
      },
      get(...params) {
        const clean = self._sanitize(params);
        const stmt = self.db.prepare(sql);
        if (clean.length > 0) stmt.bind(clean);
        if (stmt.step()) {
          const cols = stmt.getColumnNames();
          const vals = stmt.get();
          stmt.free();
          const row = {};
          cols.forEach((c, i) => row[c] = vals[i]);
          return row;
        }
        stmt.free();
        return undefined;
      },
      all(...params) {
        const results = [];
        const clean = self._sanitize(params);
        const stmt = self.db.prepare(sql);
        if (clean.length > 0) stmt.bind(clean);
        while (stmt.step()) {
          const cols = stmt.getColumnNames();
          const vals = stmt.get();
          const row = {};
          cols.forEach((c, i) => row[c] = vals[i]);
          results.push(row);
        }
        stmt.free();
        return results;
      }
    };
  }

  // Transações
  transaction(fn) {
    const self = this;
    return function (...args) {
      self.db.run('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        self.db.run('COMMIT');
        self.save();
        return result;
      } catch (e) {
        self.db.run('ROLLBACK');
        throw e;
      }
    };
  }

  _createTables() {
    this.db.run(`
      -- FORNECEDORES
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
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL UNIQUE,
        descricao TEXT,
        ativo INTEGER DEFAULT 1
      );
    `);
    this.db.run(`
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
    `);
    this.db.run(`
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
    `);
    this.db.run(`
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
    `);
    this.db.run(`
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
    `);
    this.db.run(`
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
    `);
    this.db.run(`
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
    `);
    this.db.run(`
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
    `);
    this.db.run(`
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
    `);
    this.db.run(`
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
    `);
    this.db.run(`
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
    `);
    this.db.run(`
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
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS configuracoes (
        chave TEXT PRIMARY KEY,
        valor TEXT,
        descricao TEXT
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        login TEXT UNIQUE NOT NULL,
        senha TEXT NOT NULL,
        perfil TEXT DEFAULT 'operador',
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Índices
    const indices = [
      'CREATE INDEX IF NOT EXISTS idx_produtos_codigo_barras ON produtos(codigo_barras)',
      'CREATE INDEX IF NOT EXISTS idx_produtos_nome ON produtos(nome)',
      'CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos(categoria_id)',
      'CREATE INDEX IF NOT EXISTS idx_lotes_produto ON lotes(produto_id)',
      'CREATE INDEX IF NOT EXISTS idx_lotes_validade ON lotes(data_validade)',
      'CREATE INDEX IF NOT EXISTS idx_movimentacoes_produto ON movimentacoes_estoque(produto_id)',
      'CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas(criado_em)',
      'CREATE INDEX IF NOT EXISTS idx_vendas_caixa ON vendas(caixa_id)',
      'CREATE INDEX IF NOT EXISTS idx_itens_venda ON itens_venda(venda_id)',
      'CREATE INDEX IF NOT EXISTS idx_pagamentos_venda ON pagamentos(venda_id)',
      'CREATE INDEX IF NOT EXISTS idx_nfce_venda ON nfce(venda_id)',
      'CREATE INDEX IF NOT EXISTS idx_notas_entrada_fornecedor ON notas_entrada(fornecedor_id)'
    ];
    indices.forEach(sql => this.db.run(sql));

    // Configurações padrão
    const configPadrao = [
      ['empresa_razao_social', 'Supermercado Peres LTDA', 'Razão social da empresa'],
      ['empresa_nome_fantasia', 'Supermercado Peres', 'Nome fantasia'],
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
      ['pix_nome', 'Supermercado Peres', 'Nome do recebedor PIX'],
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
    ];
    for (const [chave, valor, descricao] of configPadrao) {
      this.db.run('INSERT OR IGNORE INTO configuracoes (chave, valor, descricao) VALUES (?, ?, ?)', [chave, valor, descricao]);
    }

    // Tabela de clientes fidelidade
    this.db.run(`
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
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_clientes_cpf ON clientes(cpf)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(nome)');

    // Adicionar cliente_id na tabela vendas se nao existir
    try { this.db.run('ALTER TABLE vendas ADD COLUMN cliente_id INTEGER'); } catch(e) {}

    // Tabela de logs de auditoria
    this.db.run(`
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
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_logs_usuario ON logs(usuario_id)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_logs_modulo ON logs(modulo)');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_logs_data ON logs(criado_em)');

    // Tabela de backups
    this.db.run(`
      CREATE TABLE IF NOT EXISTS backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        arquivo TEXT NOT NULL,
        tamanho INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tabela de pedidos de compra
    this.db.run(`
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
    `);
    this.db.run(`
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
    `);

    // Tabela de alertas enviados (evitar duplicatas)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS alertas_enviados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL,
        produto_id INTEGER,
        canal TEXT NOT NULL,
        detalhes TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (produto_id) REFERENCES produtos(id)
      );
    `);

    // Adicionar coluna numero_lote em itens_nota_entrada se nao existir
    try { this.db.run('ALTER TABLE itens_nota_entrada ADD COLUMN lote_numero TEXT'); } catch(e) {}
    try { this.db.run('ALTER TABLE itens_nota_entrada ADD COLUMN lote_fabricacao DATE'); } catch(e) {}
    try { this.db.run('ALTER TABLE itens_nota_entrada ADD COLUMN lote_validade DATE'); } catch(e) {}

    // Adicionar coluna lote_id em itens_venda se nao existir
    try { this.db.run('ALTER TABLE itens_venda ADD COLUMN lote_id INTEGER'); } catch(e) {}

    // Adicionar coluna ultimo_fornecedor_id em produtos se nao existir
    try { this.db.run('ALTER TABLE produtos ADD COLUMN ultimo_fornecedor_id INTEGER'); } catch(e) {}

    // Adicionar coluna ultimo_acesso em usuarios se nao existir
    try { this.db.run('ALTER TABLE usuarios ADD COLUMN ultimo_acesso DATETIME'); } catch(e) {}

    // Usuário admin padrão com senha hash
    const adminExists = this.db.exec("SELECT id FROM usuarios WHERE login='admin'");
    if (!adminExists.length || !adminExists[0].values.length) {
      const hash = bcrypt.hashSync('admin123', 10);
      this.db.run("INSERT INTO usuarios (nome, login, senha, perfil) VALUES ('Administrador', 'admin', ?, 'admin')", [hash]);
    } else {
      // Migrar senhas em texto puro para hash
      this._migrarSenhas();
    }

    // Categorias padrão
    const categorias = ['Mercearia', 'Bebidas', 'Frios e Laticínios', 'Carnes', 'Hortifruti', 'Padaria', 'Limpeza', 'Higiene Pessoal', 'Congelados', 'Pet Shop', 'Bazar', 'Outros'];
    for (const cat of categorias) {
      this.db.run('INSERT OR IGNORE INTO categorias (nome) VALUES (?)', [cat]);
    }

    this.save();
    this._iniciarBackupAutomatico();
    this._iniciarVerificacaoAlertas();
  }

  // Migrar senhas em texto puro para bcrypt hash
  _migrarSenhas() {
    const stmt = this.db.prepare('SELECT id, senha FROM usuarios');
    const users = [];
    while (stmt.step()) {
      const cols = stmt.getColumnNames();
      const vals = stmt.get();
      users.push({ id: vals[0], senha: vals[1] });
    }
    stmt.free();
    for (const u of users) {
      // Se a senha nao comeca com $2a$ ou $2b$, e texto puro
      if (u.senha && !u.senha.startsWith('$2a$') && !u.senha.startsWith('$2b$')) {
        const hash = bcrypt.hashSync(u.senha, 10);
        this.db.run('UPDATE usuarios SET senha = ? WHERE id = ?', [hash, u.id]);
      }
    }
  }

  // Backup automatico a cada 6 horas
  _iniciarBackupAutomatico() {
    const self = this;
    // Backup inicial ao iniciar
    setTimeout(function() { self.fazerBackup(); }, 5000);
    // Backup a cada 6 horas
    setInterval(function() { self.fazerBackup(); }, 6 * 60 * 60 * 1000);
  }

  fazerBackup() {
    try {
      const backupDir = path.join(__dirname, '..', '..', 'data', 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

      const agora = new Date();
      const nome = 'backup_' + agora.getFullYear() +
        ('0' + (agora.getMonth()+1)).slice(-2) +
        ('0' + agora.getDate()).slice(-2) + '_' +
        ('0' + agora.getHours()).slice(-2) +
        ('0' + agora.getMinutes()).slice(-2) +
        ('0' + agora.getSeconds()).slice(-2) + '.db';
      const backupPath = path.join(backupDir, nome);

      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(backupPath, buffer);

      // Registrar backup
      this.db.run('INSERT INTO backups (arquivo, tamanho) VALUES (?, ?)', [nome, buffer.length]);

      // Manter apenas os ultimos 20 backups
      const arquivos = fs.readdirSync(backupDir).filter(f => f.startsWith('backup_')).sort();
      while (arquivos.length > 20) {
        const antigo = arquivos.shift();
        try { fs.unlinkSync(path.join(backupDir, antigo)); } catch(e) {}
      }

      console.log('[Backup] Salvo: ' + nome + ' (' + (buffer.length / 1024).toFixed(1) + ' KB)');
      this.save();
    } catch(e) {
      console.error('[Backup] Erro:', e.message);
    }
  }
  // Verificar alertas de estoque periodicamente
  _iniciarVerificacaoAlertas() {
    const self = this;
    // Primeira verificação após 30 segundos
    setTimeout(function() { self._verificarAlertas(); }, 30000);
    // Verificar a cada 1 hora
    setInterval(function() { self._verificarAlertas(); }, 60 * 60 * 1000);
  }

  async _verificarAlertas() {
    try {
      // Buscar configurações
      const getConfig = (chave) => {
        const row = this.db.exec("SELECT valor FROM configuracoes WHERE chave = '" + chave + "'");
        return row.length && row[0].values.length ? row[0].values[0][0] : '';
      };

      const emailAtivo = getConfig('alerta_email_ativo') === '1';
      const whatsappAtivo = getConfig('alerta_whatsapp_ativo') === '1';
      if (!emailAtivo && !whatsappAtivo) return;

      const intervalo = Number(getConfig('alerta_intervalo_horas')) || 24;

      // Verificar último alerta enviado
      const stmt = this.db.prepare("SELECT criado_em FROM alertas_enviados ORDER BY id DESC LIMIT 1");
      let ultimoAlerta = null;
      if (stmt.step()) { ultimoAlerta = stmt.get()[0]; }
      stmt.free();

      if (ultimoAlerta) {
        const diff = (Date.now() - new Date(ultimoAlerta + 'Z').getTime()) / (1000 * 60 * 60);
        if (diff < intervalo) return;
      }

      // Buscar produtos com estoque baixo
      const stmtProd = this.db.prepare(
        "SELECT p.nome, p.estoque_atual, p.estoque_minimo, p.codigo_barras FROM produtos p WHERE p.ativo = 1 AND p.estoque_atual <= p.estoque_minimo AND p.estoque_minimo > 0"
      );
      const produtosBaixos = [];
      while (stmtProd.step()) {
        const cols = stmtProd.getColumnNames();
        const vals = stmtProd.get();
        const row = {};
        cols.forEach((c, i) => row[c] = vals[i]);
        produtosBaixos.push(row);
      }
      stmtProd.free();

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

      // Registrar alerta enviado
      this.db.run("INSERT INTO alertas_enviados (tipo, canal, detalhes) VALUES ('estoque_baixo', 'auto', ?)",
        [produtosBaixos.length + ' produtos com estoque baixo']);
      this.save();

      console.log('[Alertas] Notificacao enviada: ' + produtosBaixos.length + ' produtos com estoque baixo');
    } catch(e) {
      console.error('[Alertas] Erro:', e.message);
    }
  }

  _montarMensagemAlerta(produtos) {
    let msg = '⚠️ ALERTA DE ESTOQUE BAIXO - Supermercado Peres\n';
    msg += '━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += produtos.length + ' produto(s) com estoque abaixo do mínimo:\n\n';
    produtos.forEach(function(p) {
      msg += '• ' + p.nome + '\n';
      msg += '  Estoque: ' + p.estoque_atual + ' | Mínimo: ' + p.estoque_minimo + '\n';
      msg += '  Faltam: ' + (p.estoque_minimo - p.estoque_atual) + ' unidades\n\n';
    });
    msg += '━━━━━━━━━━━━━━━━━━━━━━━\n';
    msg += 'Data: ' + new Date().toLocaleString('pt-BR') + '\n';
    msg += 'Sistema Supermercado Peres';
    return msg;
  }

  async _enviarEmail(host, porta, user, senha, dest, mensagem, qtdProdutos) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: host, port: porta, secure: porta === 465,
        auth: user ? { user: user, pass: senha } : undefined
      });
      await transporter.sendMail({
        from: user || 'sistema@supermercadoperes.com',
        to: dest,
        subject: '⚠️ Alerta: ' + qtdProdutos + ' produto(s) com estoque baixo',
        text: mensagem
      });
      console.log('[Alertas] Email enviado para ' + dest);
    } catch(e) {
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
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      };
      const req = http.request(opts, (res) => {
        console.log('[Alertas] WhatsApp webhook respondeu: ' + res.statusCode);
      });
      req.on('error', (e) => console.error('[Alertas] Erro WhatsApp:', e.message));
      req.write(body); req.end();
    } catch(e) {
      console.error('[Alertas] Erro ao enviar WhatsApp:', e.message);
    }
  }
}

// Singleton - exporta uma promise que resolve com o db wrapper
const dbWrapper = new DatabaseWrapper();
const dbReady = dbWrapper.init();

// Exporta o wrapper (as rotas precisam esperar o db estar pronto)
module.exports = { dbWrapper, dbReady };
