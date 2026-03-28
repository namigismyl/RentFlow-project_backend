const User = require("./auth.model");
const bcrypt = require("bcryptjs");
const AppError = require("../../utils/AppError");

const register = async (data) => {
  const { name, email, password } = data;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new AppError("Email already registered", 400);
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({ name, email, password: hashedPassword });

  return { _id: user._id, name: user.name, email: user.email };
};

const jwt = require("jsonwebtoken");

const login = async (data) => {
  const { email, password } = data;

  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new AppError("Invalid email or password", 401);
  }

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  return { token, user: { _id: user._id, name: user.name, email: user.email } };
};

module.exports = {
  register,
  login,
};
