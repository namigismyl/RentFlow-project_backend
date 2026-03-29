const express = require("express");
const router = express.Router();
const productController = require("./product.controller");
const auth = require("../../middleware/auth");
const validate = require("../../middleware/validate");
const validateId = require("../../middleware/validateId");

router.post(
  "/",
  auth,
  validate({
    name: { required: true, type: "string" },
    totalQuantity: { required: true, type: "number", min: 1 },
    monthlyPrice: { required: true, type: "number", min: 1 },
  }),
  productController.create
);

router.get("/", auth, productController.getAll);
router.get("/:id", auth, validateId, productController.getById);

router.put(
  "/:id",
  auth,
  validateId,
  validate({
    name: { type: "string" },
    totalQuantity: { type: "number", min: 1 },
    monthlyPrice: { type: "number", min: 1 },
  }),
  productController.update
);

router.delete("/:id", auth, validateId, productController.remove);

module.exports = router;
