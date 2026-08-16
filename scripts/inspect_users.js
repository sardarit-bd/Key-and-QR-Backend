import connectDB from "../src/config/database.js";
import User from "../src/models/user.model.js";
import Quote from "../src/modules/quote/quote.model.js";
import Tag from "../src/modules/tag/tag.model.js";
import QuoteAssignment from "../src/modules/quoteAssignment/quoteAssignment.model.js";

async function inspect() {
  await connectDB();
  console.log("Connected to DB");

  const users = await User.find({ isDeleted: false }).select("name email role createdAt").lean();
  console.log(`Total active users: ${users.length}`);
  users.forEach((u, i) => {
    console.log(`[${i + 1}] ID: ${u._id} | Name: "${u.name}" | Email: "${u.email}" | Role: ${u.role}`);
  });

  const assignments = await QuoteAssignment.find({}).populate("quote", "text author").populate("user", "name email").populate("tag", "tagCode").lean();
  console.log(`\nTotal QuoteAssignments: ${assignments.length}`);
  assignments.forEach((a, i) => {
    console.log(`[${i + 1}] ID: ${a._id} | Type: ${a.assignmentType} | Quote: "${a.quote?.text?.substring(0, 30)}" | Tag: ${a.tag?.tagCode} | User: ${a.user?.name || a.user?._id || a.user} (ID: ${a.user?._id || a.user}) | Active: ${a.isActive}`);
  });

  await mongoose.disconnect();
}

inspect().catch(err => {
  console.error("Error inspecting:", err);
  process.exit(1);
});
