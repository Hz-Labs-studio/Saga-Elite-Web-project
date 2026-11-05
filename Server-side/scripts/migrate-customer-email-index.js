const mongoose = require("mongoose");
const connectToDB = require("../DataBase/db");
const Customer = require("../Models/Customer");
const logger = require("../Utils/logger");

const migrateCustomerEmailIndex = async () => {
  try {
    await connectToDB();
    logger.info("Starting customer email index migration...");

    const customerIndexes = await Customer.collection.indexes();
    const hasEmailIndex = customerIndexes.some((idx) => idx.name === "email_1");

    if (hasEmailIndex) {
      await Customer.collection.dropIndex("email_1");
      logger.info("Dropped stale email_1 index on customers");
    }

    const dupNullCustomers = await Customer.aggregate([
      { $match: { email: null, type: "guest" } },
      { $group: { _id: "$guestToken", ids: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]);

    for (const group of dupNullCustomers) {
      const [keep, ...remove] = group.ids;
      await Customer.deleteMany({ _id: { $in: remove } });
      logger.info("Cleaned duplicate null-email customers", {
        kept: String(keep),
        removed: remove.length,
      });
    }

    await Customer.syncIndexes();
    logger.info("Customer indexes synchronized successfully.");
  } catch (error) {
    logger.error("Migration failed", { error: error?.message || String(error) });
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    logger.info("Migration complete. Disconnected from database.");
  }
};

if (require.main === module) {
  migrateCustomerEmailIndex();
}

module.exports = migrateCustomerEmailIndex;
