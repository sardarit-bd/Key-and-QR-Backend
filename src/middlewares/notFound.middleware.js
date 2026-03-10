import httpStatus from "../constants/httpStatus.js";


const notFoundHandler = (req, res) => {
  res.status(httpStatus.NOT_FOUND).json({
    success: false,
    message: "API route not found",
    data: null,
  });
};

export default notFoundHandler;