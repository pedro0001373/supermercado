const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function carregarSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  const dataDir = path.join(__dirname, '..', '..', 'data');
  const secretFile = path.join(dataDir, '.jwt_secret');
  try {
    if (fs.existsSync(secretFile)) {
      return fs.readFileSync(secretFile, 'utf8').trim();
    }
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const novo = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(secretFile, novo, { mode: 0o600 });
    return novo;
  } catch (e) {
    console.warn('[JWT] Nao foi possivel persistir secret, usando em memoria:', e.message);
    return crypto.randomBytes(64).toString('hex');
  }
}

const SECRET = carregarSecret();
const EXPIRACAO = process.env.JWT_EXPIRES || '1d';

function gerarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, nome: usuario.nome, login: usuario.login, perfil: usuario.perfil },
    SECRET,
    { expiresIn: EXPIRACAO }
  );
}

function verificarToken(token) {
  return jwt.verify(token, SECRET);
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token nao fornecido' });
  }
  const token = authHeader.substring(7).trim();
  try {
    req.user = verificarToken(token);

    try {
      const db = require('../models/db');
      const cfg = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'sessao_unica'").get();
      if (!cfg || cfg.valor === '1') {
        const user = db.prepare('SELECT token_sessao FROM usuarios WHERE id = ?').get(req.user.id);
        if (!user) return res.status(401).json({ error: 'Usuario nao encontrado' });
        if (!user.token_sessao || user.token_sessao !== token) {
          return res.status(401).json({ error: 'Sessao invalidada. Faca login novamente.' });
        }
      }
    } catch (e) {}

    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Sessao expirada' : 'Token invalido';
    return res.status(401).json({ error: msg });
  }
}

function requirePerfil(...perfisPermitidos) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Nao autenticado' });
    if (!perfisPermitidos.includes(req.user.perfil)) {
      return res.status(403).json({ error: 'Permissao insuficiente' });
    }
    next();
  };
}

module.exports = { authMiddleware, requirePerfil, gerarToken, verificarToken, SECRET, EXPIRACAO };
