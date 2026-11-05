const app = require("../app");
const connectToDB = require("../DataBase/db");

module.exports = async (req, res) => {
  try {
    await connectToDB();
  } catch (_dbError) {
    return res.status(503).json({
      status: "error",
      message: "Database connection failed",
      timestamp: new Date().toISOString(),
    });
  }
  return app(req, res);
};
