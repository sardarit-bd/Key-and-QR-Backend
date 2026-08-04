const subscriptionRules = {
  free: {
    dailyLimit: 1,
    canChooseCategory: false,
  },
  subscriber: {
    dailyLimit: null, // Unlimited for Premium subscribers
    canChooseCategory: true,
  },
};

export default subscriptionRules;