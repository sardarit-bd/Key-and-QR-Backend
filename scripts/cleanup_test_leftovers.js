import connectDB from '../src/config/database.js';
import Quote from '../src/modules/quote/quote.model.js';
import QuoteAssignment from '../src/modules/quoteAssignment/quoteAssignment.model.js';
import mongoose from 'mongoose';

async function cleanupLeftovers() {
  await connectDB();
  console.log('Finding and removing leftover test quotes...');
  
  const allQuotes = await Quote.find({});
  const toDelete = [];
  
  for (const q of allQuotes) {
    const qStr = JSON.stringify(q);
    if (qStr.includes('artwork_only') || qStr.includes('art2.jpg') || qStr.includes('res.cloudinary.com/demo')) {
      toDelete.push(q._id);
    }
  }
  
  if (toDelete.length > 0) {
    console.log(`Deleting ${toDelete.length} leftover test quote(s):`, toDelete);
    await Quote.deleteMany({ _id: { $in: toDelete } });
    await QuoteAssignment.deleteMany({ quote: { $in: toDelete } });
  } else {
    console.log('No leftover test quotes found.');
  }
  
  await mongoose.disconnect();
  console.log('Cleanup finished.');
}

cleanupLeftovers();
