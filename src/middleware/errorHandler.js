const errorHandler = (err, req, res, next) => {
  // Mongoose CastError — invalid ObjectId format in a query
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: "Invalid ID format",
    });
  }

  // Mongoose ValidationError — schema constraint violated (e.g. min, required, enum)
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      statusCode: 400,
      message: messages.join(", "),
    });
  }

  // AppError — intentional errors thrown in services/middleware
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
  });
};

module.exports = errorHandler;
