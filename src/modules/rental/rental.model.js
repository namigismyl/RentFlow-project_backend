const mongoose = require("mongoose");

const returnEntrySchema = new mongoose.Schema({
  returnDate: { type: Date, required: true },
  quantity: { type: Number, required: true, min: 1 },
  amount: { type: Number, required: true, min: 0 },
});

const rentalItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  remainingQuantity: {
    type: Number,
    required: true,
    min: 0,
  },
  returnedQuantity: {
    type: Number,
    default: 0,
    min: 0,
  },
  monthlyPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  startDate: {
    type: Date,
    required: true,
  },
  originalStartDate: {
    type: Date,
    required: true,
  },
  totalAmount: {
    type: Number,
    default: 0,
  },
  returns: {
    type: [returnEntrySchema],
    default: [],
  },
});

const rentalSchema = new mongoose.Schema(
  {
    customer: {
      type: String,
      required: true,
      trim: true,
    },
    items: [rentalItemSchema],
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "COMPLETED", "CANCELLED"],
      default: "ACTIVE",
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Rental", rentalSchema);
