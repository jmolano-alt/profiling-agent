// routes/taskHandler.js
const rocketReachService = require('../services/rocketreach');
const inteliusService = require('../services/intelius');

async function executeTask(task, parameters) {
  console.log(`Executing task: ${task}`);

  switch (task) {
    case 'lookup': {
      const startedAt = Date.now();
      const errors = [];

      // ✅ RocketReach CONGELADO: no se llama (evita captcha y ruido)
      const rrPromise = Promise.resolve({
        skipped: true,
        social_links: {},
        debug: { stage: 'skipped' },
      });

      const [rrRes, locRes, socialRes, assetsRes] = await Promise.allSettled([
        rrPromise,
        inteliusService.findLocation(parameters),
        inteliusService.findSocialLinks(parameters),
        inteliusService.findAssets(parameters),
      ]);

      const pick = (res, source, fallback) => {
        if (res.status === 'fulfilled') return res.value;
        errors.push({ source, message: res.reason?.message || String(res.reason) });
        return fallback;
      };

      const rrRaw = pick(rrRes, 'rocketreach_social', {});
      const rocketreach = (rrRaw && typeof rrRaw === 'object') ? rrRaw : {};

      const location = pick(locRes, 'intelius_first_location', {});
      const social_links = pick(socialRes, 'intelius_social_links', {});
      const assets = pick(assetsRes, 'intelius_assets', { assets: [] });

      // Debug simple (evidencia de qué falló sin meterlo dentro de location)
      const intelius_debug = {
        location: locRes.status === 'fulfilled' ? { ok: true } : { ok: false, error: pick(locRes, 'intelius_first_location', null) ? '' : 'failed' },
        social: socialRes.status === 'fulfilled' ? { ok: true } : { ok: false, error: 'failed' },
        assets: assetsRes.status === 'fulfilled' ? { ok: true } : { ok: false, error: 'failed' },
      };

      return {
        rocketreach,
        intelius: { location, social_links, assets, debug: intelius_debug },
        errors,
        timing: { ms: Date.now() - startedAt },
      };
    }

    // (Opcional) mantenemos tasks individuales por si luego reactivas RR
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

