const calculateSegment = (start, end, quantity, monthlyPrice) => {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const lastDayOfMonth = new Date(
    startDate.getFullYear(),
    startDate.getMonth() + 1,
    0
  ).getDate();

  const isFullMonth =
    startDate.getDate() === 1 &&
    endDate.getDate() === lastDayOfMonth &&
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getFullYear() === endDate.getFullYear();

  if (isFullMonth) {
    return quantity * monthlyPrice;
  }

  const startUTC = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endUTC = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const days = (endUTC - startUTC) / (1000 * 60 * 60 * 24) + 1;
  return quantity * days * (monthlyPrice / 30);
};

module.exports = calculateSegment;
