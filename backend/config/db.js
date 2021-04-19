// Database configuration
const dotenv = require("dotenv");
dotenv.config();
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    console.log("this ->", process.env.PORT);
    const connect = await mongoose.connect(MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
    });
    console.log(
      `--------Connected to MongoDB at: ${connect.connection.host}-------`
    );
  } catch {
    // console.log(`Error: ${err.messags}`);
    // process.exit(1);
    console.log("Not connected!");
  }
};

connectDB();

module.exports = { connectDB };
