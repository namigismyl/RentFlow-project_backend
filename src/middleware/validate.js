const AppError = require("../utils/AppError");

const validate = (rules) => (req, res, next) => {
  const errors = [];

  for (const [field, rule] of Object.entries(rules)) {
    const value = req.body[field];
    const missing = value === undefined || value === null || value === "";

    if (rule.required && missing) {
      errors.push(rule.message || `${field} is required`);
      continue;
    }

    if (missing) continue;

    if (rule.type === "string" && typeof value !== "string") {
      errors.push(`${field} must be a string`);
    }

    if (rule.type === "number" && typeof value !== "number") {
      errors.push(`${field} must be a number`);
    }

    if (rule.type === "array" && !Array.isArray(value)) {
      errors.push(`${field} must be an array`);
    }

    if (rule.min !== undefined && typeof value === "string" && value.length < rule.min) {
      errors.push(`${field} must be at least ${rule.min} characters`);
    }

    if (rule.min !== undefined && typeof value === "number" && value < rule.min) {
      errors.push(`${field} must be at least ${rule.min}`);
    }

    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push(rule.message || `${field} is invalid`);
    }
  }

  if (errors.length > 0) {
    throw new AppError(errors.join(", "), 400);
  }

  next();
};

module.exports = validate;
