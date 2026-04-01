import subscriptionRules from "./subscription.config.js";

const getRules = (subscriptionType) => {
  return subscriptionRules[subscriptionType] || subscriptionRules.free;
};

export default {
  getRules,
};