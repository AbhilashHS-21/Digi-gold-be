import prisma from '../utils/prismaClient.js'; // Correct import

export const checkMarketOpen = async (req, res, next) => {
  try {
    const marketStatus = await prisma.marketStatus.findFirst({
      orderBy: { createdAt: 'desc' }
    });
    
    if (!marketStatus || marketStatus.status === 'closed') {
      return res.status(403).json({
        message: marketStatus?.message || 'Market is currently closed',
        marketOpen: false
      });
    }
    
    req.marketOpen = true;
    next();
  } catch (error) {
    console.error('Error checking market status:', error);
    // You might want to handle this differently - maybe allow transactions when DB is down?
    next();
  }
};