const mongoose = require("mongoose");
const AppError = require("../utils/AppError");

const validateId = (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    throw new AppError("Invalid ID format", 400);
  }
  next();
};

module.exports = validateId;
