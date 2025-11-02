import prisma from "../config/db.js";

/**
 * Creates a new price entry in the database.
 */
export const addNewPrice = async (req, res) => {
  try {
    const { gold24K, gold22K, silver } = req.body;

    // Check for missing values and return early
    if (!gold24K || !gold22K || !silver) {
      return res.status(400).json({ message: "Prices not found" });
    }

    const price = await prisma.AdminPrice.create({
      data: { gold24K, gold22K, silver },
    });

    res.status(201).json({ message: "Prices Updated", price });
  } catch (err) {
    // It's generally better to log the full error for debugging
    console.error("Error adding new price:", err);
    res
      .status(500)
      .json({ message: "Failed to update prices", error: err.message });
  }
};

/**
 * Retrieves the latest price entry based on the 'updatedAt' timestamp.
 */
export const getlatestPrice = async (req, res) => {
  try {
    const latestPrice = await prisma.AdminPrice.findFirst({
      orderBy: {
        updated_at: "desc",
      },
    });

    // Handle case where no prices exist
    if (!latestPrice) {
      return res.status(404).json({ message: "No price records found" });
    }

    res.status(200).json({ latestPrice });
  } catch (err) {
    console.error("Error fetching latest price:", err);
    res
      .status(500)
      .json({ message: "Failed to fetch latest price", error: err.message });
  }
};
