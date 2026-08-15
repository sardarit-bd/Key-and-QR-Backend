import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Quote from './src/modules/quote/quote.model.js';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB!");

  // Delete existing quotes if any
  await Quote.deleteMany({});
  console.log("Cleared existing quotes.");

  // Create a new quote
  const quote = await Quote.create({
    text: "Life is what happens when you're busy making other plans.",
    author: "John Lennon",
    category: "positivity",
    isActive: true,
    allowReuse: true,
    image: {
      public_id: "test_image",
      url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800"
    },
    editorData: null
  });

  console.log("Created quote:", quote._id);
  await mongoose.disconnect();
}

run().catch(console.error);
