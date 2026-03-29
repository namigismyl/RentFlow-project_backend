const splitByMonth = require("./splitByMonth");
const calculateSegment = require("./calculateSegment");

const calculatePeriod = (startDate, endDate, quantity, monthlyPrice) => {
  const segments = splitByMonth(startDate, endDate);

  let total = 0;
  for (const segment of segments) {
    total += calculateSegment(segment.start, segment.end, quantity, monthlyPrice);
  }

  return Math.round(total * 100) / 100;
};

module.exports = calculatePeriod;
