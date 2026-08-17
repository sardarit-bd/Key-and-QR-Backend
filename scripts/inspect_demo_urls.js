import connectDB from '../src/config/database.js';
import Quote from '../src/modules/quote/quote.model.js';
import mongoose from 'mongoose';

async function check() {
  await connectDB();
  const allQuotes = await Quote.find({});
  console.log('Total quotes in DB:', allQuotes.length);
  
  for (const q of allQuotes) {
    const qStr = JSON.stringify(q);
    if (qStr.includes('artwork_only') || qStr.includes('art2.jpg') || qStr.includes('res.cloudinary.com/demo')) {
      console.log('Found quote with demo url:', q._id, q.text, q.category);
    }
  }
  await mongoose.disconnect();
}
check();
