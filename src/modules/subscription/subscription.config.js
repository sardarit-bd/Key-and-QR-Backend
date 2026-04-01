const subscriptionRules = {
  free: {
    dailyLimit: 1,
    canChooseCategory: false,
  },
  subscriber: {
    dailyLimit: 3,
    canChooseCategory: true,
  },
};

export default subscriptionRules;