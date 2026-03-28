const rentalService = require("./rental.service");

const create = async (req, res, next) => {
  try {
    const result = await rentalService.create(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

const getAll = async (req, res, next) => {
  try {
    const result = await rentalService.getAll();
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

const getById = async (req, res, next) => {
  try {
    const result = await rentalService.getById(req.params.id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

const partialReturn = async (req, res, next) => {
  try {
    const result = await rentalService.partialReturn(req.params.id, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

const close = async (req, res, next) => {
  try {
    const result = await rentalService.close(req.params.id, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  create,
  getAll,
  getById,
  partialReturn,
  close,
};
