const browserHelper = require('../utils/browserHelper');

async function findLocation(parameters) {
  const { name, phone, email } = parameters;

  console.log(`[Intelius] findLocation called for: ${name || ''} ${phone || ''}`);

  // MVP: no scraping real todavía
  // Devolvemos vacío real
  return {};
}

async function findSocialLinks(parameters) {
  const { name, phone, email } = parameters;

  console.log(`[Intelius] findSocialLinks called for: ${name || ''} ${phone || ''}`);

  // MVP: sin scraping real
  return {
    social_profiles: []
  };
}

async function findAssets(parameters) {
  const { name, last_name } = parameters;

  console.log(`[Intelius] findAssets called for: ${name || ''}`);

  // MVP: sin scraping real
  return {
    assets: []
  };
}

module.exports = {
  findLocation,
  findSocialLinks,
  findAssets
};
