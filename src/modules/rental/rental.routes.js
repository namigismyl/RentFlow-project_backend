const express = require("express");
const router = express.Router();
const rentalController = require("./rental.controller");
const auth = require("../../middleware/auth");

router.post("/", auth, rentalController.create);
router.get("/", auth, rentalController.getAll);
router.get("/:id", auth, rentalController.getById);
router.patch("/:id/return", auth, rentalController.partialReturn);
router.patch("/:id/close", auth, rentalController.close);

module.exports = router;
