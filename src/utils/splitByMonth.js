const splitByMonth = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const segments = [];
  let cursor = new Date(start);

  while (cursor <= end) {
    const endOfMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const segmentEnd = endOfMonth < end ? endOfMonth : end;

    segments.push({ start: new Date(cursor), end: new Date(segmentEnd) });

    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return segments;
};

module.exports = splitByMonth;
