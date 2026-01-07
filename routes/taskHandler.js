// routes/taskHandler.js

const rocketReachService = require('../services/rocketreach');
const inteliusService = require('../services/intelius');

async function executeTask(task, parameters) {
  console.log(`Executing task: ${task}`);

  switch (task) {
    case 'lookup': {
      const startedAt = Date.now();
      const errors = [];

      // Ejecutamos en paralelo (con Promise.allSettled para no romper el flujo)
      const [rrRes, locRes, socialRes, assetsRes] = await Promise.allSettled([
        rocketReachService.findSocialProfiles(parameters),
        inteliusService.findLocation(parameters),
        inteliusService.findSocialLinks(parameters),
        inteliusService.findAssets(parameters),
      ]);

      // Helper para manejar errores sin romper
      const pick = (res, source, fallback) => {
        if (res.status === 'fulfilled') return res.value;
        errors.push({
          source,
          message: res.reason?.message || String(res.reason),
        });
        return fallback;
      };

      // Resultados
      const rrRaw = pick(rrRes, 'rocketreach_social', {});
      const rocketreach =
        rrRaw && typeof rrRaw === 'object' ? rrRaw : {};

      const location = pick(locRes, 'intelius_first_location', {});
      const social_links = pick(socialRes, 'intelius_social_links', []);
      const assets = pick(assetsRes, 'intelius_assets', []);

      // ⬅️ CLAVE: NO envuelvas rocketreach, pásalo completo (incluye debug)
      return {
        rocketreach,
        intelius: {
          location,
          social_links,
          assets,
        },
        errors,
        timing: {
          ms: Date.now() - startedAt,
        },
      };
    }

    // Tasks individuales (útiles para debug o llamadas directas)
    case 'rocketreach_social':
      return await rocketReachService.findSocialProfiles(parameters);

    case 'intelius_first_location':
      return await inteliusService.findLocation(parameters);

    case 'intelius_social_links':
      return await inteliusService.findSocialLinks(parameters);

    case 'intelius_assets':
      return await inteliusService.findAssets(parameters);

    default:
      throw new Error(`Unknown task type: ${task}`);
  }
}

module.exports = { executeTask };

