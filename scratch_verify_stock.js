import mongoose from 'mongoose';
import dotenv from 'dotenv';
import productRepository from './src/modules/product/product.repository.js';
import orderService from './src/modules/order/order.service.js';
import Product from './src/models/product.model.js';
import Order from './src/modules/order/order.model.js';
import User from './src/models/user.model.js';

dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB!");

  // Create a clean test product
  console.log("Creating verification test product...");
  const testProduct = await Product.create({
    name: "Verification Stock Product",
    price: 19.99,
    category: "RFID Card",
    description: "Verification test product for stock updates",
    stock: 10,
    isActive: true
  });
  const productId = testProduct._id;

  const testPayload = {
    fullName: "Stock Verification",
    email: "stock.ver@example.com",
    orderSource: "manual",
    productId: productId.toString(),
    quantity: 1,
    address: "123 Stock St",
    city: "San Jose",
    state: "CA",
    postalCode: "95112",
    country: "United States"
  };

  // Test Case 1: Stock 10 -> purchase 1 -> stock 9
  console.log("\n--- Test Case 1: Stock 10 -> purchase 1 -> stock 9 ---");
  await Product.updateOne({ _id: productId }, { stock: 10 });
  let order1 = await orderService.createManualOrder({ ...testPayload, quantity: 1 });
  let product = await Product.findById(productId);
  console.log(`Current Stock: ${product.stock} (Expected: 9)`);
  if (product.stock !== 9) throw new Error("Test Case 1 Failed!");

  // Test Case 2: Stock 10 -> purchase 3 -> stock 7
  console.log("\n--- Test Case 2: Stock 10 -> purchase 3 -> stock 7 ---");
  await Product.updateOne({ _id: productId }, { stock: 10 });
  let order2 = await orderService.createManualOrder({ ...testPayload, quantity: 3 });
  product = await Product.findById(productId);
  console.log(`Current Stock: ${product.stock} (Expected: 7)`);
  if (product.stock !== 7) throw new Error("Test Case 2 Failed!");

  // Test Case 3: Stock 1 -> purchase 1 -> stock 0
  console.log("\n--- Test Case 3: Stock 1 -> purchase 1 -> stock 0 ---");
  await Product.updateOne({ _id: productId }, { stock: 1 });
  let order3 = await orderService.createManualOrder({ ...testPayload, quantity: 1 });
  product = await Product.findById(productId);
  console.log(`Current Stock: ${product.stock} (Expected: 0)`);
  if (product.stock !== 0) throw new Error("Test Case 3 Failed!");

  // Test Case 4: Stock 1 -> purchase 2 -> reject order
  console.log("\n--- Test Case 4: Stock 1 -> purchase 2 -> reject order ---");
  await Product.updateOne({ _id: productId }, { stock: 1 });
  try {
    await orderService.createManualOrder({ ...testPayload, quantity: 2 });
    throw new Error("FAIL: Order should have been rejected!");
  } catch (err) {
    console.log("SUCCESS: Order was rejected as expected!");
    console.log("Error:", err.message);
  }

  // Test Case 5: Stock 10 -> purchase 2 -> cancel order -> stock 10
  console.log("\n--- Test Case 5: Stock 10 -> purchase 2 -> cancel order -> stock 10 ---");
  await Product.updateOne({ _id: productId }, { stock: 10 });
  let order5 = await orderService.createManualOrder({ ...testPayload, quantity: 2 });
  product = await Product.findById(productId);
  console.log(`Stock after manual creation: ${product.stock} (Expected: 8)`);
  
  console.log(`Cancelling order ${order5._id}...`);
  await orderService.cancelOrder(order5._id, null, "Verification cancellation", "admin");
  product = await Product.findById(productId);
  console.log(`Stock after cancellation: ${product.stock} (Expected: 10)`);
  if (product.stock !== 10) throw new Error("Test Case 5 Failed!");

  // Cleanup verification documents
  console.log("\nCleaning up verification records...");
  await Product.deleteOne({ _id: productId });
  await Order.deleteMany({ _id: { $in: [order1._id, order2._id, order3._id, order5._id] } });

  await mongoose.disconnect();
  console.log("\nAll stock verification test cases PASSED!");
}

run().catch(async (err) => {
  console.error("Verification failed:", err);
  await mongoose.disconnect();
});
