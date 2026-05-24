const { cpf, cnpj } = require('cpf-cnpj-validator');

class ValidationError extends Error {
  constructor(message, fields) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.fields = fields || {};
  }
}

function isEmpty(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function req(obj, campos) {
  const faltando = {};
  campos.forEach(function (c) {
    if (isEmpty(obj[c])) faltando[c] = 'Campo obrigatorio';
  });
  if (Object.keys(faltando).length) {
    throw new ValidationError('Campos obrigatorios ausentes', faltando);
  }
}

function strLen(valor, campo, min, max) {
  if (valor === null || valor === undefined) return;
  const s = String(valor);
  if (min != null && s.length < min) {
    throw new ValidationError('Valor invalido em ' + campo, { [campo]: 'Minimo de ' + min + ' caracteres' });
  }
  if (max != null && s.length > max) {
    throw new ValidationError('Valor invalido em ' + campo, { [campo]: 'Maximo de ' + max + ' caracteres' });
  }
}

function num(valor, campo, opts) {
  opts = opts || {};
  if (isEmpty(valor)) {
    if (opts.obrigatorio) throw new ValidationError('Campo obrigatorio', { [campo]: 'Obrigatorio' });
    return null;
  }
  const n = Number(valor);
  if (!isFinite(n)) throw new ValidationError('Valor numerico invalido', { [campo]: 'Nao e um numero' });
  if (opts.min != null && n < opts.min) throw new ValidationError('Valor fora do intervalo', { [campo]: 'Minimo: ' + opts.min });
  if (opts.max != null && n > opts.max) throw new ValidationError('Valor fora do intervalo', { [campo]: 'Maximo: ' + opts.max });
  if (opts.inteiro && !Number.isInteger(n)) throw new ValidationError('Valor deve ser inteiro', { [campo]: 'Deve ser inteiro' });
  return n;
}

function email(valor, campo, opts) {
  opts = opts || {};
  if (isEmpty(valor)) {
    if (opts.obrigatorio) throw new ValidationError('Email obrigatorio', { [campo]: 'Obrigatorio' });
    return null;
  }
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(String(valor).trim())) {
    throw new ValidationError('Email invalido', { [campo]: 'Formato invalido' });
  }
  return String(valor).trim();
}

function cpfValid(valor, campo, opts) {
  opts = opts || {};
  if (isEmpty(valor)) {
    if (opts.obrigatorio) throw new ValidationError('CPF obrigatorio', { [campo]: 'Obrigatorio' });
    return null;
  }
  const limpo = String(valor).replace(/\D/g, '');
  if (!cpf.isValid(limpo)) throw new ValidationError('CPF invalido', { [campo]: 'CPF nao passou na validacao' });
  return limpo;
}

function cnpjValid(valor, campo, opts) {
  opts = opts || {};
  if (isEmpty(valor)) {
    if (opts.obrigatorio) throw new ValidationError('CNPJ obrigatorio', { [campo]: 'Obrigatorio' });
    return null;
  }
  const limpo = String(valor).replace(/\D/g, '');
  if (!cnpj.isValid(limpo)) throw new ValidationError('CNPJ invalido', { [campo]: 'CNPJ nao passou na validacao' });
  return limpo;
}

function cpfOuCnpj(valor, campo, opts) {
  opts = opts || {};
  if (isEmpty(valor)) {
    if (opts.obrigatorio) throw new ValidationError('CPF/CNPJ obrigatorio', { [campo]: 'Obrigatorio' });
    return null;
  }
  const limpo = String(valor).replace(/\D/g, '');
  if (limpo.length === 11) {
    if (!cpf.isValid(limpo)) throw new ValidationError('CPF invalido', { [campo]: 'CPF invalido' });
  } else if (limpo.length === 14) {
    if (!cnpj.isValid(limpo)) throw new ValidationError('CNPJ invalido', { [campo]: 'CNPJ invalido' });
  } else {
    throw new ValidationError('Documento invalido', { [campo]: 'Deve ter 11 (CPF) ou 14 (CNPJ) digitos' });
  }
  return limpo;
}

function data(valor, campo, opts) {
  opts = opts || {};
  if (isEmpty(valor)) {
    if (opts.obrigatorio) throw new ValidationError('Data obrigatoria', { [campo]: 'Obrigatoria' });
    return null;
  }
  const d = new Date(valor);
  if (isNaN(d.getTime())) throw new ValidationError('Data invalida', { [campo]: 'Formato de data invalido' });
  return d;
}

function oneOf(valor, campo, permitidos, opts) {
  opts = opts || {};
  if (isEmpty(valor)) {
    if (opts.obrigatorio) throw new ValidationError('Valor obrigatorio', { [campo]: 'Obrigatorio' });
    return null;
  }
  if (permitidos.indexOf(valor) === -1) {
    throw new ValidationError('Valor nao permitido em ' + campo, { [campo]: 'Deve ser um dos: ' + permitidos.join(', ') });
  }
  return valor;
}

module.exports = {
  ValidationError,
  isEmpty,
  req,
  strLen,
  num,
  email,
  cpf: cpfValid,
  cnpj: cnpjValid,
  cpfOuCnpj,
  data,
  oneOf,
};
