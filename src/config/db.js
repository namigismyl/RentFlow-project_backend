const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.CS);
    console.log("MongoDB connected");
  } catch (err) {
    console.log("MongoDB error");
    process.exit(1);
  }
};

module.exports = connectDB;