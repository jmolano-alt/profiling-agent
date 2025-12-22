const rocketReachService = require('../services/rocketreach');
const inteliusService = require('../services/intelius');

async function executeTask(task, parameters) {
  console.log(`Executing task: ${task}`);
  
  switch (task) {
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