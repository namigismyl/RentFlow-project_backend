const Product = require("./product.model");
const AppError = require("../../utils/AppError");

const create = async (data) => {
  if (data.availableQuantity === undefined) {
    data.availableQuantity = data.totalQuantity;
  }

  return await Product.create(data);
};

const getAll = async () => {
  return await Product.find({ isActive: true }).sort({ createdAt: -1 });
};

const getById = async (id) => {
  const product = await Product.findById(id);
  if (!product) {
    throw new AppError("Product not found", 404);
  }
  return product;
};

const update = async (id, data) => {
  const product = await Product.findById(id);
  if (!product) {
    throw new AppError("Product not found", 404);
  }

  if (data.totalQuantity !== undefined && data.totalQuantity !== product.totalQuantity) {
    const rentedCount = product.totalQuantity - product.availableQuantity;
    if (data.totalQuantity < rentedCount) {
      throw new AppError("Cannot reduce total below currently rented quantity", 400);
    }
    data.availableQuantity = data.totalQuantity - rentedCount;
  }

  return await Product.findByIdAndUpdate(id, data, { returnDocument: "after", runValidators: true });
};

const remove = async (id) => {
  const product = await Product.findById(id);
  if (!product) {
    throw new AppError("Product not found", 404);
  }

  product.isActive = false;
  await product.save();

  return product;
};

module.exports = {
  create,
  getAll,
  getById,
  update,
  remove,
};
