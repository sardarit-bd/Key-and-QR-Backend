import Hero from "./hero.model.js";

const getHeroContent = async () => {
  let hero = await Hero.findOne().populate("updatedBy", "name email");
  if (!hero) {
    // Create default hero content
    hero = await Hero.create({
      title: "Create Your Story in a Keychain",
      subtitle: "Every keychain carries a hidden message of hope, love, or joy — revealed only when scanned.",
      buttonText: "Start Your Story Now",
      secondaryButtonText: "How It Works",
      steps: [
        {
          title: "Choose Your Keychain",
          description: "Select from our premium collection and add an optional gift message.",
          icon: "ShoppingBag",
          bgColor: "bg-blue-100",
          iconColor: "text-blue-600",
        },
        {
          title: "Receive Your QR Code",
          description: "Get a unique QR code instantly after purchase, engraved on your keychain.",
          icon: "QrCode",
          bgColor: "bg-purple-100",
          iconColor: "text-purple-600",
        },
        {
          title: "Scan & Be Inspired",
          description: "Scan the QR code anytime to reveal your personalized motivational quote.",
          icon: "Scan",
          bgColor: "bg-green-100",
          iconColor: "text-green-600",
        },
      ],
    });
  }
  return hero;
};

const updateHeroContent = async (id, payload, userId) => {
  return Hero.findByIdAndUpdate(
    id,
    { ...payload, updatedBy: userId },
    { new: true, runValidators: true }
  );
};

export default {
  getHeroContent,
  updateHeroContent,
};