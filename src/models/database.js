const initSqlJs = require('sql.js');
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
    ];
    for (const [chave, valor, descricao] of configPadrao) {
      this.db.run('INSERT OR IGNORE INTO configuracoes (chave, valor, descricao) VALUES (?, ?, ?)', [chave, valor, descricao]);
    }

    // Usuário admin padrão
    this.db.run("INSERT OR IGNORE INTO usuarios (nome, login, senha, perfil) VALUES ('Administrador', 'admin', 'admin123', 'admin')");

    // Categorias padrão
    const categorias = ['Mercearia', 'Bebidas', 'Frios e Laticínios', 'Carnes', 'Hortifruti', 'Padaria', 'Limpeza', 'Higiene Pessoal', 'Congelados', 'Pet Shop', 'Bazar', 'Outros'];
    for (const cat of categorias) {
      this.db.run('INSERT OR IGNORE INTO categorias (nome) VALUES (?)', [cat]);
    }

    this.save();
  }
}

// Singleton - exporta uma promise que resolve com o db wrapper
const dbWrapper = new DatabaseWrapper();
const dbReady = dbWrapper.init();

// Exporta o wrapper (as rotas precisam esperar o db estar pronto)
module.exports = { dbWrapper, dbReady };
