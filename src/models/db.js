// Helper que exporta o dbWrapper diretamente
// As rotas são registradas APÓS o dbReady resolver, então é seguro acessar
const { dbWrapper } = require('./database');
module.exports = dbWrapper;
