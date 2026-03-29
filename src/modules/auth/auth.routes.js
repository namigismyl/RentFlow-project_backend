const express = require("express");
const router = express.Router();
const authController = require("./auth.controller");
const validate = require("../../middleware/validate");

router.post(
  "/register",
  validate({
    name: { required: true, type: "string" },
    email: { required: true, type: "string", pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Valid email is required" },
    password: { required: true, type: "string", min: 6 },
  }),
  authController.register
);

router.post(
  "/login",
  validate({
    email: { required: true },
    password: { required: true },
  }),
  authController.login
);

module.exports = router;
