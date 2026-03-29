const Rental = require("./rental.model");
const Product = require("../product/product.model");
const AppError = require("../../utils/AppError");

const create = async (data) => {
  const { customer, items, startDate } = data;

  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError("Items must be a non-empty array", 400);
  }

  // Pass 1 — read-only validation, no mutations
  const validatedProducts = [];
  for (const item of items) {
    if (!item.quantity || !Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new AppError("Each item quantity must be an integer >= 1", 400);
    }
    const product = await Product.findById(item.productId);
    if (!product) {
      throw new AppError(`Product not found: ${item.productId}`, 404);
    }
    if (!product.isActive) {
      throw new AppError(`Product is not available: ${product.name}`, 400);
    }
    if (item.quantity > product.availableQuantity) {
      throw new AppError(`Insufficient stock for: ${product.name}`, 400);
    }
    validatedProducts.push({ product, item });
  }

  // Pass 2 — all items valid, now mutate
  const builtItems = [];
  for (const { product, item } of validatedProducts) {
    product.availableQuantity -= item.quantity;
    await product.save();

    builtItems.push({
      product: product._id,
      quantity: item.quantity,
      remainingQuantity: item.quantity,
      returnedQuantity: 0,
      monthlyPrice: product.monthlyPrice,
      startDate: new Date(startDate),
      originalStartDate: new Date(startDate),
      totalAmount: 0,
      returns: [],
    });
  }

  const rental = await Rental.create({
    customer,
    items: builtItems,
    startDate: new Date(startDate),
  });

  return rental;
};

const getAll = async () => {
  return await Rental.find()
    .populate("items.product", "name monthlyPrice")
    .sort({ createdAt: -1 });
};

const getById = async (id) => {
  const rental = await Rental.findById(id).populate(
    "items.product",
    "name monthlyPrice"
  );
  if (!rental) {
    throw new AppError("Rental not found", 404);
  }
  return rental;
};

const calculatePeriod = require("../../utils/calculatePeriod");

const partialReturn = async (rentalId, data) => {
  const { itemId, returnQuantity, returnDate } = data;

  const rental = await Rental.findById(rentalId);
  if (!rental) {
    throw new AppError("Rental not found", 404);
  }

  if (rental.status !== "ACTIVE") {
    throw new AppError("Rental is not active", 400);
  }

  const item = rental.items.id(itemId);
  if (!item) {
    throw new AppError("Rental item not found", 404);
  }

  if (returnQuantity > item.remainingQuantity) {
    throw new AppError("Return quantity exceeds remaining quantity", 400);
  }

  if (new Date(returnDate) < new Date(item.startDate)) {
    throw new AppError("Return date cannot be before item start date", 400);
  }

  const amount = calculatePeriod(item.startDate, returnDate, returnQuantity, item.monthlyPrice);

  item.totalAmount += amount;
  item.remainingQuantity -= returnQuantity;
  item.returnedQuantity += returnQuantity;
  item.startDate = new Date(returnDate);
  item.returns.push({ returnDate: new Date(returnDate), quantity: returnQuantity, amount });

  const product = await Product.findById(item.product);
  if (product) {
    product.availableQuantity += returnQuantity;
    await product.save();
  }

  rental.totalAmount = rental.items.reduce((sum, i) => sum + i.totalAmount, 0);

  await rental.save();
  return rental;
};

const close = async (rentalId, data) => {
  const { closeDate } = data;

  const rental = await Rental.findById(rentalId);
  if (!rental) {
    throw new AppError("Rental not found", 404);
  }

  if (rental.status !== "ACTIVE") {
    throw new AppError("Rental is not active", 400);
  }

  for (const item of rental.items) {
    if (item.remainingQuantity > 0) {
      const amount = calculatePeriod(item.startDate, closeDate, item.remainingQuantity, item.monthlyPrice);

      item.totalAmount += amount;

      const product = await Product.findById(item.product);
      if (product) {
        product.availableQuantity += item.remainingQuantity;
        await product.save();
      }

      item.returnedQuantity += item.remainingQuantity;
      item.remainingQuantity = 0;
      item.startDate = new Date(closeDate);
    }
  }

  rental.status = "COMPLETED";
  rental.endDate = new Date(closeDate);
  rental.totalAmount = rental.items.reduce((sum, i) => sum + i.totalAmount, 0);

  await rental.save();
  return rental;
};

module.exports = {
  create,
  getAll,
  getById,
  partialReturn,
  close,
};
