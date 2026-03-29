const express = require("express");
const router = express.Router();
const rentalController = require("./rental.controller");
const auth = require("../../middleware/auth");
const validate = require("../../middleware/validate");
const validateId = require("../../middleware/validateId");

router.post(
  "/",
  auth,
  validate({
    customer: { required: true, type: "string" },
    items: { required: true, type: "array" },
    startDate: { required: true },
  }),
  rentalController.create
);

router.get("/", auth, rentalController.getAll);
router.get("/:id", auth, validateId, rentalController.getById);

router.patch(
  "/:id/return",
  auth,
  validateId,
  validate({
    itemId: { required: true, type: "string" },
    returnQuantity: { required: true, type: "number", min: 1 },
    returnDate: { required: true },
  }),
  rentalController.partialReturn
);

router.patch(
  "/:id/close",
  auth,
  validateId,
  validate({
    closeDate: { required: true },
  }),
  rentalController.close
);

module.exports = router;
