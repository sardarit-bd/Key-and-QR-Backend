import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Quote from './src/modules/quote/quote.model.js';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB!");

  const quotes = await Quote.find({ editorData: { $ne: null } });
  console.log(`Found ${quotes.length} quotes with editorData:`);

  for (const q of quotes) {
    console.log(`Quote ID: ${q._id}, Text: "${q.text}"`);
    console.log("Editor Data:", JSON.stringify(q.editorData, null, 2));
    console.log("-----------------------------------------");
  }

  await mongoose.disconnect();
}

run().catch(console.error);
