const sendResponse = (res, payload) => {
  const {
    statusCode = 200,
    success = true,
    message = "",
    data = null,
    meta = null,
  } = payload;

  res.status(statusCode).json({
    success,
    message,
    meta,
    data,
  });
};

export default sendResponse;