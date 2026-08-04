const subscriptionRules = {
  free: {
    dailyLimit: 1,
    canChooseCategory: false,
    price: 0,
    displayName: 'Free',
  },
  subscriber: {
    dailyLimit: null, // Unlimited for Premium subscribers
    canChooseCategory: true,
    price: 4.99,
    displayName: 'Premium',
  },
};

export default subscriptionRules;